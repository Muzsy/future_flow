---
status: canonical
owner: shared
last_reviewed: 2026-10-12
---

# ADR-004 — Shared host entitlement and participant entitlement are separate

**Status:** Accepted  
**Recorded:** 2026-10-12

## Context

Requiring every invited participant to hold the same subscription as a Shared host creates unnecessary acquisition friction and does not match where common AI generation cost is initiated.

## Decision

Shared authorization distinguishes:

- subscriber/host entitlement for creating, inviting/administering and initiating paid Shared AI;
- participant entitlement for taking part in an existing context.

Membership stores the entitlement mode explicitly. Subscriber context slots and sponsored participant slots are counted separately.

## Consequences

- host rights do not automatically transfer to invitees;
- a participant can be admitted under a constrained sponsored policy;
- billing provider can remain upstream of entitlement rather than writing feature state;
- participant downgrade/upgrade rules can be explicit instead of inferred.

## Alternatives considered

- every participant must independently qualify as subscriber: retained for types without a sponsored policy, but rejected as the universal rule;
- host fully sponsors unlimited participants: rejected because it removes necessary product/cost limits.

## Related

- `../features/shared/SHARED_CONTEXT_HU.md`
- `../product/MONETIZATION_HU.md`
