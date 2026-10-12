---
status: canonical
owner: architecture
last_reviewed: 2026-10-12
---

# ADR-002 — Event → Choice → Consequence transition model

**Status:** Accepted  
**Recorded:** 2026-10-12  
**Decision predates this ADR migration.**

## Context

A persistent alternative life needs explicit decision points and durable consequences rather than unconstrained chapter generation.

## Decision

The canonical simulation transition is:

`WorldState → Event → Choice → Consequence → new WorldState`

A choice is persisted. Continuing an existing branch advances that branch from its accepted state. Forking a historical decision creates a new branch and preserves the original.

## Consequences

- stale revision/conflicting choice can be rejected;
- consequence is explicit domain data, not only narrative implication;
- branch history remains auditable;
- future UI/mobile clients can use the same API model.

## Alternatives considered

- always create a new branch for every choice: rejected for normal continuation;
- free-form chat continuation: rejected because decision/state boundaries become ambiguous.

## Related

- `../V2_SIMULATION_CONTRACT_HU.md`
- `../product/PRODUCT_HU.md`
