// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SecretPrizeWallet — opaque sink for 1% of deposits (MVP: owner sweep).
contract SecretPrizeWallet is Ownable {
    event Swept(address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    /// @notice Governance-only escape hatch; production can time-lock or merkle-claim.
    function sweep(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "secret: zero to");
        require(amount <= address(this).balance, "secret: bal");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "secret: xfer");
        emit Swept(to, amount);
    }
}
