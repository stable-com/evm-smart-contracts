// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EIP712Domain
/// @notice EIP712 domain separator
contract EIP712Domain {
    /// @notice The EIP712 domain type hash
    bytes32 public constant TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice The name hash of the contract
    bytes32 public immutable nameHash;

    /// @notice The version hash of the contract
    bytes32 public immutable versionHash;

    constructor() {
        nameHash = keccak256("Permit2");
        versionHash = keccak256("1");
    }
}
