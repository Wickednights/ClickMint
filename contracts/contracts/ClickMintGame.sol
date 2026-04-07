// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {CLICK} from "./CLICK.sol";

/// @title ClickMintGame — ETH credits, fee split, rate-limited clicks, hourly CLICK POT (testnet-tuned).
/// @dev Randomness: block.prevrandao + salt — upgrade to Chainlink VRF for mainnet fairness.
contract ClickMintGame is Ownable, ReentrancyGuard {
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
    uint256 public constant CLICKS_PER_HASH_TIER = 5000;

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

    event Deposited(address indexed user, uint256 ethIn, uint256 creditsOut);
    event Clicked(address indexed user, uint256 hourId, uint256 totalForUserHour, uint8 window);
    event PotWin(uint256 indexed hourId, address indexed winner, uint256 clickPayout, uint8 window, bytes32 entropy);
    event AddressesUpdated(address treasury, address secret);

    error GameBadAddr();
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
        uint256 baseClickReward_
    ) Ownable(initialOwner) {
        if (address(click_) == address(0)) revert GameBadAddr();
        clickToken = click_;
        treasury = treasury_;
        secretWallet = secretWallet_;
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
    }

    function setAddresses(address payable treasury_, address payable secretWallet_) external onlyOwner {
        treasury = treasury_;
        secretWallet = secretWallet_;
        emit AddressesUpdated(treasury_, secretWallet_);
    }

    function setEconomy(uint256 clickPerEthWei_, uint256 clickCostCredits_, uint256 baseClickReward_) external onlyOwner {
        clickPerEthWei = clickPerEthWei_;
        clickCostCredits = clickCostCredits_;
        baseClickReward = baseClickReward_;
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

    /// @notice Split fees, grant full credits (wei), accrue POT in ETH.
    function deposit() external payable nonReentrant {
        uint256 v = msg.value;
        require(v > 0, "game: eth");
        uint256 ft = (v * FEE_EACH_BPS) / BPS;
        uint256 fp = (v * FEE_EACH_BPS) / BPS;
        uint256 fs = (v * FEE_EACH_BPS) / BPS;
        uint256 fees = ft + fp + fs;
        require(fees <= v, "game: fee");

        (bool okT,) = treasury.call{value: ft}("");
        (bool okS,) = secretWallet.call{value: fs}("");
        require(okT && okS, "game: fee send");

        credits[msg.sender] += v;

        uint256 hid = gameHour(block.timestamp);
        potEthByHour[hid] += fp;

        emit Deposited(msg.sender, v, v);
    }

    /// @notice One click: consumes credits, 2 per block max, records hourly stats + window activity.
    function click() external nonReentrant {
        uint256 cost = clickCostCredits;
        if (cost > 0) {
            if (credits[msg.sender] < cost) revert GameCredits();
            credits[msg.sender] -= cost;
        }

        uint256 bn = block.number;
        if (_clicksInBlock[msg.sender][bn] >= MAX_CLICKS_PER_BLOCK) revert GameCooldown();
        unchecked {
            _clicksInBlock[msg.sender][bn]++;
        }

        uint256 hid = gameHour(block.timestamp);
        uint8 w = utcWindow(block.timestamp);

        uint256 c = clicksInHour[hid][msg.sender] + 1;
        clicksInHour[hid][msg.sender] = c;
        totalClicksInHour[hid]++;
        windowMask[hid][msg.sender] |= uint8(1 << w);

        uint256 tier = totalClicksInHour[hid] / CLICKS_PER_HASH_TIER;
        uint256 needBits = tier > 4 ? 4 : tier;
        if (needBits > 0) {
            uint256 h = uint256(
                keccak256(abi.encodePacked(msg.sender, hid, c, block.number, block.timestamp, block.prevrandao))
            );
            require(h >> (256 - needBits) == 0, "game: clickhash");
        }

        if (!_hourListed[hid][msg.sender]) {
            _hourListed[hid][msg.sender] = true;
            _participants[hid].push(msg.sender);
        }

        emit Clicked(msg.sender, hid, c, w);

        uint256 reward = baseClickReward;
        if (reward > 0) clickToken.grantVested(msg.sender, reward);
    }

    /// @notice After a game hour ends (+ RESET_BUFFER), finalize POT for `hourId`.
    /// @dev Pseudo-random window + winner — acceptable for testnet; VRF for production.
    function finalizeHour(uint256 hourId) external nonReentrant {
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
    function ownerSweepPotCarry(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "game: zero");
        require(amount <= potCarry, "game: carry");
        potCarry -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "game: sweep");
    }

    receive() external payable {}
}
