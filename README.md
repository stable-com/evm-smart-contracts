# EVM Contracts - HTLC Cross-Chain Swap Protocol

A production-ready cross-chain token swap protocol using Hash Time Lock Contracts (HTLC) and protocol-owned liquidity pools. Enables atomic single-chain and cross-chain token swaps with built-in AML compliance and multiple gasless transaction options.

## Quick Start

### Installation
```bash
npm install
```

### Compilation
```bash
npx hardhat compile
```

### Testing
```bash
npx hardhat test
```



## Documentation

An overview of what the protocol does — the HTLC contracts, how single-chain and
cross-chain swaps work, and the role of the backend — lives in [`docs/`](./docs/README.md):

- [Protocol overview](./docs/README.md)
- [HTLC & Liquidity Pool contracts](./docs/htlc-and-pool.md) — start here
- [How swaps work](./docs/how-swaps-work.md)
- [Backend role](./docs/backend.md)

## Core Contracts

### CrossChainHTLC.sol
Handles atomic cross-chain swaps using Hash Time Lock mechanism. Supports multiple gasless transaction methods (Permit, Permit2, signature-based) and integrates with LiquidityPool for instant swaps.

**Key Features:**
- Atomic cross-chain swaps with secret hash validation
- EIP-712 typed signatures for AML compliance
- Gasless transactions (Permit, Permit2, signature-based)
- Role-based access control (5 roles)
- Upgradeable (UUPS proxy pattern)

### LiquidityPool.sol
Protocol-owned liquidity pool for 1:1 token swaps.

**Key Features:**
- Single-chain and cross-chain swap support
- X/Y/Z liquidity thresholds to prevent pool depletion
- Per-token configurable fees
- Gasless transaction options
- Token whitelisting

## Configuration

Copy `.env.example` to `.env` and configure:
- Private keys for deployment
- RPC URLs for target networks
- Etherscan API keys for verification


