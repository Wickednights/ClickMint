// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClickMint Treasury — receives protocol ETH; owner sweeps.
contract Treasury is Ownable {
    event Swept(address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function sweep(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "treasury: zero to");
        require(amount <= address(this).balance, "treasury: bal");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "treasury: xfer");
        emit Swept(to, amount);
    }
}
