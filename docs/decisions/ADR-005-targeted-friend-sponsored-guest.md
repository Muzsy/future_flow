---
status: canonical
owner: shared
last_reviewed: 2026-10-12
---

# ADR-005 — Targeted Friend sponsored Guest seat

**Status:** Accepted  
**Recorded:** 2026-10-12

## Context

The first Shared growth path needs a paying/entitled user to invite a non-subscriber friend without granting that friend host or paid-AI privileges.

## Decision

A Free user may hold at most one live sponsored Guest membership, only in `friend_group`, and only from an invite explicitly targeted to that user's ID.

Generic/bearer invite links do not create Free sponsored entitlement.

Sponsored Guest can participate in allowed common decisions/read common canon and receive allowed personal impacts, but cannot create contexts, invite others or initiate paid Shared AI.

## Consequences

- DB enforces one live sponsored seat and friend-only mode;
- membership persists `sponsored_guest` explicitly;
- subscriber downgrade is not silently converted to Guest;
- romantic/work/hobby/sports remain subscriber-only until a later decision.

## Alternatives considered

- free Guest from any bearer invite: rejected for abuse/control reasons;
- unlimited friend Guest memberships: rejected;
- require invitee subscription before first Shared experience: rejected for the first Friend growth flow.

## Related

- `../features/shared/SHARED_CONTEXT_HU.md`
- `../product/MONETIZATION_HU.md`
- `../../database/migrations/037_shared_sponsored_guest_seats.sql`
