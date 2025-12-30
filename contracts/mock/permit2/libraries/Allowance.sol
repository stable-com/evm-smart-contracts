// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAllowanceTransfer} from "../IAllowanceTransfer.sol";

/// @title Allowance
/// @notice Helper functions for managing allowances
library Allowance {
    /// @notice Updates the amount and expiration of an allowance
    /// @param packed The packed allowance data
    /// @param amount The new amount
    /// @param expiration The new expiration
    function updateAmountAndExpiration(
        IAllowanceTransfer.PackedAllowance storage packed,
        uint160 amount,
        uint48 expiration
    ) internal {
        packed.amount = amount;
        packed.expiration = expiration;
    }

    /// @notice Updates the amount of an allowance
    /// @param packed The packed allowance data
    /// @param amount The new amount
    function updateAmount(IAllowanceTransfer.PackedAllowance storage packed, uint160 amount) internal {
        packed.amount = amount;
    }

    /// @notice Updates the expiration of an allowance
    /// @param packed The packed allowance data
    /// @param expiration The new expiration
    function updateExpiration(IAllowanceTransfer.PackedAllowance storage packed, uint48 expiration) internal {
        packed.expiration = expiration;
    }

    /// @notice Updates the nonce of an allowance
    /// @param packed The packed allowance data
    /// @param nonce The new nonce
    function updateNonce(IAllowanceTransfer.PackedAllowance storage packed, uint48 nonce) internal {
        packed.nonce = nonce;
    }

    /// @notice Checks if an allowance has expired
    /// @param packed The packed allowance data
    /// @return True if the allowance has expired
    function isExpired(IAllowanceTransfer.PackedAllowance storage packed) internal view returns (bool) {
        return block.timestamp > packed.expiration;
    }

    /// @notice Checks if an allowance is unlimited
    /// @param packed The packed allowance data
    /// @return True if the allowance is unlimited
    function isUnlimited(IAllowanceTransfer.PackedAllowance storage packed) internal view returns (bool) {
        return packed.amount == type(uint160).max;
    }
}
