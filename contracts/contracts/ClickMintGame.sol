// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CLICK} from "./CLICK.sol";
import {BinaryTrophyNFT} from "./BinaryTrophyNFT.sol";

/// @title ClickMintGame — ETH credits, fee split, rate-limited clicks, hourly ETH POT.
/// @dev Randomness: block.prevrandao + salt — upgrade to Chainlink VRF for mainnet fairness.
/// Constructor economy + `clicksPerHashTier` are set at deploy from `DEPLOY_ECONOMY` (**testnet** vs **mainnet** in `scripts/config/economy.ts`). Owner may later `setEconomy` / `setAddresses`; hash tier stays immutable.
/// POT winners receive **accumulated POT ETH** (`potEthByHour` + `potCarry`), not minted $CLICK.
contract ClickMintGame is Ownable, ReentrancyGuard, Pausable {
    CLICK public immutable clickToken;

    address payable public treasury;
    address payable public secretWallet;

    /// @notice ~20s after each UTC hour boundary before the next game hour ticks (reset buffer).
    uint256 public constant RESET_BUFFER = 20;
    uint256 public constant BPS = 10_000;
    /// @dev 3% total: 1% treasury / 1% pot (ETH) / 1% secret. Credits are still granted on full `msg.value`.
    uint256 public constant FEE_EACH_BPS = 100;

    uint256 public constant MAX_CLICKS_PER_BLOCK = 2;
    /// @notice Minimum clicks in a game hour to qualify for POT (deploy: testnet often lower for QA; mainnet typically 100).
    uint256 public immutable minPotClicks;
    /// @notice Global clicks per game hour — every N clicks adds one required leading-zero bit (cap 4) for click hash.
    uint256 public immutable clicksPerHashTier;

    mapping(uint256 hourId => uint256) public totalClicksInHour;

    /// @notice Legacy economy slot (still in `setEconomy` for ABI compat). **Not used for POT** — POT pays raw accumulated ETH.
    uint256 public clickPerEthWei;

    uint256 public clickCostCredits;
    uint256 public baseClickReward;
    /// @notice Trophy mint probability per successful click (basis points of `BPS`). 0 = no auto-mints.
    uint256 public trophyDropBps;

    /// @notice Last pot settlement (game hour id).
    mapping(uint256 hourId => bool) public hourFinalized;
    mapping(uint256 hourId => address) public hourWinner;
    /// @notice ETH wei sent to the POT winner for this hour after `finalizeHour` (0 if none / no winner).
    mapping(uint256 hourId => uint256) public hourPayout;
    /// @notice Start UTC minute (0–44) of the winning 15-minute span for this hour after `finalizeHour`. Not valid until finalized.
    mapping(uint256 hourId => uint8) public hourWinWindow;

    mapping(address => uint256) public credits;
    mapping(uint256 hourId => mapping(address => uint256)) public clicksInHour;
    /// @notice Bit `m` set if player clicked at least once in UTC minute `m` (0–59) of this game hour. Used for POT overlap with random span.
    mapping(uint256 hourId => mapping(address => uint64)) public minuteMask;
    mapping(uint256 hourId => mapping(address => bool)) internal _hourListed;
    mapping(uint256 hourId => address[]) internal _participants;

    /// @notice ETH (wei) reserved for POT for a specific game hour (1% fee slice on deposits).
    mapping(uint256 hourId => uint256) public potEthByHour;
    /// @notice Rolled-forward POT ETH when an hour finalizes with no eligible winner.
    uint256 public potCarry;
    uint256 internal _potNonce;

    mapping(address => mapping(uint256 => uint8)) internal _clicksInBlock;

    /// @notice EOA (player) => smart account (or other executor) allowed to call `clickFor` / `depositFor` for them.
    mapping(address => address) public clickExecutor;

    /// @notice Optional trophy collection; zero disables on-chain trophy mints from the game.
    BinaryTrophyNFT public trophyNft;

    event Deposited(address indexed user, uint256 ethIn, uint256 creditsOut);
    /// @param minute UTC minute 0–59 within the game hour when this click was mined.
    event Clicked(address indexed user, uint256 hourId, uint256 totalForUserHour, uint8 minute);
    /// @param winStartMinute UTC minute 0–44; winning span is `[winStartMinute, winStartMinute + 14]` inclusive (15 minutes), within the same calendar hour.
    /// @param ethPayout ETH wei sent to `winner` (0 if no eligible winner).
    event PotWin(uint256 indexed hourId, address indexed winner, uint256 ethPayout, uint8 winStartMinute, bytes32 entropy);
    event AddressesUpdated(address indexed treasury, address indexed secret);
    event EconomyUpdated(uint256 clickPerEthWei, uint256 clickCostCredits, uint256 baseClickReward);
    event ClickExecutorSet(address indexed player, address indexed executor);
    event TrophyNftSet(address indexed trophy);
    event TrophyDropBpsUpdated(uint256 bps);
    event PotCarrySwept(address indexed to, uint256 amount);
    /// @notice Emitted in addition to OpenZeppelin `Pausable` **Paused** event (same transition).
    event GamePaused(address indexed by);
    /// @notice Emitted in addition to OpenZeppelin `Pausable` **Unpaused** event (same transition).
    event GameUnpaused(address indexed by);
    event TrophyMintedViaGame(address indexed to, uint64 totalClicks, uint8 fragmentSlot);

    error GameZeroTrophyAddr();

    error GameBadAddr();
    error GameBadParam();
    error GameBadExecutor();
    error GameCooldown();
    error GameCredits();
    error GameFinalizeEarly();
    error GameAlreadyFinalized();
    error GameBadBps();
    error GameUnauthorizedCaller();

    /// @notice Optional address allowed to call `finalizeHour` (e.g. Gelato / Chainlink Automation forwarder). Zero = owner only.
    address public potKeeper;

    event PotKeeperSet(address indexed keeper);

    constructor(
        address initialOwner,
        CLICK click_,
        address payable treasury_,
        address payable secretWallet_,
        uint256 clickPerEthWei_,
        uint256 clickCostCredits_,
        uint256 baseClickReward_,
        uint256 clicksPerHashTier_,
        uint256 trophyDropBps_,
        uint256 minPotClicks_
    ) Ownable(initialOwner) {
        if (address(click_) == address(0)) revert GameBadAddr();
        if (clicksPerHashTier_ == 0) revert GameBadParam();
        if (minPotClicks_ == 0) revert GameBadParam();
        if (trophyDropBps_ > BPS) revert GameBadBps();
        clickToken = click_;
        treasury = treasury_;
        secretWallet = secretWallet_;
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
        clicksPerHashTier = clicksPerHashTier_;
        trophyDropBps = trophyDropBps_;
        minPotClicks = minPotClicks_;
    }

    function setAddresses(address payable treasury_, address payable secretWallet_) external onlyOwner whenNotPaused {
        treasury = treasury_;
        secretWallet = secretWallet_;
        emit AddressesUpdated(treasury_, secretWallet_);
    }

    /// @notice Set who may call `finalizeHour` besides `owner`. Use a dedicated automation/relayer address; set to zero to disable.
    /// @dev Intentionally **not** `whenNotPaused`: if a keeper key is compromised, owner must be able to rotate or clear it **while paused**
    /// before unpausing (otherwise a bad keeper could race `finalizeHour` on unpause). `finalizeHour` itself stays `whenNotPaused`.
    function setPotKeeper(address k) external onlyOwner {
        potKeeper = k;
        emit PotKeeperSet(k);
    }

    modifier onlyOwnerOrPotKeeper() {
        if (msg.sender == owner()) {
            _;
        } else if (potKeeper != address(0) && msg.sender == potKeeper) {
            _;
        } else {
            revert GameUnauthorizedCaller();
        }
    }

    function setEconomy(uint256 clickPerEthWei_, uint256 clickCostCredits_, uint256 baseClickReward_) external onlyOwner whenNotPaused {
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
        emit EconomyUpdated(clickPerEthWei_, clickCostCredits_, baseClickReward_);
    }

    function setTrophyNft(address trophy_) external onlyOwner whenNotPaused {
        trophyNft = BinaryTrophyNFT(payable(trophy_));
        emit TrophyNftSet(trophy_);
    }

    /// @notice Tune per-click trophy drop rate (basis points of 10_000). Use 0 to disable auto-mints.
    function setTrophyDropBps(uint256 bps) external onlyOwner whenNotPaused {
        if (bps > BPS) revert GameBadBps();
        trophyDropBps = bps;
        emit TrophyDropBpsUpdated(bps);
    }

    /// @notice Pause gameplay (`deposit`, clicks, `setClickExecutor`, `finalizeHour`, economy/trophy admin).
    /// @dev Also emits OpenZeppelin **Paused(account)**; use **isPaused()** or `paused()` to read state.
    function pause() external onlyOwner {
        _pause();
        emit GamePaused(msg.sender);
    }

    /// @notice Unpause; restores normal operation.
    /// @dev Also emits OpenZeppelin **Unpaused(account)**.
    function unpause() external onlyOwner {
        _unpause();
        emit GameUnpaused(msg.sender);
    }

    /// @return True if the game is emergency-paused (alias for `paused()`).
    function isPaused() public view returns (bool) {
        return paused();
    }

    /// @notice Link your EOA to a smart account for sponsored `clickFor` / `depositFor` (set `address(0)` to revoke).
    function setClickExecutor(address executor) external whenNotPaused {
        clickExecutor[msg.sender] = executor;
        emit ClickExecutorSet(msg.sender, executor);
    }

    function gameHour(uint256 ts) public pure returns (uint256) {
        if (ts <= RESET_BUFFER) return 0;
        return (ts - RESET_BUFFER) / 3600;
    }

    /// @dev Calendar minute 0..59 within the UTC hour.
    function _minuteInUtcHour(uint256 ts) internal pure returns (uint256) {
        return (ts % 3600) / 60;
    }

    /// @dev UTC minute 0..59 within the calendar hour (`ts` in unix seconds).
    function minuteOfUtcHour(uint256 ts) public pure returns (uint8) {
        return uint8(_minuteInUtcHour(ts));
    }

    /// @dev 15 consecutive UTC minutes starting at `start` (0–44); mask has bits `start..start+14` set.
    function _eligibleSpanMask(uint8 start) internal pure returns (uint64 m) {
        unchecked {
            for (uint256 i; i < 15; ++i) {
                m |= uint64(1) << uint64(start + i);
            }
        }
    }

    /// @dev Extra game credits on larger single deposits (same wei units as `credits`). Tiers: 1%..10% of deposit.
    function _depositBonusWei(uint256 v) internal pure returns (uint256) {
        if (v >= 1 ether) return (v * 1000) / BPS;
        if (v >= 0.5 ether) return (v * 700) / BPS;
        if (v >= 0.25 ether) return (v * 500) / BPS;
        if (v >= 0.1 ether) return (v * 300) / BPS;
        if (v >= 0.01 ether) return (v * 100) / BPS;
        return 0;
    }

    /// @notice Split fees, grant credits (deposit + tier bonus), accrue POT in ETH — credits `msg.sender`.
    function deposit() external payable nonReentrant whenNotPaused {
        _deposit(msg.sender, msg.value);
    }

    /// @notice Same as `deposit()` but credits `player` (EOA). Caller must be `player` or their `clickExecutor`.
    function depositFor(address player) external payable nonReentrant whenNotPaused {
        if (msg.sender != player && msg.sender != clickExecutor[player]) revert GameBadExecutor();
        _deposit(player, msg.value);
    }

    function _deposit(address creditTo, uint256 v) internal {
        require(v > 0, "game: eth");
        uint256 ft = (v * FEE_EACH_BPS) / BPS;
        uint256 fp = (v * FEE_EACH_BPS) / BPS;
        uint256 fs = (v * FEE_EACH_BPS) / BPS;
        uint256 fees = ft + fp + fs;
        require(fees <= v, "game: fee");

        (bool okT,) = treasury.call{value: ft}("");
        (bool okS,) = secretWallet.call{value: fs}("");
        require(okT && okS, "game: fee send");

        uint256 bonus = _depositBonusWei(v);
        credits[creditTo] += v + bonus;

        uint256 hid = gameHour(block.timestamp);
        potEthByHour[hid] += fp;

        emit Deposited(creditTo, v, v + bonus);
    }

    /// @notice One click for `msg.sender` (typical EOA path).
    function click() external nonReentrant whenNotPaused {
        _click(msg.sender);
    }

    /// @notice Sponsored / smart-account path: applies click logic to `player` (must be `clickExecutor[player]`).
    function clickFor(address player) external nonReentrant whenNotPaused {
        if (msg.sender != clickExecutor[player]) revert GameBadExecutor();
        _click(player);
    }

    function _click(address player) internal {
        uint256 cost = clickCostCredits;
        if (cost > 0) {
            if (credits[player] < cost) revert GameCredits();
            credits[player] -= cost;
        }

        uint256 bn = block.number;
        if (_clicksInBlock[player][bn] >= MAX_CLICKS_PER_BLOCK) revert GameCooldown();
        unchecked {
            _clicksInBlock[player][bn]++;
        }

        uint256 hid = gameHour(block.timestamp);
        uint256 m = _minuteInUtcHour(block.timestamp);
        require(m < 60, "game: minute");
        uint8 minute = uint8(m);

        uint256 c = clicksInHour[hid][player] + 1;
        clicksInHour[hid][player] = c;
        totalClicksInHour[hid]++;
        minuteMask[hid][player] |= uint64(1) << uint64(minute);

        uint256 tier = totalClicksInHour[hid] / clicksPerHashTier;
        uint256 needBits = tier > 4 ? 4 : tier;
        if (needBits > 0) {
            uint256 h = uint256(
                keccak256(abi.encodePacked(player, hid, c, block.number, block.timestamp, block.prevrandao))
            );
            require(h >> (256 - needBits) == 0, "game: clickhash");
        }

        if (!_hourListed[hid][player]) {
            _hourListed[hid][player] = true;
            _participants[hid].push(player);
        }

        emit Clicked(player, hid, c, minute);

        uint256 reward = baseClickReward;
        if (reward > 0) clickToken.grantVested(player, reward);

        BinaryTrophyNFT tn = trophyNft;
        uint256 dropBps = trophyDropBps;
        if (address(tn) != address(0) && dropBps > 0) {
            bytes32 roll = keccak256(
                abi.encodePacked(player, hid, c, block.number, block.timestamp, block.prevrandao, address(this), "TROPHY")
            );
            if (uint256(roll) % BPS < dropBps) {
                uint8 frag = uint8((uint256(roll) >> 128) % 256);
                uint64 tc = uint64(c > type(uint64).max ? type(uint64).max : c);
                try tn.mintTrophyForPlayer(player, tc, frag) {} catch {}
            }
        }
    }

    /// @notice After a game hour ends (+ RESET_BUFFER), finalize POT for `hourId` (owner / ops only).
    /// @dev Open `finalizeHour` for everyone would encourage MEV races around pseudo-random entropy. **`owner`** or
    /// **`potKeeper`** (automation relay) may finalize. Set `potKeeper` to a Gelato/Chainlink forwarder or dedicated bot.
    /// Pseudo-random window + winner — acceptable for testnet; VRF optional for stronger mainnet fairness.
    function finalizeHour(uint256 hourId) external nonReentrant onlyOwnerOrPotKeeper whenNotPaused {
        uint256 cutoff = (hourId + 1) * 3600 + RESET_BUFFER;
        if (block.timestamp < cutoff) revert GameFinalizeEarly();
        if (hourFinalized[hourId]) revert GameAlreadyFinalized();

        hourFinalized[hourId] = true;
        _potNonce++;

        bytes32 entropy = keccak256(
            abi.encodePacked(block.prevrandao, hourId, address(this), block.timestamp, _potNonce, block.number)
        );
        /// Random start minute 0..44 so the 15-minute span stays within the hour (minutes 0..59).
        uint8 winStartMinute = uint8(uint256(entropy) % 45);
        uint64 eligible = _eligibleSpanMask(winStartMinute);

        address[] storage parts = _participants[hourId];
        address[] memory cand = new address[](parts.length);
        uint256 n = 0;
        for (uint256 i = 0; i < parts.length; ++i) {
            address a = parts[i];
            if (clicksInHour[hourId][a] < minPotClicks) continue;
            if ((minuteMask[hourId][a] & eligible) == 0) continue;
            cand[n++] = a;
        }

        hourWinWindow[hourId] = winStartMinute;

        uint256 pe = potEthByHour[hourId];
        potEthByHour[hourId] = 0;

        if (n == 0) {
            potCarry += pe;
            emit PotWin(hourId, address(0), 0, winStartMinute, entropy);
            return;
        }

        uint256 gross = pe + potCarry;
        potCarry = 0;

        address winner = cand[uint256(entropy) % n];
        hourWinner[hourId] = winner;
        hourPayout[hourId] = gross;

        if (gross > 0) {
            (bool paid,) = payable(winner).call{value: gross}("");
            require(paid, "game: pot pay");
        }

        emit PotWin(hourId, winner, gross, winStartMinute, entropy);
    }

    function currentPotEth() external view returns (uint256) {
        uint256 hid = gameHour(block.timestamp);
        return potEthByHour[hid] + potCarry;
    }

    /// @notice Owner rescue for rolled POT carry only (does not touch user credit backing ETH).
    /// @dev Allowed while paused so carry can be recovered if the game is frozen.
    function ownerSweepPotCarry(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "game: zero");
        require(amount <= potCarry, "game: carry");
        potCarry -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "game: sweep");
        emit PotCarrySwept(to, amount);
    }

    /// @notice Ops: forward trophy mint through the game so `msg.sender` on the NFT is this contract (`onlyClickMintGame`).
    /// @dev On-click probability can later call `trophyNft.mintTrophyForPlayer` from `_click` directly (same `msg.sender`).
    function mintTrophyForPlayer(address to, uint64 totalClicks, uint8 fragmentSlot) external onlyOwner whenNotPaused {
        if (address(trophyNft) == address(0)) revert GameZeroTrophyAddr();
        trophyNft.mintTrophyForPlayer(to, totalClicks, fragmentSlot);
        emit TrophyMintedViaGame(to, totalClicks, fragmentSlot);
    }

    receive() external payable {}
}
