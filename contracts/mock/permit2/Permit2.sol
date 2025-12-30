// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SignatureTransfer} from "./SignatureTransfer.sol";
import {AllowanceTransfer} from "./AllowanceTransfer.sol";

/// @notice Permit2 handles signature-based transfers in SignatureTransfer and allowance-based transfers in AllowanceTransfer.
/// @dev Users must approve Permit2 before calling any of the transfer functions.
contract Permit2 is SignatureTransfer, AllowanceTransfer {
    /// @notice Gets the domain separator
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
    
    // Permit2 unifies the two contracts so users have maximal flexibility with their approval.
}
