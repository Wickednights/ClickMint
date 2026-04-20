// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test double: explicit ERC-165 “no” (no fallback revert).
contract NotNft {
    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }
}
