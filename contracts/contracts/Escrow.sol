// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Escrow — temporary ERC721 hold; beneficiary claims; emits confetti-style event for UI.
contract Escrow is Ownable, ERC721Holder {
    struct Hold {
        address token;
        uint256 tokenId;
        address depositor;
        address beneficiary;
        bool released;
    }

    mapping(uint256 => Hold) public holds;
    uint256 public nextHoldId = 1;

    event EscrowCreated(uint256 indexed holdId, address indexed token, uint256 indexed tokenId, address beneficiary);
    event Claimed(uint256 indexed holdId, address indexed to);
    /// @dev Frontend maps to confetti / celebration UX.
    event Confetti(address indexed winner, uint256 indexed holdId, address token, uint256 tokenId);

    error EscrowBadCaller();
    error EscrowAlreadyReleased();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function deposit(address token, uint256 tokenId, address beneficiary) external returns (uint256 holdId) {
        require(token != address(0), "escrow: token");
        require(beneficiary != address(0), "escrow: beneficiary");
        require(IERC165(token).supportsInterface(type(IERC721).interfaceId), "escrow: erc721");
        holdId = nextHoldId++;
        holds[holdId] = Hold({token: token, tokenId: tokenId, depositor: msg.sender, beneficiary: beneficiary, released: false});
        IERC721(token).safeTransferFrom(msg.sender, address(this), tokenId);
        emit EscrowCreated(holdId, token, tokenId, beneficiary);
    }

    function claim(uint256 holdId) external {
        Hold storage h = holds[holdId];
        if (h.released) revert EscrowAlreadyReleased();
        if (msg.sender != h.beneficiary && msg.sender != owner()) revert EscrowBadCaller();
        h.released = true;
        IERC721(h.token).safeTransferFrom(address(this), h.beneficiary, h.tokenId);
        emit Claimed(holdId, h.beneficiary);
        emit Confetti(h.beneficiary, holdId, h.token, h.tokenId);
    }
}
