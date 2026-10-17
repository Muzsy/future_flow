---
status: active-supporting
owner: agents
created: 2026-10-17
base_commit: 2da2e8c569e926ffe4b831aaf7af67caa75c9d13
required_predecessor_pr: 48
required_predecessor_head_at_creation: 30471490b7a990d916b6cc983209a54e6971b299
measured_v4_source: 3809c560e4990c8fcc149a4d1af4e38a47c74c1c
issue: 45
workstream: F05/F06 quality follow-up
state: implementation-in-progress
actual_implementation_base: 058555005e7e85905cf53081bfa18226780cf9ac
paid_provider_calls_authorized_for_quality_validation: true
budget_cap_change_authorized: true
approved_additional_development_usd: 7
approved_cumulative_development_usd: 15.204535
production_authorized: false
---

# Codex task — v4.1 story-engine hardening + repair provenance + real 2×6 sequence validation

## Role

You are the implementation agent for the Alterward repository.

Your task is to make the NEXT targeted story-quality improvement after PR #48, then prove the candidate with real provider generation.

This is not a generic prompt-tuning task. It is a source-bound, measured quality iteration.

Product intent:

> Alterward should feel like entering a personalized book or film. One good chapter is not enough; after several chapters the reader should not be able to identify a repeating Alterward story template.

The owner explicitly requires story-quality development to be validated with real AI calls. Offline/mock tests remain mandatory for correctness and safety, but mock output is never literary-quality evidence.

## 1. Repository and execution precondition

- Repository: `Muzsy/future_flow`
- Base branch: `main`
- Main HEAD at prompt creation: `2da2e8c569e926ffe4b831aaf7af67caa75c9d13`
- Required predecessor: PR #48
  - measured v4 code: `3809c560e4990c8fcc149a4d1af4e38a47c74c1c`
  - PR head at prompt creation: `30471490b7a990d916b6cc983209a54e6971b299`

### HARD PRECONDITION

PR #48 is open at prompt creation.

Do not implement this task on the old `main`. Do not stack the implementation directly on the PR #48 branch unless the owner explicitly changes the Git plan.

At task start:

```bash
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
```

Then verify that PR #48 has been merged and that current `main` contains the v4 implementation.

At minimum the merged source must contain:

- `fictionV3Policy()`;
- selected v4: planner/author/reviewer v4, editor v3, quality policy `2.2.0`;
- `fictionSequenceSignatureSchema`;
- editorial report `1.2.0`;
- `sequenceSignatureHistory`;
- seven v4 sequence flags;
- creative-only max-six-period evaluation;
- complete-sequence/fork human-review bundle support.

If PR #48 is not merged, or current main materially differs from its merged result:

**STOP. Do not duplicate PR #48. Report the exact conflict/precondition failure.**

Once satisfied, record the ACTUAL current-main SHA as implementation base in the PR body.

## 2. Mandatory reading order

Follow `AGENTS.md` exactly.

Read:

1. `AGENTS.md`
2. `docs/DOCS_INDEX_HU.md`
3. `docs/STATUS_HU.md`
4. relevant F05/F06 and N08 sections of `docs/DEVELOPMENT_PLAN_HU.md`
5. `docs/product/PRODUCT_HU.md`
6. `docs/architecture/ARCHITECTURE_HU.md`
7. `docs/decisions/ADR-008-creative-fiction-final-author-canon.md`
8. `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
9. `docs/plans/alterward_fiction_human_quality_development_plan_codex.md`
10. `docs/operations/NARRATIVE_EVALUATION_HU.md`
11. `docs/operations/NARRATIVE_RELEASE_HU.md`
12. current implementation/tests touched by this task.

Do not bulk-load historical documentation unless needed for a specific compatibility question.

## 3. Task authority

- Issue: `#45`
- Workstream: F05/F06 quality follow-up.
- PR #48 is the mandatory predecessor.
- Authorized:
  - implement the next targeted creative-fiction quality candidate;
  - extend the SYNTHETIC LOCAL evaluation harness to retain diagnostic repair provenance;
  - run real paid development generation after technical checks, subject to explicit numeric budget authority.
- Not authorized:
  - production deployment or production mutation;
  - production cohort activation;
  - ledger reset;
  - beta-window reset;
  - raising a numeric budget cap without separate explicit owner authorization.

