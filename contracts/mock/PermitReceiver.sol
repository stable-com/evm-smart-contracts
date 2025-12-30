// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAllowanceTransfer} from "./permit2/IAllowanceTransfer.sol";

/// @title PermitReceiver
/// @notice Contract that supports both EIP-2612 permits and Permit2 for signature-based approvals and transfers
contract PermitReceiver {
    using SafeERC20 for IERC20;

    /// @notice Permit2 contract instance
    IAllowanceTransfer public immutable permit2;

    /// @notice Track received amounts per token per owner
    mapping(address => mapping(address => uint256)) public receivedTokens; // token => owner => amount

    /// @notice Errors
    error InvalidSpender();
    error InvalidAmount();
    error InsufficientBalance();

    /// @notice Events
    event Pulled(address indexed token, address indexed from, uint256 amount);
    event TokensReceivedWithPermit(address indexed token, address indexed from, uint256 amount);
    event TokensReceivedWithTransfer(address indexed token, address indexed from, uint256 amount);

    constructor(address _permit2) {
        permit2 = IAllowanceTransfer(_permit2);
    }

    /// @notice Accept an EIP-2612 permit and transfer tokens to this contract in one tx
    function permitAndPull(
        address token,
        address owner,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20PermitLike(token).permit(owner, address(this), amount, deadline, v, r, s);
        bool success = IERC20PermitLike(token).transferFrom(owner, address(this), amount);
        require(success, "transferFrom failed");
        
        receivedTokens[token][owner] += amount;
        emit Pulled(token, owner, amount);
    }

    /// @notice Accept a Permit2 permit and transfer tokens to this contract in one tx
    function permitAndTransferToMe(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature,
        uint160 amount
    ) external {
        if (permitSingle.spender != address(this)) revert InvalidSpender();
        if (amount > permitSingle.details.amount) revert InvalidAmount();

        // Set approval via Permit2
        permit2.permit(msg.sender, permitSingle, signature);

        // Pull tokens using the new approval
        permit2.transferFrom(msg.sender, address(this), amount, permitSingle.details.token);

        receivedTokens[permitSingle.details.token][msg.sender] += amount;
        emit TokensReceivedWithPermit(permitSingle.details.token, msg.sender, amount);
    }

    /// @notice Submit only the Permit2 permit (approval) for this contract
    function permitThroughPermit2(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature
    ) external {
        if (permitSingle.spender != address(this)) revert InvalidSpender();
        permit2.permit(msg.sender, permitSingle, signature);
    }

    /// @notice Transfer tokens using an already-existing Permit2 approval
    function transferToMe(address token, uint160 amount) external {
        permit2.transferFrom(msg.sender, address(this), amount, token);
        receivedTokens[token][msg.sender] += amount;
        emit TokensReceivedWithTransfer(token, msg.sender, amount);
    }

    /// @notice View helper to get the total received tokens for a user and token
    function getReceivedTokens(address token, address owner) external view returns (uint256) {
        return receivedTokens[token][owner];
    }

    /// @notice Read current Permit2 allowance tuple for this contract
    function getAllowance(address owner, address token)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce)
    {
        return permit2.allowance(owner, token, address(this));
    }

    /// @notice Get token balance for this contract
    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Withdraw tokens from this contract (for testing only; no access control)
    function withdrawTokens(address token, address to, uint256 amount) external {
        uint256 credited = receivedTokens[token][msg.sender];
        if (amount > credited) revert InsufficientBalance();
        receivedTokens[token][msg.sender] = credited - amount;
        IERC20(token).safeTransfer(to, amount);
    }
}

/// @notice Interface for EIP-2612 permit tokens
interface IERC20PermitLike {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}


