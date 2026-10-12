---
status: canonical
owner: architecture
last_reviewed: 2026-10-12
---

# ADR-001 — Structured WorldState is authoritative

**Status:** Accepted  
**Recorded:** 2026-10-12  
**Decision predates this ADR migration.**

## Context

Alterward AI-generated narrative and persistent simulation state must stay consistent across continuation, reload and forks. Treating generated prose as the primary truth would make deterministic validation, branching and recovery unreliable.

## Decision

Validated structured profile/domain state and persisted WorldState are authoritative. Narrative text is derived presentation/content over that state.

If narrative and structured state conflict, the validated structured state wins. Any state-changing AI proposal must pass schema/domain validation before persistence.

## Consequences

- continuation can restart from persisted state rather than replaying prose;
- forks inherit explicit state revisions;
- tests can assert domain state independently from writing style;
- repair/re-generation may change prose without silently changing facts;
- migrations/contracts for state are high-authority artifacts.

## Alternatives considered

- prose-only memory: rejected because it is hard to validate and fork safely;
- LLM chat history as authority: rejected because provider context is not durable product state.

## Related

- `../architecture/ARCHITECTURE_HU.md`
- `../product/PRODUCT_HU.md`
- `../V2_SIMULATION_CONTRACT_HU.md`