Owner direction for this work package:

1. Fix known quality weaknesses FIRST.
2. Then perform the expanded real-AI measurement.
3. Every story-quality iteration must end with real AI generation.
4. Cost is secondary to quality, but every call/cost/latency/repair must be measured.
5. Narrator/author personality profiles are explicitly DEFERRED and OUT OF SCOPE.

## 4. Measured v4 baseline to preserve

Real v4 diagnostic source:

`3809c560e4990c8fcc149a4d1af4e38a47c74c1c`

Model in all stages: `gpt-6.1-sol`.

Real output:

- `The Missing Sleeve` — 5 calls, no repair, accounted USD 0.2030450
- `Where the Door Opens` — 5 calls, no repair, accounted USD 0.2541875
- `A Voice for the Kitchen` — 8 calls, one repair, accounted USD 0.4737725
- `The Pale Centre` — 8 calls, one repair, accounted USD 0.4795800

Totals:

- 26 physical calls
- 2/4 accepted texts used repair
- 1.410585 USD accounted
- 1.2957948 USD usage estimate
- 0.35264625 USD accounted / accepted text including repairs
- p95 latency 420594 ms
- global development ledger after run: 255 calls / 8.204535 USD accounted / 7.5994029 USD usage estimate
- then-remaining under cumulative 10 USD cap: 1.795465 USD
- zero unknown usage / zero unassigned reservation

Do not reinterpret as product economics or invoice data. Do not erase or overwrite this evidence.

## 5. Human audit conclusions

### Preserve these strengths

Do NOT regress:

- concrete physical scene writing;
- sensory/object-based storytelling;
- incidental world noise without mandatory payoff;
- NPC autonomy;
- StoryFact/owned-prefix continuity;
- meaningful fork divergence;
- system mechanics mostly staying out of prose;
- dates appearing for real story reasons rather than engine boundaries;
- locale-plausible ordinary names;
- quiet plausible storytelling without forced spectacle.

Large generic prompt rewrites are undesirable.

### Weakness A — repeated external-opportunity progression

The main line still tends toward:

```text
protagonist makes/tries something
→ another person reacts
→ reaction creates a new external opportunity
→ unresolved decision
```

Observed:

- portfolio feedback → magazine opportunity;
- publication / reader contact → booklet collaboration opportunity;
- completed booklet → library presentation opportunity.

Each occurrence is plausible. The defect is repeated progression engine across the sequence.

The final unresolved decision is required by Life V2 and remains mandatory.

Do NOT remove decisions. Diversify how the story reaches them.

Valid progression can come from:

- consequence of protagonist action;
- material/technical failure;
- unresolved interpersonal difference;
- self-directed experiment;
- delayed cost of an earlier choice;
- withdrawal;
- discovery;
- mundane practical constraint;
- persistence without external validation;
- relationship shift;
- failed attempt;
- partial result;
- an external opportunity when genuinely earned and not the default engine.

Do not implement a hard archetype rotation. Do not ban external opportunities. Do not manufacture drama merely to differ.

### Weakness B — repeated protagonist self-correction

The sequence still contains variants of:

```text
wants to explain / defend / insist
→ pauses, deletes, stops or withholds
→ behaves more wisely
```

The existing v4 schema already exposes:

- `protagonistResponse` values including `immediate_self_correction`, `defend_then_change`, `delayed_change`, `persist`, `misunderstand`, `avoid`, `act_without_resolution`, `no_correction_arc`, `mixed`;
- rhetorical flag `almost_then_stop`.

Use them.

Do not create a hard server rule requiring rotation.

The protagonist may plausibly:

- remain wrong for a while;
- send an overlong explanation;
- defend a choice;
- understand only part of the issue;
- avoid something;
- persist;
- leave a disagreement unresolved;
- realize the issue in a later chapter.

Objective: believable behavioral variety, not forced imperfection.

### Weakness C — repair evidence is lost

Real v4 required repair in 2/4 accepted outputs.

Known:

- main third chapter: editor → prose repair;
- alternative third: fidelity → author-package repair.

After completion the exact first rejected reports/prose/package were unavailable.

Fix this in the **synthetic/local evaluation harness only**.

Do not weaken production privacy/retention to solve evaluation observability.

