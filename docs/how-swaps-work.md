# How Swaps Work

Two kinds of swap share the same building blocks. Both begin with an off-chain
compliance approval and end with tokens paid out from a protocol liquidity pool.

## Single-chain swap

A single-chain swap exchanges one stablecoin for another on the *same* chain,
served directly from the pool.

1. **Quote & approval.** The user chooses the token pair, amount, and
   recipient. The backend runs AML/compliance checks and, if they pass, returns
   an EIP-712 *maintainer signature* authorizing exactly this swap.
2. **Execute.** The swap is submitted to the `LiquidityPool` together with the
   maintainer signature. The pool verifies the signature, the deadline, and the
   user's nonce.
3. **Payout.** The pool pulls the input token from the user, converts the amount
   1:1 (adjusting for token decimals), applies any protocol fee, checks its
   liquidity thresholds, and transfers the output token to the recipient.

Because everything happens in one transaction on one chain, there is no time
lock or secret involved — the atomicity is inherent.

## Cross-chain swap

A cross-chain swap moves value between two chains. This is where the HTLC
mechanism does its work: the swap is locked on both chains against the same
secret hash, and revealing the secret settles both sides.

1. **Approval.** As above, the backend runs compliance checks and issues a
   maintainer signature.
2. **Lock on the source chain.** The user's funds are locked in the source-chain
   HTLC against the secret hash, with a longer time lock.
3. **Lock on the destination chain.** The protocol reserves the payout amount in
   the destination-chain pool against the same secret hash, with a shorter time
   lock.
4. **Claim.** The secret is revealed to claim the funds on the destination
   chain. Once revealed, the same secret is used to release the locked funds on
   the source chain, completing the swap for the protocol.
5. **Refund (only if something goes wrong).** If the swap is not completed before
   the time locks expire, each side is independently refunded. Because the
   source lock outlasts the destination lock, no participant can be left exposed.

## Gasless options

Users do not need to hold the chain's native gas token to swap. The contracts
support several ways to authorize a token transfer with a signature instead of a
separate on-chain approval transaction:

- **ERC-20 Permit** — for tokens that natively support permit; the user signs an
  allowance off-chain.
- **Permit2** — a universal allowance mechanism for tokens without native
  permit, after a one-time approval to the Permit2 contract.
- **Signature + execution fee** — the user signs the operation and the protocol
  executes it on their behalf, deducting a fee to cover gas.

In these flows the protocol's *cross-chain manager* role submits the
transaction, but it can only act on the exact operation the user (and the
maintainer) signed.

---

See **[HTLC & Liquidity Pool contracts](./htlc-and-pool.md)** for what each
contract does, or **[Backend role](./backend.md)** for the off-chain side.
