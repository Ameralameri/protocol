pragma solidity 0.8.9;
// SPDX-License-Identifier: BlueOak-1.0.0

import "contracts/p0/interfaces/IMain.sol";

/**
 * @title Moody
 * @notice Tracks the mood and all changes to it.
 */
contract MoodyP0 is IMoody {
    Mood internal _mood;
    uint256 internal _lastMoodChange; // timestamp

    modifier calm() {
        require(_mood == Mood.CALM, "not calm");
        _;
    }

    modifier notInDoubt() {
        require(_mood != Mood.DOUBT, "in doubt");
        _;
    }

    /// @return The current mood
    function mood() public view override returns (Mood) {
        return _mood;
    }

    /// Sets a mood, idempotent if no change
    function _setMood(Mood newMood) internal {
        if (_mood != newMood) {
            emit MoodChanged(_mood, newMood);
            _lastMoodChange = block.timestamp;
            _mood = newMood;
        }
    }
}