## 6. Goal

Deliver one bounded quality iteration with two outcomes.

### Outcome 1 — new candidate policy

Preserve measured v4 byte-for-byte and add a NEW policy targeting:

1. repeated external-opportunity story progression;
2. repeated immediate/tidy protagonist self-correction;
3. over-polite immediate resolution when delayed/unresolved behavior is more credible.

Product shorthand may call this “v4.1”.

**Code must not overwrite v4.**

Recommended code versions:

- planner: `life_fiction_plan.v5`
- author: `life_fiction_author.v5`
- plan reviewer: `life_fiction_plan_review.v5`
- fidelity: keep `life_fiction_fidelity.v1`
- editor: `life_fiction_editor.v4`
- quality policy: `2.3.0`

Do not introduce a new editorial report schema version unless a genuinely new machine-checked field is required. Existing report `1.2.0` already has the needed categories.

### Outcome 2 — real expanded validation

After implementation and offline verification, generate a real candidate corpus:

- 2 distinct synthetic profiles;
- 6 consecutive main-line chapters/profile;
- at least 1 alternate fork chapter/profile;
- target: 14 accepted final texts;
- real OpenAI API;
- gpt-6.1-sol in every current creative stage;
- same 5 normal stages;
- max9 physical requests/job;
- max1 content repair;
- dedicated development project;
- default tier;
- store=false;
- complete call/token/cost/latency/repair measurement;
- full sequence human-review bundles.

Preferred fixtures/order:

1. `creative-portfolio`
2. `career-transition`

Current PR #48 runner creates a creative-only fork for the first selected fixture and separately supports `career-transition`; after merge verify actual behavior and guarantee one fork for EACH selected profile.

## 7. New candidate prompt behavior

### 7.1 Freeze measured v4

Before changing prompts:

- add/confirm explicit hash tests for measured v4 planner, author, plan-review and editor prompt strings;
- keep v1–v3 hashes unchanged.

Any v1–v4 prompt-byte change is a task failure unless separately approved for a proven compatibility bug.

### 7.2 Progression-source diversity

Add a compact v5 instruction layer on top of v4.

Planner/author use nearest `sequenceHistory` + longer `sequenceSignatureHistory` as comparison evidence.

Explicitly tell them:

- external invitation/offer/publication/selection/promotion/exhibition/collaboration request is NOT the default advancement mechanism;
- inspect recent `dramaticEngine`, `turningPointDriver`, `resolutionMode`, ending signatures;
- when recent story repeatedly advances via `external_opportunity`, NPC or institution escalation, do not create an equivalent new escalation merely with a new person/place;
- allow an external opportunity if causally earned and its dramatic role truly changes;
- never mechanically choose an opposite enum value;
- signatures are not a rotation schedule.

The mandatory unresolved decision may instead concern:

- response to failed/partial result;
- persist/alter/abandon own plan;
- unresolved relationship difference;
- material consequence;
- self-created obligation;
- repair of something that went wrong;
- preserve/change a practice without anyone offering a new opportunity.

### 7.3 Behavioral variety

Recent `protagonistResponse` and `rhetoricalFlags` are evidence.

If history repeatedly contains `immediate_self_correction`, `defend_then_change`, `almost_then_stop`, do not automatically repeat:

```text
almost explain → stop/delete → wiser behavior
```

unless current causality genuinely earns it.

Allowed behavior includes:

- partial/delayed understanding;
- persistent disagreement;
- awkward over-explanation;
- sending the imperfect message;
- mild defensiveness;
- carried-forward misunderstanding;
- no insight arc in the current period;
- acting before emotional certainty;
- later return to the issue.

Do not require bad behavior or hostility.

### 7.4 NPC behavior

Preserve independent wants.

Additionally:

- an NPC objection need not be objectively correct;
- two preferences may remain incompatible;
- NPCs do not need to deliver the chapter thesis;
- constructive conversation is valid, but important NPCs should not all be unusually concise, emotionally regulated and pedagogically useful.

### 7.5 Editor v4 interpretation

Use report 1.2.0 unless new schema is objectively required.

Strengthen existing flags:

#### `distinctDramaticStructure`

False when recent periods substantively repeat:

```text
creation/work
→ outside validation
→ new offer/opportunity
→ decision
```

