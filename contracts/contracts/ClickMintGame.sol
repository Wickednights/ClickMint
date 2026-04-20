// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CLICK} from "./CLICK.sol";
import {BinaryTrophyNFT} from "./BinaryTrophyNFT.sol";

/// @title ClickMintGame — ETH credits, deposit splits, rate-limited clicks, minute-round ETH POT + Block Bet.
/// @dev Randomness: pseudo-random — upgrade to Chainlink VRF for high-stakes mainnet fairness.
///      Deposits: 50% Click Pot accrual, 30% treasury, 10% Block Bet pool, 10% trophy NFT revshare (or treasury if trophy unset).
///      Block bet stakes (`placeBet`): 10% treasury, 90% credited to the selected 15s window (that slice joins the round block-bet pool).
///      Credits granted: full `msg.value` wei + bonus (same UX as legacy; ETH is routed per BPS).
contract ClickMintGame is Ownable, ReentrancyGuard, Pausable {
    CLICK public immutable clickToken;

    address payable public treasury;

    /// @notice Seconds after each UTC minute boundary before the next round id ticks (settlement buffer).
    uint256 public constant ROUND_BUFFER = 5;
    uint256 public constant BPS = 10_000;
    /// @dev Sum must equal BPS. Product split: 50% pot / 30% treasury / 10% block bet / 10% trophy (NFT holder revshare).
    uint256 public constant POT_BPS = 5000;
    uint256 public constant TREASURY_BPS = 3000;
    uint256 public constant BLOCK_BET_DEPOSIT_BPS = 1000;
    uint256 public constant TROPHY_REV_BPS = 1000;
    /// @dev From each `placeBet` payment: sent to `treasury` (remainder credits the chosen slot). Independent of deposit BPS.
    uint256 public constant BLOCK_BET_STAKE_TREASURY_BPS = 1000;

    uint256 public constant MAX_CLICKS_PER_BLOCK = 20;
    /// @dev Trophy mint probability per successful click = `trophyDropWeight / TROPHY_ROLL_DENOM` (finer than BPS).
    uint256 public constant TROPHY_ROLL_DENOM = 1_000_000_000;
    uint256 public immutable minPotClicks;
    uint256 public immutable clicksPerHashTier;

    mapping(uint256 roundId => uint256) public totalClicksInRound;

    uint256 public clickPerEthWei;
    uint256 public clickCostCredits;
    uint256 public baseClickReward;
    uint256 public trophyDropWeight;

    mapping(uint256 roundId => bool) public roundFinalized;
    mapping(uint256 roundId => address) public roundWinner;
    mapping(uint256 roundId => uint256) public roundPayout;
    /// @notice Winning **POT** quadrant 0..3 (same as click `slotInRound` buckets) after `finalizeRound`. Block bet uses 46 windows separately.
    mapping(uint256 roundId => uint8) public roundWinSlot;

    /// @notice Block bet: 46 disjoint 15s windows in a minute — window `k` covers seconds `[k, k+14]` for `k` in `0..45`.
    uint256 public constant BLOCK_BET_SLOT_COUNT = 46;

    mapping(address => uint256) public credits;
    mapping(uint256 roundId => mapping(address => uint256)) public clicksInRound;
    /// @notice Bits 0..3 set if player clicked in that 15s slot during the round.
    mapping(uint256 roundId => mapping(address => uint8)) public slotMask;
    mapping(uint256 roundId => mapping(address => bool)) internal _roundListed;
    mapping(uint256 roundId => address[]) internal _participants;

    mapping(uint256 roundId => uint256) public potEthByRound;
    uint256 public potCarry;
    uint256 internal _potNonce;

    /// @notice 10% deposit slice accruing to Block Bet parimutuel for this round.
    mapping(uint256 roundId => uint256) public blockBetDepositEthByRound;
    /// @notice User bets: explicit ETH staked on a slot (wei).
    mapping(uint256 roundId => mapping(address => mapping(uint8 => uint256))) public userBetOnSlot;
    mapping(uint256 roundId => mapping(uint8 => uint256)) public totalBetOnSlot;
    mapping(uint256 roundId => address[]) internal _roundBettors;
    mapping(uint256 roundId => mapping(address => bool)) internal _roundBettorSeen;
    uint256 public blockBetCarry;
    /// @notice ETH owed from block-bet settlement when a push payment failed (claim via `claimBlockBetEth`).
    mapping(address => uint256) public blockBetClaimableEth;

    mapping(address => mapping(uint256 => uint8)) internal _clicksInBlock;

    mapping(address => address) public clickExecutor;

    BinaryTrophyNFT public trophyNft;

    address public potKeeper;

    event Deposited(address indexed user, uint256 ethIn, uint256 creditsOut);
    event Clicked(address indexed user, uint256 roundId, uint256 totalForUserRound, uint8 slotInRound);
    event PotWin(
        uint256 indexed roundId, address indexed winner, uint256 ethPayout, uint8 winSlot, bytes32 entropy
    );
    event BlockBetPaid(uint256 indexed roundId, uint8 winSlot, uint256 totalPot, uint256 winnersPaid);
    event BlockBetCarried(uint256 indexed roundId, uint256 amount);
    event BlockBetEthClaimed(address indexed to, uint256 amount);
    event AddressesUpdated(address indexed treasury);
    event EconomyUpdated(uint256 clickPerEthWei, uint256 clickCostCredits, uint256 baseClickReward);
    event ClickExecutorSet(address indexed player, address indexed executor);
    event TrophyNftSet(address indexed trophy);
    event TrophyDropWeightUpdated(uint256 weight);
    event PotCarrySwept(address payable to, uint256 amount);
    event GamePaused(address indexed by);
    event GameUnpaused(address indexed by);
    event TrophyMintedViaGame(address indexed to, uint64 totalClicks, uint8 fragmentSlot);
    event PotKeeperSet(address indexed keeper);

    error GameZeroTrophyAddr();
    error GameBadAddr();
    error GameBadParam();
    error GameBadExecutor();
    error GameCooldown();
    error GameCredits();
    error GameFinalizeEarly();
    error GameAlreadyFinalized();
    error GameBadBps();
    error GameBadTrophyWeight();
    error GameUnauthorizedCaller();
    error GameBadBetRound();
    error GameBadSlot();

    constructor(
        address initialOwner,
        CLICK click_,
        address payable treasury_,
        uint256 clickPerEthWei_,
        uint256 clickCostCredits_,
        uint256 baseClickReward_,
        uint256 clicksPerHashTier_,
        uint256 trophyDropWeight_,
        uint256 minPotClicks_
    ) Ownable(initialOwner) {
        if (address(click_) == address(0) || treasury_ == address(0)) revert GameBadAddr();
        if (clicksPerHashTier_ == 0) revert GameBadParam();
        if (minPotClicks_ == 0) revert GameBadParam();
        if (trophyDropWeight_ > TROPHY_ROLL_DENOM) revert GameBadTrophyWeight();
        if (POT_BPS + TREASURY_BPS + BLOCK_BET_DEPOSIT_BPS + TROPHY_REV_BPS != BPS) revert GameBadParam();
        clickToken = click_;
        treasury = treasury_;
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
        clicksPerHashTier = clicksPerHashTier_;
        trophyDropWeight = trophyDropWeight_;
        minPotClicks = minPotClicks_;
    }

    function setAddresses(address payable treasury_) external onlyOwner whenNotPaused {
        if (treasury_ == address(0)) revert GameBadAddr();
        treasury = treasury_;
        emit AddressesUpdated(treasury_);
    }

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

    function setEconomy(uint256 clickPerEthWei_, uint256 clickCostCredits_, uint256 baseClickReward_)
        external
        onlyOwner
        whenNotPaused
    {
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
        emit EconomyUpdated(clickPerEthWei_, clickCostCredits_, baseClickReward_);
    }

    function setTrophyNft(address trophy_) external onlyOwner whenNotPaused {
        trophyNft = BinaryTrophyNFT(payable(trophy_));
        emit TrophyNftSet(trophy_);
    }

    function setTrophyDropWeight(uint256 weight) external onlyOwner whenNotPaused {
        if (weight > TROPHY_ROLL_DENOM) revert GameBadTrophyWeight();
        trophyDropWeight = weight;
        emit TrophyDropWeightUpdated(weight);
    }

    function pause() external onlyOwner {
        _pause();
        emit GamePaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit GameUnpaused(msg.sender);
    }

    function isPaused() public view returns (bool) {
        return paused();
    }

    function setClickExecutor(address executor) external whenNotPaused {
        clickExecutor[msg.sender] = executor;
        emit ClickExecutorSet(msg.sender, executor);
    }

    /// @notice Round id for the current UTC minute bucket.
    function gameRound(uint256 ts) public pure returns (uint256) {
        if (ts <= ROUND_BUFFER) return 0;
        return (ts - ROUND_BUFFER) / 60;
    }

    /// @dev Slot 0..3 within the minute from unix timestamp.
    function slotInRound(uint256 ts) public pure returns (uint8) {
        return uint8((ts % 60) / 15);
    }

    function _depositBonusWei(uint256 v) internal pure returns (uint256) {
        if (v >= 1 ether) return (v * 1000) / BPS;
        if (v >= 0.5 ether) return (v * 700) / BPS;
        if (v >= 0.25 ether) return (v * 500) / BPS;
        if (v >= 0.1 ether) return (v * 300) / BPS;
        if (v >= 0.01 ether) return (v * 100) / BPS;
        return 0;
    }

    function deposit() external payable nonReentrant whenNotPaused {
        _deposit(msg.sender, msg.value);
    }

    function depositFor(address player) external payable nonReentrant whenNotPaused {
        if (msg.sender != player && msg.sender != clickExecutor[player]) revert GameBadExecutor();
        _deposit(player, msg.value);
    }

    function _deposit(address creditTo, uint256 v) internal {
        require(v > 0, "game: eth");
        uint256 toTreasury = (v * TREASURY_BPS) / BPS;
        uint256 toPot = (v * POT_BPS) / BPS;
        uint256 toBlockBet = (v * BLOCK_BET_DEPOSIT_BPS) / BPS;
        uint256 toTrophy = (v * TROPHY_REV_BPS) / BPS;
        uint256 remainder = v - (toTreasury + toPot + toBlockBet + toTrophy);
        toPot += remainder;

        (bool okTreasury,) = treasury.call{value: toTreasury}("");
        require(okTreasury, "game: treasury");

        if (toTrophy > 0) {
            address payable t = payable(address(trophyNft));
            if (t != address(0)) {
                (bool okT,) = t.call{value: toTrophy}("");
                require(okT, "game: trophy");
            } else {
                (bool okT2,) = treasury.call{value: toTrophy}("");
                require(okT2, "game: trophy fallback");
            }
        }

        uint256 bonus = _depositBonusWei(v);
        credits[creditTo] += v + bonus;

        uint256 rid = gameRound(block.timestamp);
        potEthByRound[rid] += toPot;
        blockBetDepositEthByRound[rid] += toBlockBet;

        emit Deposited(creditTo, v, v + bonus);
    }

    /// @notice Stake ETH on block-bet window `slot` (0..45) for the current round; window covers seconds `slot..slot+14` of the wall-clock minute.
    /// @dev `BLOCK_BET_STAKE_TREASURY_BPS` of msg.value goes to `treasury`; the rest is credited to this slot for settlement.
    function placeBet(uint8 slot) external payable nonReentrant whenNotPaused {
        if (uint256(slot) >= BLOCK_BET_SLOT_COUNT) revert GameBadSlot();
        uint256 v = msg.value;
        if (v == 0) revert GameBadParam();
        uint256 rid = gameRound(block.timestamp);
        uint256 toTreasury = (v * BLOCK_BET_STAKE_TREASURY_BPS) / BPS;
        uint256 toPool = v - toTreasury;
        if (toTreasury > 0) {
            (bool okT,) = treasury.call{value: toTreasury}("");
            require(okT, "game: treasury");
        }
        _recordBet(rid, msg.sender, slot, toPool);
    }

    function _recordBet(uint256 rid, address bettor, uint8 slot, uint256 v) internal {
        userBetOnSlot[rid][bettor][slot] += v;
        totalBetOnSlot[rid][slot] += v;
        if (!_roundBettorSeen[rid][bettor]) {
            _roundBettorSeen[rid][bettor] = true;
            _roundBettors[rid].push(bettor);
        }
    }

    function click() external nonReentrant whenNotPaused {
        _click(msg.sender);
    }

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

        uint256 rid = gameRound(block.timestamp);
        uint8 slot = slotInRound(block.timestamp);

        uint256 c = clicksInRound[rid][player] + 1;
        clicksInRound[rid][player] = c;
        totalClicksInRound[rid]++;
        slotMask[rid][player] |= uint8(1 << slot);

        uint256 tier = totalClicksInRound[rid] / clicksPerHashTier;
        uint256 needBits = tier > 4 ? 4 : tier;
        if (needBits > 0) {
            uint256 h = uint256(
                keccak256(abi.encodePacked(player, rid, c, block.number, block.timestamp, block.prevrandao))
            );
            require(h >> (256 - needBits) == 0, "game: clickhash");
        }

        if (!_roundListed[rid][player]) {
            _roundListed[rid][player] = true;
            _participants[rid].push(player);
        }

        emit Clicked(player, rid, c, slot);

        uint256 reward = baseClickReward;
        if (reward > 0) clickToken.grantVested(player, reward);

        BinaryTrophyNFT tn = trophyNft;
        uint256 w = trophyDropWeight;
        if (address(tn) != address(0) && w > 0) {
            bytes32 roll = keccak256(
                abi.encodePacked(player, rid, c, block.number, block.timestamp, block.prevrandao, address(this), "TROPHY")
            );
            if (uint256(roll) % TROPHY_ROLL_DENOM < w) {
                uint8 frag = uint8((uint256(roll) >> 128) % 256);
                uint64 tc = uint64(c > type(uint64).max ? type(uint64).max : c);
                try tn.mintTrophyForPlayer(player, tc, frag) {} catch {}
            }
        }
    }

    /// @notice Finalize POT + Block Bet for `roundId` after that round ends (+ ROUND_BUFFER).
    function finalizeRound(uint256 roundId) external nonReentrant onlyOwnerOrPotKeeper whenNotPaused {
        uint256 cutoff = (roundId + 1) * 60 + ROUND_BUFFER;
        if (block.timestamp < cutoff) revert GameFinalizeEarly();
        if (roundFinalized[roundId]) revert GameAlreadyFinalized();

        roundFinalized[roundId] = true;
        _potNonce++;

        bytes32 entropy = keccak256(
            abi.encodePacked(block.prevrandao, roundId, address(this), block.timestamp, _potNonce, block.number)
        );
        uint8 potQuadrant = uint8(uint256(entropy) % 4);
        roundWinSlot[roundId] = potQuadrant;

        _settlePot(roundId, potQuadrant, entropy);

        bytes32 betMix = keccak256(abi.encodePacked(entropy, roundId, address(this), "BLOCKBET46", block.number));
        uint8 blockBetWin = uint8(uint256(betMix) % BLOCK_BET_SLOT_COUNT);
        _settleBlockBet(roundId, blockBetWin);
    }

    function _settlePot(uint256 roundId, uint8 winSlot, bytes32 entropy) internal {
        address[] storage parts = _participants[roundId];
        address[] memory cand = new address[](parts.length);
        uint256 n = 0;
        uint8 mask = uint8(1 << winSlot);
        for (uint256 i = 0; i < parts.length; ++i) {
            address a = parts[i];
            if (clicksInRound[roundId][a] < minPotClicks) continue;
            if ((slotMask[roundId][a] & mask) == 0) continue;
            cand[n++] = a;
        }

        uint256 pe = potEthByRound[roundId];
        potEthByRound[roundId] = 0;

        if (n == 0) {
            potCarry += pe;
            emit PotWin(roundId, address(0), 0, winSlot, entropy);
            return;
        }

        uint256 gross = pe + potCarry;
        potCarry = 0;

        address winner = cand[uint256(entropy) % n];
        roundWinner[roundId] = winner;
        roundPayout[roundId] = gross;

        if (gross > 0) {
            (bool paid,) = payable(winner).call{value: gross}("");
            require(paid, "game: pot pay");
        }

        emit PotWin(roundId, winner, gross, winSlot, entropy);
    }

    function _settleBlockBet(uint256 roundId, uint8 winSlot) internal {
        uint256 carriedIn = blockBetCarry;
        blockBetCarry = 0;
        uint256 fromDep = blockBetDepositEthByRound[roundId];
        blockBetDepositEthByRound[roundId] = 0;
        uint256 sumBets = _sumBetsOnAllSlots(roundId);
        uint256 wst = totalBetOnSlot[roundId][winSlot];
        uint256 pot = fromDep + sumBets + carriedIn;

        address[] storage bettorsArr = _roundBettors[roundId];
        uint256 blen = bettorsArr.length;
        (address[] memory pAddr, uint256[] memory pStake, uint256 nP) =
            _snapshotWinningBets(roundId, winSlot, bettorsArr, blen);
        _clearAllBets(roundId);

        if (pot == 0) {
            emit BlockBetPaid(roundId, winSlot, 0, 0);
            return;
        }
        if (wst == 0) {
            blockBetCarry += pot;
            emit BlockBetCarried(roundId, pot);
            return;
        }

        uint256 paid = _distributeBlockBet(pot, wst, pAddr, pStake, nP);
        uint256 dust = pot > paid ? pot - paid : 0;
        if (dust > 0) blockBetCarry += dust;
        emit BlockBetPaid(roundId, winSlot, pot, paid);
    }

    function _snapshotWinningBets(
        uint256 roundId,
        uint8 winSlot,
        address[] storage bettorsArr,
        uint256 blen
    )
        internal
        view
        returns (address[] memory addrOut, uint256[] memory stakeOut, uint256 nOut)
    {
        addrOut = new address[](blen);
        stakeOut = new uint256[](blen);
        nOut = 0;
        for (uint256 i = 0; i < blen; ++i) {
            address a = bettorsArr[i];
            uint256 st = userBetOnSlot[roundId][a][winSlot];
            if (st > 0) {
                addrOut[nOut] = a;
                stakeOut[nOut] = st;
                ++nOut;
            }
        }
    }

    function _sumBetsOnAllSlots(uint256 roundId) internal view returns (uint256 sum) {
        sum = 0;
        for (uint256 s = 0; s < BLOCK_BET_SLOT_COUNT; ++s) {
            sum += totalBetOnSlot[roundId][uint8(s)];
        }
    }

    /// @dev Bet state is keyed by `roundId`; new rounds use new ids, so zeroing O(slots×bettors) fields on settlement is unnecessary
    ///      and can exceed block gas limits. We only `delete` the iterable bettor list for this round, which resets its length; that does
    ///      not zero underlying array slots, and `_roundBettorSeen[roundId]` / slot totals for that id are not cleared (round ids are monotonic).
    function _clearAllBets(uint256 roundId) internal {
        delete _roundBettors[roundId];
    }

    /// @notice All `totalBetOnSlot` values for `roundId` (index = window start second 0..45).
    function totalBetsAllSlots(uint256 roundId) external view returns (uint256[46] memory out) {
        for (uint256 i = 0; i < BLOCK_BET_SLOT_COUNT; ++i) {
            out[i] = totalBetOnSlot[roundId][uint8(i)];
        }
    }

    /// @notice User stakes per slot for `roundId` (same indexing as `totalBetsAllSlots`).
    function userBetsAllSlots(uint256 roundId, address bettor) external view returns (uint256[46] memory out) {
        for (uint256 i = 0; i < BLOCK_BET_SLOT_COUNT; ++i) {
            out[i] = userBetOnSlot[roundId][bettor][uint8(i)];
        }
    }

    function _distributeBlockBet(
        uint256 totalPot,
        uint256 winStake,
        address[] memory payAddr,
        uint256[] memory payStake,
        uint256 nPay
    ) internal returns (uint256 paidOut) {
        paidOut = 0;
        for (uint256 i = 0; i < nPay; ++i) {
            uint256 share = (totalPot * payStake[i]) / winStake;
            if (share > 0) {
                (bool ok,) = payable(payAddr[i]).call{value: share}("");
                if (ok) {
                    paidOut += share;
                } else {
                    blockBetClaimableEth[payAddr[i]] += share;
                    paidOut += share; // allocated from pot; pull-claim path — must count toward `paid` so dust/carry is not double-booked
                }
            }
        }
    }

    /// @notice Claim block-bet ETH that could not be pushed during `finalizeRound` (e.g. recipient reverted).
    function claimBlockBetEth() external nonReentrant {
        uint256 v = blockBetClaimableEth[msg.sender];
        if (v == 0) revert GameBadParam();
        blockBetClaimableEth[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: v}("");
        require(ok, "game: claim block bet");
        emit BlockBetEthClaimed(msg.sender, v);
    }

    function currentPotEth() external view returns (uint256) {
        uint256 rid = gameRound(block.timestamp);
        return potEthByRound[rid] + potCarry;
    }

    function ownerSweepPotCarry(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "game: zero");
        require(amount <= potCarry, "game: carry");
        potCarry -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "game: sweep");
        emit PotCarrySwept(to, amount);
    }

    function mintTrophyForPlayer(address to, uint64 totalClicks, uint8 fragmentSlot) external onlyOwner whenNotPaused {
        if (address(trophyNft) == address(0)) revert GameZeroTrophyAddr();
        trophyNft.mintTrophyForPlayer(to, totalClicks, fragmentSlot);
        emit TrophyMintedViaGame(to, totalClicks, fragmentSlot);
    }

    receive() external payable {}
}
