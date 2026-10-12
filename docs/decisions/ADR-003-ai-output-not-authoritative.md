---
status: canonical
owner: architecture
last_reviewed: 2026-10-12
---

# ADR-003 — AI output is not authoritative by itself

**Status:** Accepted  
**Recorded:** 2026-10-12  
**Decision predates this ADR migration.**

## Context

Alterward depends on generative models, but provider output may be malformed, inconsistent, unsafe for a specific data boundary or simply differ between retries.

## Decision

AI output is treated as an untrusted proposal until it passes schema and domain validation. AI may generate narrative and structured candidate data, but entitlement, privacy, budget, persistence authority and final domain invariants stay in deterministic application code.

## Consequences

- structured outputs must be parsed/validated;
- repair is bounded and cannot bypass domain rules;
- AI cannot grant access, increase budget or expose another user's private state;
- provider/model changes remain behind stable application contracts.

## Alternatives considered

- direct persistence of model output: rejected;
- prompt-only enforcement of business/privacy rules: rejected.

## Related

- `../architecture/ARCHITECTURE_HU.md`
- `../AI_MODEL_ROUTING_HU.md`
- `ADR-001-structured-world-state-authoritative.md`