even with different NPC, medium, scale or location.

Do not fail merely because an external opportunity occurs.

#### `behavioralVariety`

False when protagonist repeatedly resolves discomfort via same immediate tidy self-correction, especially with repeated `immediate_self_correction`, `defend_then_change`, `almost_then_stop` evidence.

#### `distinctRhetoricalShape`

Treat repeated “write/explain → delete/stop” as a sequence-level formula only when it becomes recurrent, not as a defect on one occurrence.

#### `independentProgression`

A larger/more prestigious opportunity is not automatically independent progression.

### 7.6 Plan reviewer v5

Catch obvious progression repetition before authoring when possible.

A plan culminating again in another externally supplied opportunity after several equivalent periods is a novelty/causal-shape concern when the opportunity serves the same engine.

Do not reject an earned opportunity merely because its enum matches history.

## 8. Evaluation-only repair provenance

### 8.1 Scope boundary

Applies to `scripts/evaluate-narrative.ts` and local synthetic evaluation stack only.

Do NOT persist rejected literary outputs into production application tables.

Do NOT weaken production deletion/privacy/retention.

### 8.2 Required local attempt trace

For every creative evaluation case retain ordered provider attempts under the evaluation output, e.g.:

```text
<OUT>/diagnostic-attempts/<safe-case-id>.json
```

File mode `0600`.

Each attempt must retain enough to reconstruct first-vs-final behavior:

```ts
{
  caseId: string
  ordinal: number
  task: string
  model: string
  inputHash: string
  outputHash: string
  output: unknown
  usage: {
    inputTokens: number | null
    outputTokens: number | null
    cachedInputTokens?: number | null
  } | null
  requestId: string | null
  latencyMs: number
  repairFeedback: {
    mode?: 'prose_only' | 'author_package'
    message?: string
  } | null
}
```

Exact naming may follow repo conventions.

Essential:

- first rejected author/fidelity/editor output survives;
- final accepted output survives;
- order survives;
- repair trigger message survives;
- hashes survive;
- usage/latency survive;
- source/case binding survives;
- resume does not duplicate attempts.

### 8.3 Capture layer

Prefer evaluation-layer capture over production worker retention.

PR #48 runner already wraps real `responses.parse`; persist synthetic parsed output/request repair metadata before worker cleanup can erase it, or use an equivalent higher-level evaluation-only design.

Do not alter production checkpoint cleanup merely for diagnostics.

### 8.4 Integrity

Trace must be bound to:

- sourceHash;
- caseId;
- provider task;
- ordinal;
- output hash.

Resume mismatch → fail closed.

Do not append evidence from another source/model/project.

### 8.5 Human bundle separation

Rejected attempts are developer diagnostics.

Do NOT include them in blinded human reader bundles by default.

## 9. Scope / expected files

Likely affected:

### Contracts

`packages/contracts/src/fiction.ts`

- v5 planner/author/reviewer enums;
- editor v4;
- quality policy 2.3.0;
- explicit frozen v4 helper;
- default `fictionPolicy()` selects v5;
- report 1.2 compatibility if no new fields needed.

### Prompts

`packages/ai/src/fiction-prompts.ts`

- freeze v4;
- add v5 progression/behavior hardening;
- no narrator personalities;
- no model change.

### Provider

`packages/ai/src/index.ts`

- route new frozen versions;
- no new routine provider stage.

### Core

`packages/core/src/fiction.ts`

- policy/report compatibility;
- gate/hash/receipt binding unchanged in authority.

### Worker

`apps/worker/src/fiction-processor.ts`

Modify only if needed for new policy/report routing. Do NOT add a stage.

### Evaluation

- `scripts/lib/narrative-evaluation-runner.ts`
- `scripts/lib/narrative-evaluation-options.ts`
- `scripts/lib/narrative-evaluation-contract.ts`
- `scripts/lib/narrative-evaluation-artifacts.ts`

Implement local attempt provenance and retain existing 6-period/sequence bundle behavior.

### Tests

At minimum inspect/update:

- `tests/fiction-human-prompts.test.ts`
- `tests/fiction-human-core.test.ts`
- `tests/fiction-human-evaluation.test.ts`
- `tests/fiction-worker.test.ts`
- `tests/fiction-fixtures.ts`
- related evaluation tests.

