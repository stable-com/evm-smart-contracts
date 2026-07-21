# Backend Role

The smart contracts are the source of truth for the protocol. The off-chain
backend exists to *coordinate* and to *gate* swaps on compliance — not to hold
or control user funds.

## What the backend does

- **AML / compliance checks.** Before any swap is authorized, the backend
  screens the addresses involved. Only if the checks pass does it produce the
  approval the contracts require.
- **Maintainer signing.** A passed compliance check is expressed as an EIP-712
  *maintainer signature*. The contracts verify this signature on-chain, so an
  unapproved swap can never be created — the approval is enforced by the
  contract, not merely by the backend.
- **Cross-chain coordination.** For cross-chain swaps the backend watches the
  source-chain lock, reserves the payout on the destination chain, and helps
  drive the claim step so both sides settle.
- **Gasless execution.** In the gasless flows, the backend submits the
  transaction on the user's behalf, but only for the exact operation the user
  and maintainer signed.
- **Liquidity monitoring.** It tracks pool reserves and the configured liquidity
  thresholds so swaps are only offered when they can be served.

## What the backend cannot do

- It **cannot move user funds** outside the rules encoded in the contracts.
  Every transfer, lock, unlock, and refund is governed on-chain.
- It **cannot bypass the time locks or secret-hash checks** that make swaps
  atomic and refundable.
- It **cannot approve a swap silently** — approval is an on-chain-verifiable
  signature, not a hidden backend decision.

In short, the backend decides *whether* a swap is allowed to start and helps it
run smoothly, while the contracts decide *what is actually allowed to happen* to
the funds.
