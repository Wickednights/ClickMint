// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title BinaryTrophyNFT — max 10 supply, 10% royalties (EIP-2981), on-chain SVG+stats metadata + revenue pot.
contract BinaryTrophyNFT is ERC721, ERC2981, Ownable {
    uint256 public constant MAX_SUPPLY = 10;
    uint96 public constant ROYALTY_BPS = 1000; // 10%

    uint256 private _nextId = 1;
    mapping(uint256 => uint64) public totalClicks;
    mapping(uint256 => uint8) public cipherFragmentSlot;
    mapping(address => uint256) public pendingEth;

    error TrophyCap();
    error TrophyZeroAddr();

    constructor(address initialOwner, address royaltyReceiver)
        ERC721("ClickMint Binary Trophy", "BTROPHY")
        Ownable(initialOwner)
    {
        if (royaltyReceiver == address(0)) revert TrophyZeroAddr();
        _setDefaultRoyalty(royaltyReceiver, ROYALTY_BPS);
    }

    function supportsInterface(bytes4 iid) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(iid);
    }

    /// @notice MVP mint path — owner mints testnet supply (10).
    function mint(address to, uint64 clicks, uint8 fragmentSlot) external onlyOwner {
        uint256 id = _nextId;
        if (id > MAX_SUPPLY) revert TrophyCap();
        _nextId = id + 1;
        totalClicks[id] = clicks;
        cipherFragmentSlot[id] = fragmentSlot;
        _safeMint(to, id);
    }

    receive() external payable {
        uint256 n = _nextId - 1;
        if (n == 0 || msg.value == 0) return;
        uint256 each = msg.value / n;
        unchecked {
            for (uint256 t = 1; t <= n; ++t) {
                address h = _ownerOf(t);
                if (h != address(0)) pendingEth[h] += each;
            }
        }
        uint256 rem = msg.value - each * n;
        if (rem > 0) {
            address h0 = _ownerOf(1);
            if (h0 != address(0)) pendingEth[h0] += rem;
        }
    }

    function claimRevenue() external {
        uint256 amt = pendingEth[msg.sender];
        if (amt == 0) return;
        pendingEth[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "trophy: eth");
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

    function _buildSvg(uint256 tokenId) internal view returns (string memory) {
        // Minimal neon cyberpunk trophy — all on-chain, no external URLs.
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0" stop-color="#00ffd5"/><stop offset="1" stop-color="#bd00ff"/></linearGradient></defs>',
            '<rect width="512" height="512" fill="#0b0f14"/>',
            '<text x="48" y="80" fill="#00ffd5" font-size="28" font-family="monospace">CLICKMINT</text>',
            '<text x="48" y="120" fill="#9ae6ff" font-size="18" font-family="monospace">BT #',
            Strings.toString(tokenId),
            "</text>",
            '<path fill="url(#g)" d="M160 140h192l-32 210h-128z"/>',
            '<rect x="196" y="100" width="120" height="40" rx="8" fill="#141c24" stroke="#00ffd5" stroke-width="4"/>',
            '<text x="220" y="128" fill="#e6f7ff" font-size="14" font-family="monospace">',
            Strings.toString(totalClicks[tokenId]),
            ' CLK</text>',
            '<text x="48" y="420" fill="#bd00ff" font-size="16" font-family="monospace">FRAG ',
            Strings.toString(uint256(cipherFragmentSlot[tokenId])),
            "</text>",
            "</svg>"
        );
    }
}
