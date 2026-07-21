# Protocol Overview

Stable is a **non-custodial protocol for swapping stablecoins**, both within a
single blockchain and across different blockchains. It combines two ideas:

- **Hash Time Lock Contracts (HTLC)** — a well-known cryptographic mechanism
  that makes a swap *atomic*: either both sides of the exchange complete, or
  both are safely refunded. No party can take the funds and walk away.
- **Liquidity pools** — a user swapping token A for token B is served instantly
  from the pool instead of waiting to be matched with a counterparty.

The result is a swap experience that feels like a simple 1:1 stablecoin
exchange, while under the hood every operation is protected by on-chain time
locks and secret-hash validation.

## Key properties

- **Atomic** — a swap either fully completes or fully refunds. Time locks
  guarantee funds are never stuck.
- **Non-custodial** — user funds are governed by smart-contract rules on-chain.
  The off-chain backend coordinates and signs compliance approvals but cannot
  move user funds outside the contract logic.
- **Compliance-gated** — every swap must carry an off-chain AML approval
  (an EIP-712 signature from the protocol *maintainer*) before it is accepted
  on-chain.
- **Gasless options** — users can swap without holding the chain's native gas
  token, via ERC-20 Permit, Permit2, or a signature-plus-fee flow.
- **Safety controls** — contracts are upgradeable (UUPS), protected by
  role-based access control, reentrancy guards, and an emergency pause.

## Documentation

| Document | What it covers |
|----------|----------------|
| [HTLC & Liquidity Pool contracts](./htlc-and-pool.md) | The two core smart contracts and how they work (primary reading) |
| [How swaps work](./how-swaps-work.md) | Step-by-step single-chain and cross-chain swap flows, plus gasless options |
| [Backend role](./backend.md) | What the off-chain service does — and, importantly, what it cannot do |

> New readers should start with **[HTLC & Liquidity Pool contracts](./htlc-and-pool.md)** —
> the smart contracts are the heart of the protocol.