## 10. Non-scope

Explicitly OUT:

- narrator/author personality profiles;
- style/persona selection;
- branch author persona;
- user-facing style controls;
- model change/competition/routing;
- new routine AI call;
- second repair;
- request cap increase;
- context-bound increase;
- SQL migration unless objectively unavoidable;
- production rollout;
- Shared/billing/community/public;
- N09 production apply;
- pricing/product allowance decisions.

No unrelated refactor.

## 11. Invariants

### AI / cost

- model `gpt-6.1-sol` unchanged;
- 5 normal calls;
- max9 physical requests;
- max1 content repair;
- retry accounting unchanged;
- global development ledger cumulative;
- no reset;
- unknown usage conservatively accounted.

### Story authority

- final author package authoritative only after validation;
- accepted choice immutable;
- unresolved decision never silently consumed;
- StoryFacts preserve owned continuity;
- typed state changes remain typed;
- prose cannot directly mutate state.

### Privacy

- withheld reconstructs nothing;
- forks inherit owned prefix only;
- sibling/future history cannot leak;
- export/delete/recovery remain fail-closed;
- evaluation diagnostics synthetic-local only.

### Compatibility

- v1 readable;
- v2 readable;
- v3 readable;
- v4 readable AND byte-frozen;
- old queued snapshots do not migrate to v5;
- mixed old/new history supported.

## 12. Mandatory tests

### P01 — freeze v4

Hash-pin merged v4 prompts. v5 must not change them.

### P02 — policy compatibility

v1/v2/v3/v4/v5 valid; mismatched generation/editor/quality combinations invalid.

### P03 — external opportunity negative control

Recent signatures repeatedly show `external_opportunity` + NPC/institution-driven escalation; current candidate repeats same mechanism with renamed objects.

Expected quality failure (`distinctDramaticStructure=false` or equivalent), package repair if story engine must change.

No hard count rule.

### P04 — valid opportunity positive control

Structurally different history + genuinely earned opportunity can PASS.

### P05 — repeated self-correction negative control

Recent signatures repeat `immediate_self_correction`/`defend_then_change` + `almost_then_stop`; current chapter repeats same formula.

Expected `behavioralVariety=false` and/or `distinctRhetoricalShape=false` with correct repair scope.

### P06 — delayed misunderstanding positive control

Plausible partial misunderstanding/disagreement carried forward can PASS.

### P07 — quiet chapter positive control

No opportunity escalation, no artificial conflict; concrete action/consequence. Must be able to PASS.

### P08 — no archetype rotation

Prompt/tests prove signatures are comparison evidence, not prescribed schedule.

### P09 — editor → prose repair provenance

Trace preserves initial author/fidelity/editor, repair feedback, repaired output, final editor, order/hashes/usage.

### P10 — fidelity → package repair provenance

Trace preserves first fidelity issues and repaired package.

### P11 — max9

Structural repair path remains max9; no tenth request.

### P12 — resume

No duplicate attempt ordinals; mismatch in source/model/project fails closed.

### P13 — file permissions / secrets

Diagnostics `0600`; no API key/auth header/production data.

### P14 — human bundle separation

Accepted final prose only; rejected attempts excluded.

### P15 — old benchmark unchanged

Legacy/narrative 34-pair semantics remain unchanged.

### P16 — two six-period sequences

Offline `creative-portfolio` and `career-transition`, 6 main periods each.

### P17 — one fork/profile

One alternate third chapter for each selected profile; child excludes later parent history; total target samples 14.

### P18 — privacy/export/recovery

New policy versions parse in compatibility/recovery fixtures; no privacy regression.

## 13. Technical verification before paid calls

Before ANY paid provider call:

```bash
pnpm format:check
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
git diff --check
```

Then clean offline candidate corpus:

```bash
pnpm evaluate:narrative \
  --mode offline \
  --creative-only \
  --fixtures creative-portfolio,career-transition \
  --periods 6 \
  --out .local/narrative-evaluation/v5-two-profile-offline
```

Expected:

- 12 main samples;
- 2 fork samples;
- no production mutation;
- local attempt provenance works;
- old benchmark remains green.

Mock PASS is technical evidence only, never task literary completion.

## 14. Required real-AI validation

