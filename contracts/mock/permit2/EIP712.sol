// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EIP712Domain} from "./EIP712Domain.sol";

/// @title EIP712
/// @notice EIP712 helper functions
contract EIP712 is EIP712Domain {


    /// @notice Creates a domain separator
    function _domainSeparatorV4() internal view returns (bytes32) {
        return _buildDomainSeparator(nameHash, versionHash);
    }

    /// @notice Creates a domain separator
    function _buildDomainSeparator(bytes32 nameHash, bytes32 versionHash) internal view returns (bytes32) {
        return keccak256(abi.encode(TYPE_HASH, nameHash, versionHash, block.chainid, address(this)));
    }

    /// @notice Creates a hash for a given struct
    /// @param structHash The struct hash
    /// @return The typed struct hash
    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
    }

    /// @notice Creates a hash for a given struct
    /// @param structHash The struct hash
    /// @return The typed struct hash
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }
}
