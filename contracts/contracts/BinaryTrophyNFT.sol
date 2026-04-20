// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title BinaryTrophyNFT — deploy-set cap, 10% royalties (EIP-2981), on-chain SVG+stats + scalable ETH revenue share.
/// @dev Revenue uses a per-share accumulator so `receive()` stays O(1) (required for caps up to 10,000).
///
/// Minting model:
/// - **Owner `mint`** — bootstrap / admin (MVP).
/// - **`mintTrophyForPlayer`** — only the linked **ClickMintGame** contract. `ClickMintGame._click` may call this
///   with probability `trophyDropWeight / TROPHY_ROLL_DENOM` (see game); **owner** may also forward via `ClickMintGame.mintTrophyForPlayer`.
///   Player EOAs never call this NFT directly for minting.
contract BinaryTrophyNFT is ERC721, ERC2981, Ownable {
    uint256 public immutable maxSupply;
    uint96 public constant ROYALTY_BPS = 1000; // 10%

    /// @notice Must be set to `ClickMintGame` so that contract can call `mintTrophyForPlayer`.
    address public clickMintGame;

    uint256 private constant _REWARD_PRECISION = 1e18;
    /// @notice Cumulative ETH wei per trophy share (× 1e18 precision) from all `receive()` deposits.
    uint256 public rewardPerShareStored;
    mapping(uint256 tokenId => uint256) public rewardPerSharePaid;

    uint256 private _nextId = 1;
    mapping(uint256 => uint64) public totalClicks;
    mapping(uint256 => uint8) public cipherFragmentSlot;

    event ClickMintGameSet(address indexed game);
    event TrophyMinted(address indexed to, uint256 indexed tokenId, uint64 totalClicks, uint8 fragmentSlot, bool viaGame);

    error TrophyCap();
    error TrophyZeroAddr();
    error TrophyBadSupply();
    error TrophyNotOwner();
    error TrophyInvalidToken();
    error TrophyNotGame();

    modifier onlyClickMintGame() {
        if (msg.sender != clickMintGame || clickMintGame == address(0)) revert TrophyNotGame();
        _;
    }

    constructor(
        address initialOwner,
        address royaltyReceiver,
        uint256 maxSupply_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) Ownable(initialOwner)
    {
        if (royaltyReceiver == address(0)) revert TrophyZeroAddr();
        if (maxSupply_ == 0) revert TrophyBadSupply();
        maxSupply = maxSupply_;
        _setDefaultRoyalty(royaltyReceiver, ROYALTY_BPS);
    }

    /// @notice Links the sole `ClickMintGame` that may call `mintTrophyForPlayer`. Emits **ClickMintGameSet**.
    function setClickMintGame(address game_) external onlyOwner {
        clickMintGame = game_;
        emit ClickMintGameSet(game_);
    }

    function supportsInterface(bytes4 iid) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(iid);
    }

    /// @notice MVP mint path — owner mints trophies; new tokens sync to the current revenue index.
    function mint(address to, uint64 clicks, uint8 fragmentSlot) external onlyOwner {
        _mintTrophy(to, clicks, fragmentSlot, false);
    }

    /// @notice ClickMintGame-only mint path for on-chain drops (msg.sender must be `clickMintGame`).
    function mintTrophyForPlayer(address to, uint64 clicks, uint8 fragmentSlot) external onlyClickMintGame {
        _mintTrophy(to, clicks, fragmentSlot, true);
    }

    function _mintTrophy(address to, uint64 clicks, uint8 fragmentSlot, bool viaGame) internal {
        uint256 id = _nextId;
        if (id > maxSupply) revert TrophyCap();
        _nextId = id + 1;
        totalClicks[id] = clicks;
        cipherFragmentSlot[id] = fragmentSlot;
        rewardPerSharePaid[id] = rewardPerShareStored;
        _safeMint(to, id);
        emit TrophyMinted(to, id, clicks, fragmentSlot, viaGame);
    }

    receive() external payable {
        uint256 n = _nextId - 1;
        if (n == 0 || msg.value == 0) return;
        rewardPerShareStored += (msg.value * _REWARD_PRECISION) / n;
    }

    /// @notice Pull ETH accrued to this trophy from `receive()` splits (per-token, gas-safe).
    function claimRevenue(uint256 tokenId) external {
        address h = _ownerOf(tokenId);
        if (h == address(0)) revert TrophyInvalidToken();
        if (msg.sender != h) revert TrophyNotOwner();

        uint256 paid = rewardPerSharePaid[tokenId];
        uint256 rps = rewardPerShareStored;
        uint256 pending = (rps - paid) / _REWARD_PRECISION;
        rewardPerSharePaid[tokenId] = rps;

        if (pending > 0) {
            (bool ok,) = payable(msg.sender).call{value: pending}("");
            require(ok, "trophy: eth");
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory svg = _buildSvg(tokenId);
        string memory json = string.concat(
            '{"name":"Binary Trophy #',
            Strings.toString(tokenId),
            '","description":"ClickMint Phase 1 - revenue-share trophy with on-chain stats + cipher fragment slot.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Total Clicks","value":',
            Strings.toString(totalClicks[tokenId]),
            '},{"trait_type":"Cipher Fragment","value":',
            Strings.toString(uint256(cipherFragmentSlot[tokenId])),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev On-chain SVG: cyber-camo field + gradient trophy (no external URLs). Keeps token self-contained.
    function _buildSvg(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
            "<defs>",
            '<pattern id="hex" width="28" height="49" patternUnits="userSpaceOnUse" patternTransform="scale(0.85)">',
            '<path d="M14 0L28 8.5v17L14 34L0 25.5v-17z" fill="none" stroke="#00ffd5" stroke-opacity="0.12" stroke-width="1"/></pattern>',
            '<pattern id="camo" width="160" height="160" patternUnits="userSpaceOnUse">',
            '<rect width="160" height="160" fill="#0d1812"/>',
            '<ellipse cx="35" cy="45" rx="48" ry="32" fill="#1a3d2e" opacity="0.92"/>',
            '<ellipse cx="110" cy="30" rx="42" ry="38" fill="#2d1f35" opacity="0.88"/>',
            '<ellipse cx="85" cy="95" rx="55" ry="36" fill="#143d38" opacity="0.9"/>',
            '<ellipse cx="25" cy="115" rx="38" ry="28" fill="#3d2040" opacity="0.75"/>',
            '<ellipse cx="130" cy="125" rx="44" ry="30" fill="#1e4a3a" opacity="0.82"/></pattern>',
            '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0" stop-color="#00ffd5"/><stop offset="0.55" stop-color="#00a896"/><stop offset="1" stop-color="#bd00ff"/></linearGradient>',
            '<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="0.35" stop-color="#ffffff" stop-opacity="0"/>',
            '<stop offset="1" stop-color="#000000" stop-opacity="0.25"/></linearGradient>',
            '<clipPath id="tshape"><path d="M160 140h192l-32 210h-128z"/></clipPath>',
            '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">',
            '<feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            "</defs>",
            '<rect width="512" height="512" fill="#0b0f14"/>',
            '<rect width="512" height="512" fill="url(#hex)"/>',
            '<rect width="512" height="512" fill="url(#camo)" opacity="0.55"/>',
            '<g clip-path="url(#tshape)" filter="url(#glow)">',
            '<rect x="128" y="128" width="256" height="256" fill="url(#camo)"/>',
            '<rect x="128" y="128" width="256" height="256" fill="url(#g)"/>',
            '<rect x="128" y="128" width="256" height="256" fill="url(#shine)"/></g>',
            '<path fill="none" stroke="#00ffd5" stroke-width="3" d="M160 140h192l-32 210h-128z" opacity="0.85"/>',
            '<text x="48" y="72" fill="#00ffd5" font-size="30" font-family="monospace" font-weight="bold">CLICKMINT</text>',
            '<text x="48" y="108" fill="#9ae6ff" font-size="20" font-family="monospace">BT #',
            Strings.toString(tokenId),
            "</text>",
            '<rect x="176" y="92" width="160" height="44" rx="10" fill="#0a1218" stroke="#00ffd5" stroke-width="3" opacity="0.95"/>',
            '<text x="256" y="122" fill="#e6f7ff" font-size="16" font-family="monospace" text-anchor="middle">',
            Strings.toString(totalClicks[tokenId]),
            " CLK</text>",
            '<text x="48" y="430" fill="#ff6bff" font-size="18" font-family="monospace" font-weight="bold">FRAG ',
            Strings.toString(uint256(cipherFragmentSlot[tokenId])),
            "</text>",
            '<g transform="translate(448,456)"><circle r="18" fill="#f8fafc"/><text x="0" y="6" fill="#0b0f14" font-size="17" font-family="monospace" font-weight="bold" text-anchor="middle">B</text></g>',
            "</svg>"
        );
    }
}