### 14.1 Mandatory for quality completion

After implementation, tests, offline corpus, clean commit and sourceHash verification, run REAL candidate diagnostic.

Use:

- dedicated development OpenAI project;
- explicit development key;
- default service tier;
- `store=false`;
- `gpt-6.1-sol`;
- no production env fallback;
- clean source commit;
- cumulative development ledger.

Target:

```text
2 profiles × 6 main chapters = 12
+ 1 fork/profile = 2
--------------------------
14 accepted final texts
```

Preferred fixtures/order: `creative-portfolio,career-transition`.

### 14.2 Budget authority distinction

Paid provider calls for quality validation are authorized in principle by the owner.

**A numeric cumulative cap increase is NOT authorized by this prompt.**

Known historical state at prompt creation:

```text
Global accounted: 8.204535 USD
Then-authorized cumulative cap: 10 USD
Then-remaining: 1.795465 USD
```

Observed v4 average:

```text
0.35264625 USD / accepted text
```

Naive 14-text projection:

```text
~4.94 USD additional accounted
```

Not a guarantee; failure/repair variance exists.

Before full paid run read current canonical docs AND actual cumulative ledger.

If the currently authorized numeric cap cannot safely admit the complete run:

**DO NOT** reset ledger, create a fresh ledger, raise parser limits/cap, or partially spend the remainder merely to claim validation.

Return:

```text
BLOCKED — explicit numeric cumulative development budget authority required.
Current accounted:
Current authorized cap:
Current remaining:
Observed cost evidence:
Recommended minimum headroom for complete planned run:
```

Continue only after explicit numeric owner authorization is recorded.

### 14.3 Expected paid command shape

Use actual merged CLI syntax. Expected:

```bash
pnpm evaluate:narrative \
  --mode paid \
  --allow-paid \
  --creative-only \
  --fixtures creative-portfolio,career-transition \
  --periods 6 \
  --budget-usd <EXPLICIT_OWNER_APPROVED_CUMULATIVE_CAP> \
  --approval-id <EXPLICIT_APPROVAL_ID> \
  --out .local/narrative-evaluation/v5-two-profile-paid
```

Do not silently accept an incomplete corpus. Budget exhaustion, provider hard failure, missing fork or missing period means diagnostic incomplete.

## 15. Paid evidence to report

For EACH target final text:

- fixture;
- main/fork;
- period index;
- title;
- final request count;
- repair yes/no;
- repair type;
- initial failing gate if repaired;
- first rejected score/flag/issues if available;
- final score/flags;
- accounted USD;
- usage estimate;
- elapsed time;
- per-call latency evidence reference.

Whole run:

- total physical calls;
- accepted/incomplete texts;
- repair count/rate;
- total accounted;
- usage estimate;
- accounted / accepted text;
- unaccepted-attempt accounted cost;
- p50/p95 latency;
- unknown usage;
- unassigned reservations;
- ledger before/after;
- authorized cap;
- remaining cap.

Do not hide repair cost from accepted-text cost.

## 16. Human audit artifact

Generate blinded sequence reading material.

### Bundle A — creative-portfolio

- all 6 main chapters in order;
- shared prefix + fork third chapter.

### Bundle B — career-transition

- all 6 main chapters in order;
- shared prefix + fork third chapter.

Do not expose to reader:

- policy version;
- editor/model scores;
- repair status;
- token/cost data;
- diagnostic attempt traces.

Audit questions:

1. After six chapters, can you identify a repeating Alterward story formula?
2. Does progression repeatedly come from outside validation/opportunity?
3. Does protagonist repeat “almost explain/defend → stop/delete → wise correction”?
4. Do NPCs feel independently motivated?
5. Does the world continue outside protagonist?
6. Does internal constraint machinery become visible?
7. Would you continue reading?
8. If not told it was AI-generated, would full sequence make you suspicious? Why?
9. Is fork genuinely different life direction or surface variation?
10. Which exact scene first reduced immersion?

Human review remains separate from model-editor scores. Do not invent human grades.

## 17. Acceptance criteria

### Technical

