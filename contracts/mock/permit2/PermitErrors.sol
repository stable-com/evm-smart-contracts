// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Thrown when the signature has expired
error SignatureExpired(uint256 signatureDeadline);

/// @notice Thrown when the nonce is invalid
error InvalidNonce();
