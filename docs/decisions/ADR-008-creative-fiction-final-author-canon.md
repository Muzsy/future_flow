---
status: canonical
owner: architecture
last_reviewed: 2026-10-17
---

# ADR-008 — Creative fiction closes canon after authoring

**Status:** Accepted for implementation by the owner, 2026-10-16. Production rollout remains gated.

## Context

The personal story is a possible fictional life built from user-provided anchors. The previous writer could only render an already validated event list. Inventing a concrete encounter or result then failed fidelity or disappeared from later history. The owner explicitly requests creative freedom with the existing model, plausible consequences, fixed user boundaries and a compelling reading experience.

## Decision

Introduce the separate `narrative-fiction-v2` policy. Five normal calls are draft planner → author → final plan reviewer → fidelity → literary editor. The author returns the final candidate, plan/memory delta, continuity facts and chapter together. Server domain replay and final reviews validate that authored package before atomic persistence. The planner draft is not final canon.

New plausible fiction is permitted. Initial state is not an eternal prohibition. Active hard constraints, accepted decisions, ownership, privacy and user-specified unacceptable tradeoffs remain binding. Fictional development never updates the real base profile or Shared consent. Anonymous incidental characters and dialogue may be created without making every detail a persistent state entity. A new recurring actor needs canonical provenance.

Story facts preserve concrete details outside typed state, scoped to current events and the owned branch prefix. They do not replace typed financial/employment/asset/location changes. The same 12 KiB total context and 32 KiB artifact bounds remain.

Freeze five normal/max-nine physical requests and one global content repair in the new policy. Late structural repair needs four final-stage calls. A prose-only repair reuses the exact final plan review and takes at most eight calls. Transport retries count; all existing monetary, lease, privacy and quota guards remain. Old policies keep their original max-seven/max-eight behavior.

## Consequences

- Draft and final author outputs need distinct checkpoint/receipt bindings; final commit replays and rechecks persisted proof.
- Current fiction and future choices are different: the final unresolved option is never silently accepted.
- Fictional facts live in versioned period artifacts, never in the real profile; forks inherit only their prefix.
- Disabling the mode blocks incompatible continuation of existing v2 histories rather than losing continuity through legacy fallback.
- Final plan review happens later, so a rejected proposal can cost more. Larger authored output and repairs require measured cost/latency.
- Model/editor scores are not independent human quality evidence. Existing literary/human/recovery release gates remain.
- The initial implementation is one integrated feature PR because contracts, receipt verification and transactional commit must remain coherent. Its commits follow the F00–F06 work packages; this does not authorize partial production activation.

## Alternatives considered

- Prompt-only relaxation: rejected; unrecorded invented events would be lost or rejected.
- Keeping the draft authoritative: rejected; it preserves the writer restriction.
- Separate additional routine reviewer call: unnecessary; move the existing review after the author.
- Unlimited repair/model switching: rejected; keep the model and bounded spending.

## Related

- [Product](../product/PRODUCT_HU.md)
- [Creative implementation plan](../plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md)
- [AI output is not authoritative](ADR-003-ai-output-not-authoritative.md)
- `packages/contracts/src/fiction.ts`, `packages/core/src/fiction.ts`


## Sequence quality amendment — 2026-10-16

Direct reading found repeated scene-resolution and ending patterns despite novelty=4. New qualityPolicy 2.1.0 freezes planner/author/reviewer v3 and editor v2/report 1.1.0, retains all previous policies, and includes owned bounded scene/opening/ending sequence evidence. Every editorial dimension must reach 4 and verdict must pass; four explicit sequence flags and exact comparison coverage are mandatory. Structural repetition requires package repair. A recurring character or motif can earn its place through changed causality; novelty does not require spectacle. No new routine call or additional repair is introduced. Automatic scores remain insufficient for human quality acceptance.

## Human-quality amendment — 2026-10-17

The v4 candidate freezes measured v1–v3 behavior and selects planner/author/reviewer v4, editor v3/report 1.2.0 and qualityPolicy 2.2.0 for new jobs only. Three additional flags check rhetorical shape, invisible system mechanics and behavioral variety. Compact versioned signatures compare up to eight owned historical periods alongside the protected latest three raw scene/opening/ending entries within the same 12 KiB bound. Optional signatures cannot displace required continuity; withholding clears both layers. Historical artifacts remain unchanged. Behavioral/structural failures require canon-scoped repair evidence; surface-only failures may preserve the exact reviewed package. No additional normal request, repair or model change.

The primary quality target is immersion, credible characters, meaningful development and continuation desire. AI suspicion is secondary diagnostic feedback. Offline fixture tests prove gate routing and lifecycle behavior, not model recognition or literary quality. Separate human H1 (three chapters) and H2 (two profiles, six chapters each plus an alternative fork) remain unmeasured; their thresholds require an owner decision before measurement. Existing release and production gates remain unchanged.