- [x] PR #48 merged before implementation.
- [x] actual current-main base recorded.
- [x] v1 unchanged.
- [x] v2 unchanged.
- [x] v3 unchanged.
- [x] measured v4 prompt hashes unchanged.
- [x] new v5 policy separately versioned.
- [x] no new routine AI stage.
- [x] max9 unchanged.
- [x] one repair unchanged.
- [x] context bounds unchanged.
- [x] privacy/prefix/withheld unchanged.
- [x] old artifact/job compatibility preserved.
- [x] repair provenance only in synthetic local eval.
- [x] old benchmark unchanged.
- [x] 2×6 + 2-fork offline corpus passes.
- [x] full repository checks pass.

### Real AI evidence

- [ ] real candidate generated after fix.
- [ ] clean source commit/sourceHash bound.
- [ ] gpt-6.1-sol used.
- [ ] dedicated development project used.
- [ ] every paid call accounted.
- [ ] no ledger reset.
- [ ] both target profiles have six main chapters.
- [ ] both profiles have a fork chapter.
- [ ] repaired samples have first-vs-final diagnostic evidence.
- [ ] cost/latency reported.
- [ ] human-readable sequence bundles generated.

### Literary result

Do NOT auto-mark literary success from model gates.

Valid PR state before human reading:

```text
TECHNICAL PASS / REAL CORPUS GENERATED / HUMAN AUDIT PENDING
```

If real corpus repeats the opportunity/self-correction engine, preserve negative result. Do not keep rewriting inside the same evidence directory until desired conclusion appears.

## 18. Production / paid-action boundary

### Explicitly allowed

- paid DEVELOPMENT model calls required by this task;
- only after technical checks;
- only with explicit numeric cumulative cap;
- only dedicated development project;
- only synthetic fixtures.

### Not allowed

- production deployment/database mutation/user generation;
- production keys;
- new beta window;
- ledger reset;
- credential rotation;
- release cohort activation;
- N09 runtime apply.

## 19. Documentation requirements

Update canonical docs where appropriate:

