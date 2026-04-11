// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CLICK} from "./CLICK.sol";
import {BinaryTrophyNFT} from "./BinaryTrophyNFT.sol";

/// @title ClickMintGame — ETH credits, fee split, rate-limited clicks, hourly CLICK POT.
/// @dev Randomness: block.prevrandao + salt — upgrade to Chainlink VRF for mainnet fairness.
/// Constructor economy + `clicksPerHashTier` are set at deploy from `DEPLOY_ECONOMY` (**testnet** vs **mainnet** in `scripts/config/economy.ts`). Owner may later `setEconomy` / `setAddresses`; hash tier stays immutable.
contract ClickMintGame is Ownable, ReentrancyGuard, Pausable {
    CLICK public immutable clickToken;

    address payable public treasury;
    address payable public secretWallet;

    /// @notice ~20s after each UTC hour boundary before the next game hour ticks (reset buffer).
    uint256 public constant RESET_BUFFER = 20;
    uint256 public constant BPS = 10_000;
    /// @dev 3% total: 1% treasury / 1% pot (ETH) / 1% secret. Credits are still granted on full `msg.value`.
    uint256 public constant FEE_EACH_BPS = 100;

    uint256 public constant MIN_POT_CLICKS = 100;
    uint256 public constant MAX_CLICKS_PER_BLOCK = 2;
    /// @notice Global clicks per game hour — every N clicks adds one required leading-zero bit (cap 4) for click hash.
    uint256 public immutable clicksPerHashTier;

    mapping(uint256 hourId => uint256) public totalClicksInHour;

    /// @notice Wei of CLICK minted per 1 ETH of pot (scaled — testnet sized).
    uint256 public clickPerEthWei;

    uint256 public clickCostCredits;
    uint256 public baseClickReward;

    /// @notice Last pot settlement (game hour id).
    mapping(uint256 hourId => bool) public hourFinalized;
    mapping(uint256 hourId => address) public hourWinner;
    mapping(uint256 hourId => uint256) public hourPayout;
    mapping(uint256 hourId => uint8) public hourWinWindow;

    mapping(address => uint256) public credits;
    mapping(uint256 hourId => mapping(address => uint256)) public clicksInHour;
    mapping(uint256 hourId => mapping(address => uint8)) public windowMask;
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
    event Clicked(address indexed user, uint256 hourId, uint256 totalForUserHour, uint8 window);
    event PotWin(uint256 indexed hourId, address indexed winner, uint256 clickPayout, uint8 window, bytes32 entropy);
    event AddressesUpdated(address indexed treasury, address indexed secret);
    event EconomyUpdated(uint256 clickPerEthWei, uint256 clickCostCredits, uint256 baseClickReward);
    event ClickExecutorSet(address indexed player, address indexed executor);
    event TrophyNftSet(address indexed trophy);
    event PotCarrySwept(address indexed to, uint256 amount);
    /// @notice Emitted in addition to OpenZeppelin `Pausable` **Paused** event (same transition).
    event GamePaused(address indexed by);
    /// @notice Emitted in addition to OpenZeppelin `Pausable` **Unpaused** event (same transition).
    event GameUnpaused(address indexed by);
    event TrophyMintedViaGame(address indexed to, uint64 totalClicks, uint8 fragmentSlot);

    error GameZeroTrophyAddr();

    error GameBadAddr();
    error GameBadExecutor();
    error GameCooldown();
    error GameCredits();
    error GameFinalizeEarly();
    error GameAlreadyFinalized();

    constructor(
        address initialOwner,
        CLICK click_,
        address payable treasury_,
        address payable secretWallet_,
        uint256 clickPerEthWei_,
        uint256 clickCostCredits_,
        uint256 baseClickReward_,
        uint256 clicksPerHashTier_
    ) Ownable(initialOwner) {
        if (address(click_) == address(0)) revert GameBadAddr();
        if (clicksPerHashTier_ == 0) revert GameBadAddr();
        clickToken = click_;
        treasury = treasury_;
        secretWallet = secretWallet_;
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
        clicksPerHashTier = clicksPerHashTier_;
    }

    function setAddresses(address payable treasury_, address payable secretWallet_) external onlyOwner whenNotPaused {
        treasury = treasury_;
        secretWallet = secretWallet_;
        emit AddressesUpdated(treasury_, secretWallet_);
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

    /// @dev 15-minute window index 0..3 within the UTC hour — used for POT eligibility.
    function utcWindow(uint256 ts) public pure returns (uint8) {
        return uint8(_minuteInUtcHour(ts) / 15);
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
        uint8 w = utcWindow(block.timestamp);

        uint256 c = clicksInHour[hid][player] + 1;
        clicksInHour[hid][player] = c;
        totalClicksInHour[hid]++;
        windowMask[hid][player] |= uint8(1 << w);

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

        emit Clicked(player, hid, c, w);

        uint256 reward = baseClickReward;
        if (reward > 0) clickToken.grantVested(player, reward);
    }

    /// @notice After a game hour ends (+ RESET_BUFFER), finalize POT for `hourId` (owner / ops only).
    /// @dev **Why onlyOwner (MVP):** open `finalizeHour` lets anyone race to settle, which encourages MEV /
    /// timing games around our **pseudo-random** entropy and can grief UX. Restricting to **owner** (later:
    /// multisig, Chainlink Automation, Gelato, or a dedicated `FINALIZER_ROLE`) gives controlled, predictable
    /// settlement until we ship **VRF** and an explicit keeper model. Acceptable for testnet; revisit before high-stakes mainnet.
    /// Pseudo-random window + winner — acceptable for testnet; VRF for production randomness.
    function finalizeHour(uint256 hourId) external nonReentrant onlyOwner whenNotPaused {
        uint256 cutoff = (hourId + 1) * 3600 + RESET_BUFFER;
        if (block.timestamp < cutoff) revert GameFinalizeEarly();
        if (hourFinalized[hourId]) revert GameAlreadyFinalized();

        hourFinalized[hourId] = true;
        _potNonce++;

        bytes32 entropy = keccak256(
            abi.encodePacked(block.prevrandao, hourId, address(this), block.timestamp, _potNonce, block.number)
        );
        uint8 winWindow = uint8(uint256(entropy) % 4);

        address[] storage parts = _participants[hourId];
        address[] memory cand = new address[](parts.length);
        uint256 n = 0;
        for (uint256 i = 0; i < parts.length; ++i) {
            address a = parts[i];
            if (clicksInHour[hourId][a] < MIN_POT_CLICKS) continue;
            if ((windowMask[hourId][a] & uint8(1 << winWindow)) == 0) continue;
            cand[n++] = a;
        }

        hourWinWindow[hourId] = winWindow;

        uint256 pe = potEthByHour[hourId];
        potEthByHour[hourId] = 0;

        if (n == 0) {
            potCarry += pe;
            emit PotWin(hourId, address(0), 0, winWindow, entropy);
            return;
        }

        uint256 gross = pe + potCarry;
        potCarry = 0;

        address winner = cand[uint256(entropy) % n];
        uint256 payout = (gross * clickPerEthWei) / 1 ether;

        hourWinner[hourId] = winner;
        hourPayout[hourId] = payout;

        if (payout > 0) clickToken.mint(winner, payout);

        emit PotWin(hourId, winner, payout, winWindow, entropy);
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
