---
status: canonical
owner: architecture
last_reviewed: 2026-10-20
---

# ADR-009 — Recurring-character state is folded from chapter artifacts

**Status:** Proposed (draft, 2026-10-20). Not accepted until the owner accepts it; no implementation depends on it before then. The frontmatter status is the repository's document status (`docs:check`), not the decision status.

## Context

The living-world work ([plan](../plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md)) gives recurring fictional people persistent, behaviour-causing state: a stable profile, a changing state and a relationship state. It must keep what v8 already guarantees: branch-scoped history, atomic period commit, hash-bound requests, checkpoint recovery, byte-bound memory (12 KiB) and artifact (32 KiB), forks that share only their prefix, and recovery that fails closed ([ADR-007](ADR-007-recovery-fail-closed.md), [ADR-008](ADR-008-creative-fiction-final-author-canon.md)).

Two storage shapes are possible: state derived from the period artifacts, or a mutable per-character store. The owner considers a character database the long-term shape and approved a path that starts with the artifacts and keeps the database open (2026-10-20, "Fold + DB-út").

## Decision

1. **Source of truth in the first round.** The chapter (period) artifacts are authoritative. In the new policy generation each artifact carries a compact character delta (profile additions, dynamic-state and relationship updates, archiving of a removed actor). At most 6 actors are updated per chapter (provisional, finalised after the phase 3 measurement). No new table, column or migration is added; the existing `aw_periods.narrative_artifact` is used.
2. **State is computed, not stored.** A deterministic server function folds the owned history prefix into the current character state. The model never sees the whole state: a deterministic, hash-bound projection of the relevant characters (at most 8 KiB, provisional) is part of the planner request and its request hash. The fold and projection are plain code, not AI calls.
3. **Branch and recovery semantics follow the artifacts.** Same prefix gives the same state; after a fork the states diverge; a period that does not commit leaves no character state. A new policy never rewrites or re-reads an old artifact with a new meaning.
4. **Privacy boundary.** Rich profiles exist only for wholly fictional actors. For supplied (real) people only `user_supplied`, `branch_fiction` and `interaction_derived` provenance is allowed and no private state is invented. A job that moves from an older policy starts from the legacy `fictionalActors` fields as a seed with unknown new fields; nothing is inferred retroactively from old prose.
5. **Path to a database.** A character database, when introduced, is a materialised read model built from the chapter artifacts. It must be rebuildable from them at any time and retroactively, without data loss. While the artifacts are authoritative it is never a second source of truth. A snapshot (a derived, hash-bound checkpoint that is rebuildable and never authoritative) is the intermediate step if folding becomes slow.
6. **Switch conditions.** The database is introduced when either (a) a product feature works directly with characters (listing, editing, search across stories, statistics), or (b) measurement shows the fold is too slow or its state too large. Introducing it, and especially making it authoritative, needs its own ADR that covers: the migration; backup and recovery (N09, migration 038 and the recovery image); account deletion, selective life deletion and privacy replay; fork isolation of the rows; and, if it becomes authoritative, the supersession of this ADR.

## Consequences

- Atomicity, fork behaviour and recovery come from the existing artifact machinery; the first round needs no migration and no new privacy or deletion path.
- The cost is a deterministic fold on every generation and the 32 KiB artifact bound for the delta; the plan requires a worst-case artifact test and forbids raising the bound before compacting the delta.
- A product feature that edits or lists characters directly is not possible until the database path is taken.
- The new policy needs its own prompt/schema/artifact versions; v1–v8 stay frozen and the recovery image must understand the new artifact fields before any rollout (N09, ordering (b) of the plan).

## Alternatives considered

- **Mutable current-state table now.** Rejected for the first round: new tables and migration, new backup, restore, deletion and privacy paths, per-fork copies, and a second truth next to the artifacts.
- **Character psychology inside `LifeStateV2`.** Rejected: it mixes canonical typed life state with narrative interpretation and complicates privacy, replay and recovery.
- **LLM reconstruction of profiles from earlier chapters.** Rejected: extra cost, not reproducible, privacy-sensitive and a canon reinterpretation.
- **A separate world-simulation model call per chapter.** Rejected for the first round: a sixth stage, more latency, checkpoints, retries and failure modes without evidence that it is needed.

## Related docs/code

- [Living-world plan](../plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md), appendix C decisions 1, 2, 8, 9, 14 and 15
- [ADR-007](ADR-007-recovery-fail-closed.md), [ADR-008](ADR-008-creative-fiction-final-author-canon.md)
- `packages/database/src/fiction-memory.ts`, `packages/contracts/src/narrative.ts`, `database/migrations/038_narrative_artifacts.sql`
