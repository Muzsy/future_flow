---
status: canonical
owner: operations
last_reviewed: 2026-10-12
---

# ADR-007 — Recovery remains fail-closed on incomplete authority

**Status:** Accepted  
**Recorded:** 2026-10-12  
**Decision predates this ADR migration.**

## Context

A DB restore that starts successfully may still have stale deletion/revocation state, incomplete Auth/Storage coverage or incorrect role/grant authority. Reopening service before these are verified risks privacy and data-integrity violations.

## Decision

Recovery is fail-closed. Service writers, paid AI and gated features remain disabled until data integrity, Auth/authority, privacy replay, writer-fence and post-recovery health checks pass.

For complete hosted Supabase loss, the accepted current boundary is a closed, manual rebuild rather than an unverified automatic full-service recovery promise.

## Consequences

- availability may be sacrificed for integrity/privacy during recovery;
- isolated restore proof is required but not sufficient for reopening;
- backup scope must be explicit;
- deletion/revocation replay and role/grant checks are first-class recovery gates;
- automation must not silently remove the manual full-loss boundary.

## Alternatives considered

- reopen immediately after DB rows restore: rejected;
- best-effort automatic hosted recovery without authority proof: rejected.

## Related

- `../operations/RECOVERY_HU.md`
- `../operations/BACKUP_HU.md`
- `../operations/SECURITY_OPERATIONS_HU.md`
