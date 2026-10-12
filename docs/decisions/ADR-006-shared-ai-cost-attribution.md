---
status: canonical
owner: shared
last_reviewed: 2026-10-12
---

# ADR-006 — Shared AI cost is attributed to the entitled initiator

**Status:** Accepted  
**Recorded:** 2026-10-12

## Context

A Shared event can involve several participants but is generated as one common AI pipeline. Charging or budgeting every participant independently would not match the actual initiation path and would conflict with sponsored Guest participation.

## Decision

Paid Shared AI generation is initiated only by an entitled subscriber and is attributed to that user's `requested_by_user_id` plus the project budget.

Passive/Guest participants are not charged as separate common AI generations merely for being present.

## Consequences

- initiation permission and cost ownership align;
- sponsored Guests cannot consume paid Shared AI directly;
- cost telemetry can be measured by initiator/context/event;
- later personal prose generation may have its own separate cost attribution.

## Alternatives considered

- split every common run equally across participants: rejected;
- charge every participant a full run: rejected;
- project-only attribution without user initiator: rejected because it weakens user-level budget enforcement.

## Related

- `../features/shared/SHARED_CONTEXT_HU.md`
- `../product/MONETIZATION_HU.md`
