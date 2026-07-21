# HTLC & Liquidity Pool Contracts

The protocol is built on two smart contracts that work together:

- **`CrossChainHTLC`** — the *conductor*. It enforces the rules and lifecycle of
  every swap but never holds user funds itself.
- **`LiquidityPool`** — the *vault*. It holds the pool's stablecoin reserves
  and is the only contract that actually moves money, and only when instructed
  by the HTLC contract.

This separation is deliberate: the logic that decides *whether* a swap may
proceed is kept apart from the contract that *custodies* the funds.

## What is an HTLC?

A **Hash Time Lock Contract** is a way to exchange value between two parties
without either of them having to trust the other, and without a middleman
holding the money.

It relies on two ingredients:

1. **A hash lock.** One party picks a random *secret* and publishes only the
   *hash* of it. Funds are locked so they can only be released by whoever
   reveals the original secret. Revealing the secret on one chain makes it
   visible to everyone, which is what lets the other side of the swap unlock too.
2. **A time lock.** Every lock has a deadline. If the swap is not completed in
   time, the funds become refundable to their original owner.

Put together, these guarantee **atomicity**: the swap either completes on both
sides (the secret is revealed) or unwinds on both sides (the time locks expire
and everyone is refunded). Funds can never be lost or left in limbo.

## `CrossChainHTLC` — the conductor

This contract tracks the state of every swap and enforces the HTLC rules. It
does not store tokens; when funds need to move, it calls the `LiquidityPool`.

### Swap lifecycle

Each swap is identified by its secret hash and moves through a small set of
states:

```
None ──► SourceLocked ──────┐
  │                         ├──► Claimed   (secret revealed in time)
  └────► DestinationLocked ─┘
                            └──► Refunded  (time lock expired)
```

- **Lock** — funds are committed against a secret hash, with a deadline.
  There are separate steps for the *source* side (where the user's funds enter)
  and the *destination* side (where the user's funds are paid out).
- **Claim** — revealing the correct secret before the deadline releases the
  locked funds. The contract checks that the revealed secret hashes to the
  committed hash before allowing the claim.
- **Refund** — if the deadline passes without a valid claim, the funds are
  returned to their owner.

The source and destination sides use different time-lock durations, with the
source lock lasting longer. This ordering is what keeps a cross-chain swap safe:
the party who reveals the secret always has enough time for the other side to
react.

### Compliance and authorization

Before a swap can be locked, it must carry a **maintainer signature** — an
EIP-712 typed signature produced by the protocol's off-chain service *after* it
has completed AML/compliance checks. The contract verifies this signature
on-chain, so a swap that was never approved simply cannot be created. Each
approval also carries a **deadline** and a per-user **nonce** so signatures
cannot be replayed.

A per-swap **session address** and **session signature** are used to
authorize the claim, decoupling the sensitive act of revealing the secret from
the user's main wallet key.

### Safety controls

- **Role-based access control** — sensitive actions (executing on a user's
  behalf, managing configuration, upgrading, pausing) are gated behind distinct
  roles rather than a single owner.
- **Pausable** — the protocol can be paused in an emergency, blocking new locks,
  claims, and refunds.
- **Reentrancy guards** on every state-changing entry point.
- **Upgradeable (UUPS)** — the contract logic can be upgraded under a dedicated
  upgrader role while preserving state and address.

## `LiquidityPool` — the vault

The `LiquidityPool` holds the stablecoin reserves and executes
the actual token movements. It serves two kinds of swaps:

- **Single-chain (local) swaps** — a direct exchange of one whitelisted
  stablecoin for another from the pool's reserves, at a 1:1 rate with automatic
  adjustment for differing token decimals.
- **Cross-chain swaps** — on instruction from `CrossChainHTLC`, it locks,
  unlocks, transfers, or refunds the reserved amounts that back an HTLC swap.

### Protecting the reserves

The pool enforces several guardrails so it cannot be drained or misused:

- **Token whitelisting** — only explicitly approved tokens can be swapped or
  locked.
- **X / Y / Z liquidity thresholds** — each token has configured limits that
  cap how much can leave the pool in one operation and reserve a floor of
  liquidity, preventing depletion.
- **Configurable protocol fee** per token, with a hard maximum ceiling enforced
  in code.
- **Fee-on-transfer rejection** — the pool verifies that the exact expected
  amount arrived, and rejects tokens that skim a transfer fee.
- **Per-user nonces** — replayed or out-of-order operations are rejected.

Like the HTLC contract, the pool is upgradeable (UUPS), role-gated, pausable,
and protected by reentrancy guards.

## Roles at a glance

Both contracts use OpenZeppelin's `AccessControl`. The most important roles:

| Role | Responsibility |
|------|----------------|
| **Admin** | Manages configuration and grants/revokes other roles |
| **Cross-chain manager** | Executes operations on the user's behalf (e.g. gasless flows) and coordinates cross-chain steps |
| **Pool / HTLC manager** | Configures tokens, thresholds, fees, and swap parameters |
| **Upgrader** | Authorizes contract upgrades |
| **Pauser** | Triggers the emergency pause |

The *maintainer* is a signing identity (not an on-chain role) whose EIP-712
signature represents a passed compliance check.

---

Next: **[How swaps work](./how-swaps-work.md)** walks through a swap end to end.
