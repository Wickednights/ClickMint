// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CLICK — capped supply (immutable cap from deploy), 1% transfer tax, vested “pending” rewards + 30/30/20/20 early spend.
/// @dev Constructor args come from the deploy preset in `scripts/config/economy.ts`: **testnet** = 1M × 1e18 cap + 600s vesting; **mainnet** = 100B × 1e18 + 604800s (7d). Immutable after deploy.
///      **`lpBootstrapSupplyWei`**: optional one-time mint to `initialOwner` at deploy (e.g. 10% of cap on mainnet for LP seed); **0** on testnet. Does not use vesting.
/// All mint paths pre-check `totalSupply() + amount <= maxSupply` (strict) and use CLICKBadSupply on violation.
contract CLICK is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
    uint256 public immutable maxSupply;
    uint256 public constant BPS = 10_000;
    uint256 public constant TRANSFER_TAX_BPS = 100; // 1%
    uint256 public constant EARLY_BURN_BPS = 3_000;
    uint256 public constant EARLY_TREASURY_BPS = 3_000;
    uint256 public constant EARLY_LP_BPS = 2_000;
    uint256 public constant EARLY_USER_BPS = 2_000;

    address public game;
    address public treasury;
    address public lpRecipient;

    uint256 public vestingDuration;

    struct Vault {
        uint256 total;
        uint256 claimed;
        uint64 start;
    }

    mapping(address account => Vault) internal _vault;

    event GameSet(address indexed game);
    event TreasurySet(address indexed treasury);
    event LpRecipientSet(address indexed lpRecipient);
    event VestingDurationSet(uint256 seconds_);
    /// @dev Emitted only from `mintForTesting` — testnet / staging bootstrap; not for production tokenomics.
    event TestingMint(address indexed to, uint256 amount);
    /// @dev One-time mint to `initialOwner` when `lpBootstrapSupplyWei > 0` in the constructor (LP seed).
    event InitialLpBootstrapMint(address indexed to, uint256 amount);

    error CLICKUnauthorized();
    error CLICKZeroAddr();
    error CLICKBadSupply();

    modifier onlyGame() {
        if (msg.sender != game) revert CLICKUnauthorized();
        _;
    }

    constructor(
        address initialOwner,
        address treasury_,
        address lpRecipient_,
        uint256 vestingDuration_,
        uint256 maxSupplyWei_,
        uint256 lpBootstrapSupplyWei_
    ) ERC20("ClickMint", "CLICK") ERC20Permit("ClickMint") Ownable(initialOwner) {
        if (treasury_ == address(0) || lpRecipient_ == address(0)) revert CLICKZeroAddr();
        if (maxSupplyWei_ == 0) revert CLICKBadSupply();
        treasury = treasury_;
        lpRecipient = lpRecipient_;
        vestingDuration = vestingDuration_;
        maxSupply = maxSupplyWei_;
        if (lpBootstrapSupplyWei_ > 0) {
            _requireSupplyRoom(lpBootstrapSupplyWei_);
            _mint(initialOwner, lpBootstrapSupplyWei_);
            emit InitialLpBootstrapMint(initialOwner, lpBootstrapSupplyWei_);
        }
    }

    /// @dev Strict: revert before any mint if cap would be exceeded (including exact edge at `maxSupply`).
    function _requireSupplyRoom(uint256 mintAmount) internal view {
        if (mintAmount == 0) return;
        if (totalSupply() + mintAmount > maxSupply) revert CLICKBadSupply();
    }

    function setGame(address game_) external onlyOwner {
        if (game_ == address(0)) revert CLICKZeroAddr();
        game = game_;
        emit GameSet(game_);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert CLICKZeroAddr();
        treasury = t;
        emit TreasurySet(t);
    }

    function setLpRecipient(address lp) external onlyOwner {
        if (lp == address(0)) revert CLICKZeroAddr();
        lpRecipient = lp;
        emit LpRecipientSet(lp);
    }

    function setVestingDuration(uint256 seconds_) external onlyOwner {
        vestingDuration = seconds_;
        emit VestingDurationSet(seconds_);
    }

    /// @notice Grant vesting CLICK from gameplay; any instant unlock from sync is minted here (cap-checked before each mint).
    function grantVested(address to, uint256 amount) external onlyGame nonReentrant {
        if (amount == 0) return;
        _syncAndGrant(to, amount);
    }

    function pendingVested(address account) external view returns (uint256 unvested) {
        Vault memory v = _vault[account];
        uint256 vtd = _vested(v);
        if (v.total > vtd) unvested = v.total - vtd;
    }

    function claimable(address account) external view returns (uint256) {
        Vault memory v = _vault[account];
        return _vested(v) - v.claimed;
    }

    /// @notice Release linearly vested CLICK to liquid balance.
    function claimVested() external nonReentrant {
        Vault storage v = _vault[msg.sender];
        uint256 vested = _vested(v);
        uint256 rel = vested - v.claimed;
        if (rel == 0) return;
        _requireSupplyRoom(rel);
        v.claimed = vested;
        _mint(msg.sender, rel);
    }

    /// @notice Early liquidate unvested pending with protocol split (30/30/20/20).
    function earlySpendPending(uint256 amount) external nonReentrant {
        Vault storage v = _vault[msg.sender];
        uint256 vested = _vested(v);
        uint256 unvested = v.total > vested ? v.total - vested : 0;
        require(amount <= unvested, "click: unvested");
        v.total -= amount;

        uint256 burnAmt = amount * EARLY_BURN_BPS / BPS;
        uint256 toTreasury = amount * EARLY_TREASURY_BPS / BPS;
        uint256 toLp = amount * EARLY_LP_BPS / BPS;
        uint256 toUser = amount - burnAmt - toTreasury - toLp;

        uint256 mintSum = burnAmt + toTreasury + toLp + toUser;
        _requireSupplyRoom(mintSum);

        if (burnAmt > 0) _mint(address(0xdead), burnAmt);
        if (toTreasury > 0) _mint(treasury, toTreasury);
        if (toLp > 0) _mint(lpRecipient, toLp);
        if (toUser > 0) _mint(msg.sender, toUser);
    }

    function _vested(Vault memory v) internal view returns (uint256) {
        if (v.total == 0 || v.start == 0) return 0;
        if (vestingDuration == 0) return v.total;
        if (block.timestamp >= v.start + vestingDuration) return v.total;
        return (v.total * (block.timestamp - v.start)) / vestingDuration;
    }

    function _syncAndGrant(address to, uint256 amount) internal {
        Vault storage v = _vault[to];
        uint256 vested = _vested(v);
        uint256 rel = vested - v.claimed;
        if (rel > 0) {
            _requireSupplyRoom(rel);
            v.claimed = vested;
            _mint(to, rel);
        }
        uint256 unvested = v.total > vested ? v.total - vested : 0;
        v.total = unvested + amount;
        v.start = uint64(block.timestamp);
        v.claimed = 0;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && TRANSFER_TAX_BPS > 0) {
            uint256 tax = (value * TRANSFER_TAX_BPS) / BPS;
            if (tax > 0) {
                super._update(from, treasury, tax);
                value -= tax;
            }
        }
        super._update(from, to, value);
    }

    /// @dev Optional direct mint for POT / ops (game only); pre-checks cap strictly before minting.
    function mint(address to, uint256 amount) external onlyGame nonReentrant {
        _requireSupplyRoom(amount);
        _mint(to, amount);
    }

    /// @notice **Testnet-only:** mint liquid CLICK to `to` for LP / integration bootstrap when gameplay mints are too slow.
    /// @dev Subject to `maxSupply` via `_requireSupplyRoom`. **Remove or disable before any mainnet deployment** — this bypasses vesting and game rules.
    function mintForTesting(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert CLICKZeroAddr();
        _requireSupplyRoom(amount);
        _mint(to, amount);
        emit TestingMint(to, amount);
    }
}
