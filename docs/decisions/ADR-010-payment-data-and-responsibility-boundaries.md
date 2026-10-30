---
status: canonical
owner: product
last_reviewed: 2026-10-30
related:
  - ../product/MONETIZATION_HU.md
  - ../DEVELOPMENT_PLAN_HU.md
  - ADR-004-shared-host-participant-entitlement.md
  - ADR-006-shared-ai-cost-attribution.md
  - ADR-007-recovery-fail-closed.md
---

# ADR-010 — Payment data and responsibility boundaries

**Status:** Proposed (accepted when the owner approves the PR)  
**Date:** 2026-10-30

## Context

- B01 (billing foundation) was PENDING. On 2026-10-30 the owner chose Stripe with Managed Payments (Stripe is the merchant of record) and a single launch package: 14,99 USD/month, 8 chapters per billing cycle, with a 3-month launch discount (9,99 USD, 5 chapters) for the owner-designated tester accounts, plus one free taster chapter. Numbers are configuration and may be refined after measurements.
- [MONETIZATION_HU §9](../product/MONETIZATION_HU.md) says a payment provider may change only entitlement/billing state, never Shared or life state.
- The personal chapter balance and the USD AI-budget ledger are separate ledgers; billing data never enters generation input (V6).
- Recovery is fail-closed (ADR-007) and data control does not depend on payment (MONETIZATION_HU §8).

## Decision

1. **Data split.** Card and billing-address data never reach Alterward servers or database (hosted Checkout). Alterward stores only: provider customer id, subscription id, price/offer version, status, period start/end, cancel-at-period-end flag, our paid-invoice list (cycle counter), revocation flag, processed event ids, and the chapter ledger. No e-mail address and no full webhook payload is stored.
2. **Roles.** Stripe, as merchant of record, is the seller towards the buyer (tax, invoice, disputes, buyer support) and an independent controller of payment and tax data. Alterward operates the product and access. The privacy notice names this relationship.
3. **Source of truth.** The provider holds the subscription state; Alterward's entitlement projection is derived and may only be tightened, never widened, by anything other than a verified provider event. After a restore the projection is reconciled with the provider; any mismatch stays closed.
4. **Webhook.** The raw body is verified against the `Stripe-Signature` header (HMAC-SHA256, time tolerance, constant-time comparison) before it is parsed. Processing is idempotent by event id in the same transaction as the state change, and tolerant of replay and reordering (newer state events win; a revoked subscription is never reopened by a later event). An unknown, malformed or unverified event changes no entitlement. The webhook secret has its own scope. Exposing the endpoint past Cloudflare Access is a separate production-configuration change.
5. **Entitlement boundary.** Only chapter generation is gated by billing. States: none, active, canceling (until period end), past_due (bounded), ended, revoked. Anything unknown means none. Refund and dispute revoke access at once and zero the unspent allowance; chapters already generated stay. Reading, export, deletion and security operations never depend on billing.
6. **Chapter balance.** A separate ledger with idempotent reserve, consume and release. Only a new chapter that was durably saved consumes allowance; a failure or an identical retry does not. The one free taster chapter is a separate bucket and never reduces the paid allowance. The allowance does not roll over to the next cycle. The USD AI-budget ledger and the closed-beta protections are unchanged.
7. **Cycle counter and the 5→8 switch.** The allowance of a cycle comes from Alterward's own per-subscription paid-invoice counter and the offer version (`launch_v1` for discounted cycles 1–3, `standard_v1` afterwards), never from the provider coupon object.
8. **Launch discount.** The coupon is attached to a Checkout Session server-side only, for accounts on a configured list of at most 10 user ids (never e-mail addresses), once per account. The provider-side redemption cap is a safety net. There is no public coupon code.
9. **Managed Payments constraints.** Prices are tax-inclusive. The Checkout Session uses a pinned API version with Managed Payments enabled and omits the fields Managed Payments does not allow (automatic tax, tax id collection, adaptive pricing, payment method types, invoice creation). Coupon behaviour with Managed Payments, the exact event names and the refund/dispute payload shapes are verified in the sandbox before any live use.
10. **Account deletion.** Deletion cancels the subscription at the provider; Alterward-side billing identifiers are deleted or anonymised. Tax records the law requires stay with the provider.
11. **Environments.** Test and live mode are strictly separated (keys, webhook endpoints, database). Billing routes and billing enforcement are disabled by default; real money, live keys and production configuration need separate owner authorization.

## Consequences

- New billing module and migration; the privacy-recovery schema baseline, restore tests and recovery runbooks must move together with the migration.
- Dependence on the payment provider: during an outage existing access follows the bounded renewal slack, then lapses until reconciled.
- The privacy notice and terms (WP-L) must name the provider and the controller split.
- A provider-independent adapter boundary keeps a later provider switch possible.

## Alternatives considered

- Stripe as seller with Stripe Tax: cheaper, but VAT/OSS filing stays with the operator.
- Handling card data ourselves: rejected (PCI scope, risk).
- Another merchant of record (Paddle and others): see the provider comparison; Paddle remains the fallback if Managed Payments is not granted.
- Billing state in generation input: rejected (V6).
- Taking the 5→8 switch from the provider coupon: rejected (the coupon object disappears when it ends, and it does not identify the account).

## Related docs/code

- [MONETIZATION_HU](../product/MONETIZATION_HU.md) §8, §9, §15
- [DEVELOPMENT_PLAN_HU](../DEVELOPMENT_PLAN_HU.md) B01
- [SECURITY_OPERATIONS_HU](../operations/SECURITY_OPERATIONS_HU.md)
- `packages/core/src/billing.ts`, `packages/core/src/billing-stripe.ts`
