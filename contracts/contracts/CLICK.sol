// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CLICK — capped supply, 1% transfer tax, vested “pending” rewards + 30/30/20/20 early spend.
/// @dev Testnet: 1M max supply, 10-minute vesting (production: 7 days).
contract CLICK is ERC20, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;
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

    error CLICKUnauthorized();
    error CLICKCap();
    error CLICKZeroAddr();

    modifier onlyGame() {
        if (msg.sender != game) revert CLICKUnauthorized();
        _;
    }

    constructor(
        address initialOwner,
        address treasury_,
        address lpRecipient_,
        uint256 vestingDuration_
    ) ERC20("ClickMint", "CLICK") ERC20Permit("ClickMint") Ownable(initialOwner) {
        if (treasury_ == address(0) || lpRecipient_ == address(0)) revert CLICKZeroAddr();
        treasury = treasury_;
        lpRecipient = lpRecipient_;
        vestingDuration = vestingDuration_;
    }

    function setGame(address game_) external onlyOwner {
        if (game_ == address(0)) revert CLICKZeroAddr();
        game = game_;
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert CLICKZeroAddr();
        treasury = t;
    }

    function setLpRecipient(address lp) external onlyOwner {
        if (lp == address(0)) revert CLICKZeroAddr();
        lpRecipient = lp;
    }

    function setVestingDuration(uint256 seconds_) external onlyOwner {
        vestingDuration = seconds_;
    }

    /// @notice Grant vesting CLICK from gameplay; any instant unlock from sync is minted here (cap-checked).
    function grantVested(address to, uint256 amount) external onlyGame {
        if (amount == 0) return;
        _syncAndGrant(to, amount);
        if (totalSupply() > MAX_SUPPLY) revert CLICKCap();
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
    function claimVested() external {
        Vault storage v = _vault[msg.sender];
        uint256 vested = _vested(v);
        uint256 rel = vested - v.claimed;
        if (rel == 0) return;
        v.claimed = vested;
        _mint(msg.sender, rel);
        require(totalSupply() <= MAX_SUPPLY, "click: cap");
    }

    /// @notice Early liquidate unvested pending with protocol split (30/30/20/20).
    function earlySpendPending(uint256 amount) external {
        Vault storage v = _vault[msg.sender];
        uint256 vested = _vested(v);
        uint256 unvested = v.total > vested ? v.total - vested : 0;
        require(amount <= unvested, "click: unvested");
        v.total -= amount;

        uint256 burnAmt = amount * EARLY_BURN_BPS / BPS;
        uint256 toTreasury = amount * EARLY_TREASURY_BPS / BPS;
        uint256 toLp = amount * EARLY_LP_BPS / BPS;
        uint256 toUser = amount - burnAmt - toTreasury - toLp;

        if (burnAmt > 0) _mint(address(0xdead), burnAmt);
        if (toTreasury > 0) _mint(treasury, toTreasury);
        if (toLp > 0) _mint(lpRecipient, toLp);
        if (toUser > 0) _mint(msg.sender, toUser);
        require(totalSupply() <= MAX_SUPPLY, "click: cap");
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

    /// @dev Optional direct mint for POT / ops (game only), still respects cap at call sites.
    function mint(address to, uint256 amount) external onlyGame {
        _mint(to, amount);
        require(totalSupply() <= MAX_SUPPLY, "click: cap");
    }
}
