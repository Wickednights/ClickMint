// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ClickMintGame} from "../ClickMintGame.sol";

/// @dev Test helper: funds via `depositFor`, rejects push ETH so pot pays into `potClaimableEth`; then toggles to accept pull.
contract RejectingWallet {
    ClickMintGame public immutable game;
    bool public rejectPush;

    constructor(ClickMintGame game_) {
        game = game_;
        game.setClickExecutor(address(this));
        rejectPush = true;
    }

    /// @dev Test / integration only — anyone may drive clicks for this wallet.
    function setRejectPush(bool on) external {
        rejectPush = on;
    }

    /// @notice Credit this contract in the game (`depositFor` to self).
    function seedCredits() external payable {
        game.depositFor{value: msg.value}(address(this));
    }

    /// @notice Gasless path: executor is this contract.
    function doClick() external {
        game.clickFor(address(this));
    }

    /// @dev Reject **push payouts from the game** only; still accept ETH from EOAs to `seedCredits`.
    receive() external payable {
        if (rejectPush && msg.sender == address(game)) revert("reject push");
    }

    function claimPot() external {
        game.claimPotEth();
    }
}