- `docs/STATUS_HU.md`
- `docs/DEVELOPMENT_PLAN_HU.md`
- `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
- `docs/operations/NARRATIVE_EVALUATION_HU.md`
- `docs/operations/NARRATIVE_RELEASE_HU.md`
- `docs/AI_MODEL_ROUTING_HU.md` only if routing/version statement changes
- `docs/decisions/ADR-008-creative-fiction-final-author-canon.md` if policy consequences need amendment
- generated contract docs if enums/policy schema change.

Do not create new status-report docs when canonical docs + PR evidence suffice.

Do not commit secrets.

## 20. Git workflow

After PR #48 is merged, create:

```text
fix/fiction-v5-progression-quality-45
```

from CURRENT `main`.

One branch, one task.

Recommended commits:

1. `test(fiction): freeze measured v4 quality prompts`
2. `feat(fiction): diversify progression and protagonist response`
3. `feat(eval): preserve synthetic repair attempt provenance`
4. `test(eval): cover real-quality sequence evidence paths`
5. `docs(fiction): record real-corpus quality iteration`

Push and open PR against `main`. Do not self-merge.

## 21. PR body requirements

Include:

### Source

```text
Base main SHA:
Predecessor PR #48 merge SHA:
v4 measured baseline source: 3809c560e4990c8fcc149a4d1af4e38a47c74c1c
Candidate final SHA:
Candidate sourceHash:
```

### Policy

```text
Previous selected: v4 / quality 2.2 / editor v3
Candidate selected: v5 / quality 2.3 / editor v4
Model: gpt-6.1-sol unchanged
Normal calls: 5 unchanged
Max physical requests: 9 unchanged
Max content repairs: 1 unchanged
SQL migration: NONE unless separately justified
```

### Quality hypothesis

```text
H1: repeated external-opportunity progression should decrease without banning earned opportunities.
H2: repeated immediate/tidy protagonist self-correction should decrease without forcing irrational behavior.
H3: v4 scene quality, continuity, branching and system-invisibility should not regress.
```

### Evidence

- exact technical commands/results;
- 14-target real corpus table;
- repaired sample first-vs-final summary;
- production boundary statement;
- unresolved human/economic/N09 status.

## 22. Stop conditions

STOP rather than invent authority if:

- PR #48 not merged;
- current main invalidates assumptions;
- v4 prompt hashes would change;
- new routine provider stage is required;
- >9 requests or >1 repair is required;
- privacy/context bound weakening is required;
- production retention of rejected prose is required;
- full paid run needs higher numeric budget cap not explicitly authorized;
- model/provider change appears necessary;
- production mutation appears necessary;
- SQL migration appears necessary for evaluation-only provenance.

Report exact blocker.

## 23. Final Codex response

Return only concise handoff:

- implementation base SHA;
- branch;
- final commit SHA;
- PR number;
- v5 policy summary;
- repair-provenance summary;
- repository checks;
- offline 2×6+fork result;
- real paid run result OR explicit budget blocker;
- real call/cost/latency/repair totals if run;
- human bundle paths;
- human-audit status;
- unresolved risks;
- deviations.

Do not claim quality release.

## 24. Completion principle

Offline tests answer:

> Is the system mechanically correct?

Real provider generation answers:

> Did the model actually produce the intended behavior?

Human sequence audit answers:

> Did the story actually become better to read?

For Alterward story-quality work, all three are distinct.

A change is not a demonstrated literary improvement merely because mocks, schemas and the model editor are green.


## Owner authority and actual start — 2026-10-17

- The owner explicitly authorized merging PR #48; read-back confirms merge commit `058555005e7e85905cf53081bfa18226780cf9ac`, which is the actual implementation base. The historical open/precondition statements above describe prompt creation. New branch: `fix/fiction-v5-progression-quality-45`.
- After the initial new USD 5 authorization, the owner explicitly approved **up to USD 7 total additional development spend** for the planned real sequence validation with repair/reservation headroom. Opening canonical ledger remains 255 calls / USD 8.204535 accounted; cumulative authorized ceiling is **USD 15.204535**, without adding the earlier unused USD 1.795465 separately. All new development API spend shares this additional seven-dollar allowance. No provider call has been made under it at task start.
- The numeric authorization supersedes the historical section 14.2 cap restriction only to this explicit amount. Raising the guarded evaluator ceiling and testing it is authorized; no ledger reset or guard bypass. Default generic experiment allowance remains five dollars absent explicit reviewed extension.
- Section 7.6's “before authoring” wording is interpreted consistently with ADR-008: planner instructions should avoid obvious repetition at draft time; the existing final plan reviewer remains AFTER the author and before persistence. No sixth normal stage is added.
- Mock negative controls prove gate/repair behavior, not semantic recognition by the real model. Real provider results and independent human judgments remain separate.

## Pre-paid technical checkpoint — 2026-10-17

- Full repository tests: 97 files / 1030 tests PASS; format, docs and type checking PASS. Final build/schema checks and the standalone fresh offline corpus are separate completion checks.
- Claude Code independently reviewed policy/prompt compatibility and local provenance; no confirmed actionable defect remained. Its potential provider model-alias mismatch is intentionally fail-closed: all 255 historical paid ledger rows use the exact configured `gpt-6.1-sol`. A newly returned alias/snapshot is not silently accepted.
- Antigravity Argon implemented the isolated trace integration; root review added missing-usage, malformed/partial raw-output capture, persistence-failure and long-feedback tests. CLI usage estimates are retained separately from actual development API ledger accounting; they are not asserted as wallet charges.

- Final pre-paid required checks all PASS: `pnpm format:check`, `pnpm docs:check`, `pnpm typecheck`, `pnpm test --maxWorkers=2` (97/1030), `pnpm build`, `pnpm schemas`, `git diff --check`. Generated schemas match the committed v5 contracts.

- PR #49 CI run 325: container PASS; verify 1029/1030 PASS, unrelated pre-existing Shared privacy assertion falsely matched private numeric sentinel `4765` inside a random public member UUID. The assertion now rejects private finance keys and complete numeric/string values while avoiding UUID substrings; targeted Shared suite 15/15 PASS. This test-only follow-up does not change the running paid candidate/source binding.
- Fresh standalone clean-source offline evidence at `34f5586b6afaabf73f8a9a4694636e9bea84f097` / sourceHash `990cdf900f0305ac7cbfce1c7654410040d6c72d8c0379af961ef42a2087f6cc`: 14 samples (12 main + two fork), 70 mock transports, 14 trace files, all trace permissions 0600, no failures. Diagnostic-only `complete=false`, `qualityRelease=false` is intentional.
