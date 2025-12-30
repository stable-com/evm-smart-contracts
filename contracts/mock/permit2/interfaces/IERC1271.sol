// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IERC1271
/// @notice Interface for ERC1271 signature validation
interface IERC1271 {
    /// @notice Should return whether the signature provided is valid for the provided data
    /// @param hash Hash of the data to be signed
    /// @param signature Signature byte array associated with the provided data hash
    /// @return magicValue bytes4 magic value 0x1626ba7e when function passes
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue);
}
