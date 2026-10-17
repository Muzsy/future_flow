---
status: active-supporting
owner: agents
created: 2026-10-17
base_commit_at_prompt_creation: 058555005e7e85905cf53081bfa18226780cf9ac
required_predecessor_pr: 49
required_predecessor_head_at_creation: 219ef32d3c00e4ac9abee12d69c8dfbd18666bce
measured_v5_source: 34f5586b6afaabf73f8a9a4694636e9bea84f097
measured_v5_source_hash: 990cdf900f0305ac7cbfce1c7654410040d6c72d8c0379af961ef42a2087f6cc
issue: 45
workstream: F05/F06 quality follow-up
state: implementation-in-progress
paid_provider_calls_authorized_in_principle: true
new_numeric_budget_authority: true
production_authorized: false
---

# Codex task — v6 earned life evolution, causal freedom, planner yield and base-window retention validation

## 2026-10-18 execution authority

PR #49 was merged before implementation at `1e1b4303dd779ad8e8b34970892302583a7f66dd`; this is the actual v6 base. The creation-time SHAs/status below remain historical. The owner explicitly authorized the merge and **at most 8 USD total new v6 development consumption** on 2026-10-18. Opening original cumulative ledger: **305 calls / 10.732030 USD accounted**; cumulative ceiling **18.732030 USD**. The previous unused 4.472505 USD is included, not added. Stage A has an initial internal 1.50 USD allocation (ceiling 12.232030), within the same total authority. Read the original ledger and current authorization before each paid stage; no reset, copied ledger or added budget. Stage B starts fresh only if the three-main/no-fork Stage A is acceptable. No production or v6 self-merge authorization.

## Role

You are the implementation agent for the Alterward repository.

This is the next bounded creative-fiction quality iteration after PR #49.

The goal is NOT to introduce a mechanical “major change every N chapters” system.

The goal is to let the writer use the accumulated canon more freely so that a personal life can **organically evolve into larger changes**, while preserving causal continuity, accepted choices, user boundaries, typed state authority, believable pacing, literary coherence, branch correctness, privacy and the current request/repair ceilings.

Central product principle:

> The accumulated canon is not a cage that should keep the protagonist in the same room forever. It is evidence from which increasingly rich, but still causally earned, future states can become plausible.

The owner explicitly rejected a chapter-number schedule such as:

```text
1–2: deepen
3–4: shift
4–6: major change
6–8: consequences
```

That may be a human product-design intuition, but MUST NOT become a prompt timetable, quota, state-machine rule, required graph mutation, editor threshold or billing-aware trigger.

---

# 1. Repository and hard precondition

Repository: `Muzsy/future_flow`

At prompt creation:

- current main: `058555005e7e85905cf53081bfa18226780cf9ac`
- PR #49: OPEN + DRAFT
- PR #49 head: `219ef32d3c00e4ac9abee12d69c8dfbd18666bce`
- measured v5 application source: `34f5586b6afaabf73f8a9a4694636e9bea84f097`
- measured v5 sourceHash: `990cdf900f0305ac7cbfce1c7654410040d6c72d8c0379af961ef42a2087f6cc`

Do not implement before PR #49 is merged.

At task start:

```bash
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
```

Verify merged main contains:

- v5 planner/author/reviewer
- editor v4
- quality 2.3.0
- frozen v1–v4 prompt hashes
- local repair provenance
- six-period creative evaluation
- max9 requests
- one global content repair
- report 1.2.0
- sequenceSignatureHistory
- PR #49's negative real-corpus evidence

If PR #49 is not merged, STOP.

If current main materially differs from the merged PR #49 assumptions, STOP and report the delta.

---

# 2. Mandatory reading order

1. `AGENTS.md`
2. `docs/DOCS_INDEX_HU.md`
3. `docs/STATUS_HU.md`
4. relevant F05/F06/N08 sections of `docs/DEVELOPMENT_PLAN_HU.md`
5. `docs/product/PRODUCT_HU.md`
6. `docs/product/MONETIZATION_HU.md`
7. `docs/plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md`
8. `docs/architecture/ARCHITECTURE_HU.md`
9. `docs/V2_SIMULATION_CONTRACT_HU.md`
10. `docs/decisions/ADR-008-creative-fiction-final-author-canon.md`
11. `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
12. merged `docs/plans/045_fiction_v4_1_real_quality_iteration.md`
13. `docs/operations/NARRATIVE_EVALUATION_HU.md`
14. `docs/operations/NARRATIVE_RELEASE_HU.md`
15. affected code/tests

---

# 3. Current v5 evidence to preserve

Measured real v5 run:

- model: `gpt-6.1-sol`
- target: 14 texts
- actual: 8 accepted, 1 rejected, 5 ungenerated descendants
- 50 physical calls
- new accounted: `2.527495 USD`
- new usage estimate: `2.2240168 USD`
- closing ledger: `305 calls / 10.732030 USD accounted`
- global usage estimate: `9.8234197 USD`
- zero unknown usage
- zero unassigned reservations
- accepted p50: `296639.5 ms`
- accepted p95: `345934 ms`
- accepted repair rate: 25%
- attempted-job repair use: 33.33%

Accepted creative sequence:

1. The Chair Left Out
2. The Light on Paper
3. The Cleared Table
4. The Other Side of the Table
5. The Last Return
6. While Everyone Unpacks

Creative fork:

- The Unopened Folder

Career accepted:

- The Second Confirmation

Career rejected:

- The Order of the Checks

Preserve this evidence exactly.

---

# 4. v5 human-audit conclusions

Preserve gains:

- system mechanics largely invisible
- external-opportunity escalation no longer default
- protagonist no longer instantly self-corrects
- NPC autonomy improved
- continuity/branching remain strong
- prose is materially more human
- sequence dramaturgy is more varied

New main problem:

> The chapters differ, but the LIFE remains too concentrated in the same micro-world for too long.

The creative sequence spans roughly three simulated years while remaining dominated by:

- same drawing group
- same room/table
- Aoife
- home work surface
- same broad creative activity

This is scope lock / hermetic-life risk.

---

# 5. Product requirement — base experience must evolve

Current personal-story economics proposal uses an 8 accepted chapter/month hypothesis plus optional additional capacity.

This is NOT final billing law.

The current Shared names Free / Explorer / Connected / World are NOT personal-story tiers.

Product principle:

> A base-sized personal reading window must not feel narratively static. The user needs a credible reason to renew because the alternative life has evolved enough that the new situation is worth following.

Do NOT translate this into:

- one major change per package
- chapter-5 mandatory twist
- mandatory relocation
- mandatory new relationship
- actor/location quotas
- forced cliffhanger
- external-opportunity quota

The eight-chapter proposal is a validation window, not a story-engine clock.

The narrative model must not receive:

- billing tier
- renewal date
- remaining quota
- allowance position
- rollover balance

as creative input.

Meaningful life evolution is core product quality, not a premium feature.

---

# 6. Core design principle — progressive authorial freedom

Tell the writer:

> Initial state is an origin, not a permanent ceiling.

and:

> Existing canon is not a reason to repeat the existing life indefinitely. It is evidence that can make new, larger states causally plausible.

Do NOT encode freedom by period number.

Do NOT add a chapter-index permission table.

Use:

- accepted choices
- current WorldState
- StoryFacts
- prior events
- relationships
- unresolved threads
- previous attempts/failures
- consequences
- recurring activities
- existing skills/routines

to judge what has become plausible.

---

# 7. Change scale as guidance, not quota

## Scene/local freedom

Freely invent plausible:

- settings
- one-off encounters
- ordinary obstacles
- dialogue
- material failures
- small successes
- incidental people
- venue changes
- mundane consequences
- short-lived routine variations

## Durable moderate change

Allowed when causally supported:

- recurring new activity
- new regular community
- changed routine
- persistent relationship dynamic
- new creative/professional practice
- new recurring fictional actor within existing actor rules
- leaving an activity
- changed goal pursuit

Absence from the initial profile is not by itself an error.

## Major life-state change

Requires stronger causal support, not a later chapter number.

Examples:

- employment change
- relocation
- major relationship-state shift
- major durable commitment
- significant financial/asset commitment
- replacement of central life direction

Important:

- the system may invent an offer/opportunity
- it must not silently ACCEPT a major new user commitment unless already entailed by a previously accepted choice
- otherwise the commitment belongs in the unresolved decision
- durable changes require correct typed state mutation
- StoryFact alone cannot replace required typed state

No “at least N prior events” rule.

---

# 8. Earned change

A larger change is earned when a demanding reader can answer:

> Why did THIS change become plausible in THIS life, now?

Valid example:

```text
private drawing
→ interest in visual narrative
→ success/failure in social telling
→ protagonist seeks a different creative context
```

Valid career example:

```text
small database project
→ reproducible technical problem
→ repeated use
→ growing skill/responsibility
→ credible new professional direction
```

Invalid:

```text
has been drawing
→ sudden life-changing international gallery contract
```

without intervening causal support.

Invalid:

```text
three years passed
→ therefore move city
```

Elapsed time is not causality.

---

# 9. Stagnation awareness — warning, not trigger

Do NOT create:

- stagnationCounter
- mustExpandAfterNPeriods
- newActorQuota
- newLocationQuota
- majorChangeDue

Planner/author/reviewer should ask:

> Has the story remained in essentially the same life topology because that is dramatically meaningful, or because the model became overly conservative?

Useful lenses:

- people
- locations
- routines
- activities
- relationship states
- goal direction
- responsibilities
- skills/practices
- unresolved threads
- durable changes

These are lenses only.

Stable location can PASS if relationship/role/meaning changes deeply.

Scope lock is a problem when people/place/routine/activity/relationship/goal all remain materially unchanged without deliberate dramatic reason.

Use novelty / independentProgression to express this.

Do NOT add `lifeExpanded=true`.

---

# 10. v6 policy strategy

Freeze v5 byte-for-byte.

Create/confirm `fictionV5Policy()`.

Recommended new versions:

- planner: `life_fiction_plan.v6`
- author: `life_fiction_author.v6`
- reviewer: `life_fiction_plan_review.v6`
- fidelity: `life_fiction_fidelity.v1` unchanged
- editor: `life_fiction_editor.v5`
- quality: `2.4.0`

Prefer editorial report `1.2.0` unchanged.

No new “major change” field unless an actual machine invariant requires it.

---

# 11. v6 prompt delta

Add a compact layer on top of v5.

Do not rewrite the whole prompt.

Planner/author guidance:

- initial employment/location/routine/activity is not eternal unless a hard boundary says so
- continuity does not require whole-life topology to remain unchanged
- inspect canon for newly plausible larger consequences
- do not delay an earned development merely because repeating the current setting is safer
- do not accelerate change just to look eventful
- new settings/communities/routines/activities may arise organically
- recurring people/places may remain if still dramatically alive
- same goal does not mean same scene forever

---

# 12. Causal guard against chaos

Reject large durable changes when:

- no visible causal bridge
- contradict accepted choices
- violate hard boundary
- assume unavailable funds/resources as facts
- silently make a major user commitment
- contradict current state
- invent private real-person facts
- omit required typed state mutation
- reset unresolved thread merely to create novelty

The question is not:

> Was this new thing mentioned before?

The question is:

> Does owned canon make this development causally credible?

---

# 13. Do not over-penalize change

Regression tests must prove:

- new community absent from initial profile can be valid
- new recurring fictional actor can be valid
- changed routine/activity can be valid
- different direction from initial goal can be valid
- large external opportunity can be valid if earned
- eventual job change can be valid with causal path + typed state + user authority

Fidelity protects consistency, not conservatism.

---

# 14. Planner reference integrity / yield

v5 exposed:

- nonexistent goal
- unknown scene actor

One burned the global repair before later prose failure.

Investigate exact traces before coding.

Determine whether root cause is:

- prompt ambiguity
- valid-ID visibility
- actor chronology
- fixture shape
- validation order
- request projection

Use smallest robust fix.

Preferred:

- make valid existing goal/actor IDs unambiguous
- copy existing IDs exactly
- never invent goal IDs
- actor cannot be referenced before existence
- distinguish existing actor vs newly introduced recurring actor

Do NOT:

- add second repair
- increase max requests
- regex-rewrite unknown actor
- silently substitute a different actor

A small request-local server-owned reference projection is allowed only if it uses already-owned input IDs, fits existing bounds, is not a new authority and needs no SQL.

---

# 15. Decision-interface leakage

New v5 pattern:

```text
someone waits for your answer
```

This is often an implicit UI handoff.

v6 guidance:

The prose does not have to end with an NPC waiting for a response merely because structured canon contains a final unresolved decision.

Valid endings include:

- consequence
- action in progress
- physical detail
- discovery
- unresolved tension
- interruption
- changed relationship state
- concrete problem
- realization
- ordinary continuation

The structured decision remains separate.

Do not ban natural questions.
Do not ban the word “wait”.

Editor should treat repeated answer-waiting handoff under:

- distinctEnding
- systemMechanicsInvisible

when functionally repetitive.

---

# 16. Temporal presentation freedom

Keep structured fiction period = six months.

Do NOT change Life V2 duration.

But prose need not narrate six months evenly.

Allowed:

- one afternoon gets most words
- one weekend dominates
- two distant scenes with months summarized
- several quiet months compressed into one sentence
- relative/seasonal time
- omitted intermediate month names
- montage when genuinely useful

Do NOT rotate temporal archetypes mechanically.

No max month-count rule.

---

# 17. Causality calibration — contrived obstacle

The Second Confirmation created `Other`, then later used Niamh leaving category blank as central obstacle.

Multiple readings found this partially contrived.

Reviewer/editor guidance:

If a dramatic obstacle requires a character to ignore an already-established obvious solution merely so the final decision exists, causality should not get a strong pass without a believable reason.

Humans may ignore solutions.

A credible reason can make it valid.

The need for a decision is not itself a reason.

---

# 18. No billing-aware storytelling

The narrative pipeline MUST NOT use:

- personal tier
- paid/free status
- renewal date
- remaining units
- monthly allowance
- rollover

to time story changes.

Do not expose `chapter 7 of 8`.

The engine is package-independent.

---

# 19. Base-window retention benchmark

Use eight main chapters only as an evaluation window.

At the end, the reader should be able to say:

> This alternative life is meaningfully different from where it began, and I want to know what the new situation becomes.

This can come from:

- relationship change
- routine change
- new/left activity
- social-world change
- role change
- goal-direction change
- responsibility change
- skill/practice change
- location change
- employment change
- other durable shift

No single axis is mandatory.

Do not count graph mutations as pass criteria.

---

# 20. Evaluation-only evolution assessment

Optional descriptive assessment, not production gate:

```ts
{
  meaningfulLifeEvolution: 'clear' | 'partial' | 'not_felt'
  changeFeltEarned: 'yes' | 'mixed' | 'no'
  continuity: 'strong' | 'mixed' | 'broken'
  scopeLock: 'none' | 'noticeable' | 'dominant'
  temporalMetronome: 'none' | 'noticeable' | 'dominant'
  decisionBoundaryLeakage: 'none' | 'noticeable' | 'dominant'
  renewalDesire: 1 | 2 | 3 | 4 | 5
  evidence: [...]
}
```

Human and diagnostic-AI ratings stay distinct.

No invented release threshold.

Bind to exact sequence/hash.

---

# 21. Expected code map

## Contracts

`packages/contracts/src/fiction.ts`

- explicit v5 helper
- v6 prompt enums
- editor v5
- quality 2.4.0
- default v6

## Prompts

`packages/ai/src/fiction-prompts.ts`

- freeze v5
- add v6 delta only

## Provider

`packages/ai/src/index.ts`

- route v6
- no new stage

## Core

`packages/core/src/fiction.ts`

- policy/report compatibility
- no weaker authority

## Database

`packages/database/src/fiction-memory.ts`

Modify only if current owned history is demonstrably insufficient for causal evolution.

Prefer existing memory + StoryFacts + sequenceHistory + signatureHistory.

No life-graph quota.

## Worker

`apps/worker/src/fiction-processor.ts`

- no new stage
- no second repair
- no max-request change

## Evaluation

- narrative-evaluation-contract
- runner
- artifacts
- options

Preserve v5 attempt provenance.

---

# 22. Non-scope

OUT:

- narrator/personality profiles
- style-persona selection
- billing implementation
- final pricing
- Shared tier changes
- package-specific prose quality
- model change
- model ensemble
- sixth routine AI stage
- second repair
- max9 increase
- production rollout
- N09 apply
- SQL unless separately justified

---

# 23. Mandatory tests

## T01 Freeze v5
Hash-pin measured v5 prompts.

## T02 Policy compatibility
v1–v6 valid; mismatches invalid.

## T03 No timetable
No “after N periods”, “every N chapters”, actor/location quotas, package position.

## T04 Early earned major change
Strong causal path allows significant durable change early.

## T05 Stable-life positive control
Same place/people can PASS when relationship/role meaningfully evolves.

## T06 Scope-lock negative control
Long unchanged topology + another same micro-world period can fail novelty/independentProgression for evidence-based reasons.

## T07 Earned external opportunity
Can PASS.

## T08 Arbitrary escalation
Fails causality/package quality.

## T09 Major commitment user authority
Offer may be invented; acceptance remains user decision unless consequence of prior accepted choice.

## T10 Typed state mutation
Durable state changes require correct typed mutation.

## T11 New fiction allowed
New place/person/community absent from initial profile is not automatically fidelity error.

## T12 Waiting-ending negative
Repeated functional “waits for answer” gets caught.

## T13 Natural question positive
Ordinary dialogue question can PASS.

## T14 Temporal concentration
Six-month structured period + short focused prose can PASS.

## T15 Temporal montage
Months-long narrative can PASS when earned.

## T16 Metronome diagnostic
Repeated month-by-month presentation recognized without token quota.

## T17 Known-solution contrivance
Ignoring obvious established solution as central hinge should not get strong causality without reason.

## T18 Imperfect-human positive
Credible refusal/avoidance can PASS.

## T19 Nonexistent goal regression
Exact v5 failure shape covered.

## T20 Unknown actor regression
Exact v5 failure shape covered.

## T21 Repair budget
Still max1/max9.

## T22 Attempt provenance
First/final local traces remain.

## T23 Privacy
Withheld/sibling/future/other-user leakage impossible.

## T24 Historical benchmark
Unchanged.

## T25 Billing isolation
8-chapter benchmark does not enter model request.

---

# 24. Technical verification before paid calls

Run:

```bash
pnpm format:check
pnpm docs:check
pnpm typecheck
pnpm test --maxWorkers=2
pnpm build
pnpm schemas
git diff --check
```

Then offline:

1. `career-transition`, 3 periods
2. `creative-portfolio,career-transition`, 8 periods each

Expected full offline benchmark:

- 16 main
- 2 fork
- 18 total
- private trace integrity
- no historical benchmark change
- no production mutation

Mock output is technical evidence only.

---

# 25. Stage A — real career smoke

Every literary iteration needs real provider output.

After clean source, checks, sourceHash and numeric budget authority:

Real target:

- `career-transition`
- 3 consecutive main chapters

Questions:

- planner reference errors gone?
- all 3 accepted?
- no binary briefing?
- no answer-waiting handoff formula?
- causality credible?
- temporal presentation natural?
- any larger development earned rather than forced?

If Stage A fails:

STOP paid literary run.
Preserve evidence.
Do not reroll until green in the same evidence set.

---

# 26. Stage B — real base-window benchmark

Only after Stage A is acceptable.

Real target:

- creative-portfolio: 8 main + 1 fork
- career-transition: 8 main + 1 fork

Total target:

`18 accepted texts`

Same:

- gpt-6.1-sol
- five normal stages
- max9
- max1 repair
- default tier
- dedicated development project
- store=false
- clean source
- cumulative accounting
- private traces

The 8-main length matches current product hypothesis only for evaluation.

It is not a generation contract.

---

# 27. Human questions for each 8-chapter sequence

1. Does life feel meaningfully different at end vs beginning?
2. What is the largest perceived change?
3. What causal chain made it believable?
4. Did any major change feel arbitrary/premature?
5. Did any stretch feel stagnant too long?
6. Did the story remain trapped in one micro-setting?
7. Did recurring places/people feel like continuity or confinement?
8. Did the world widen organically?
9. Did six-month cadence become visible?
10. Did endings reveal the decision interface?
11. Did NPCs retain own lives?
12. Did accepted choices materially alter later chapters?
13. Did fork produce a genuinely different life?
14. Would you read the next chapter?
15. Would you renew to continue this life?
16. Which scene most increased renewal desire?
17. Which scene most reduced it?

Do not invent answers.

---

# 28. Budget boundary

Recorded after v5:

```text
305 calls
10.732030 USD accounted
9.8234197 USD usage estimate
```

Prior recorded cumulative ceiling:

```text
15.204535 USD
```

Historical unused headroom:

```text
4.472505 USD
```

Do not assume that is fresh v6 authority.

Before Stage A and Stage B:

- read current ledger
- read current authority
- obtain/verify explicit numeric authorization

Do not reset/split/bypass ledger.

Include rejected work in cost.

---

# 29. Required real accounting

Per attempted job:

- fixture
- branch
- period
- title/status
- physical calls
- repair
- repair type
- first failing stage
- initial issues/flags/scores
- final issues/flags/scores
- accounted USD
- usage estimate
- elapsed
- latency evidence
- trace reference

Whole run:

- calls
- accepted
- rejected
- ungenerated descendants
- yield
- repair rate
- planner-reference failure rate
- total accounted
- usage estimate
- rejected-work cost
- cost/accepted including failures
- p50/p95
- unknown usage
- unassigned reservation
- ledger before/after
- authorized ceiling
- remaining authority

---

# 30. Human bundle

Exclude:

- policy/model version
- editor scores
- repair status
- trace
- costs/tokens
- prompts

Include:

- full 8-chapter sequence
- fork shared prefix + alternate continuation
- neutral labels
- human questions

Rejected prose stays developer-only.

---

# 31. Acceptance criteria

Technical:

- [ ] PR #49 merged first
- [ ] actual main base recorded
- [ ] v1–v5 frozen
- [ ] explicit v5 helper
- [ ] v6 separately versioned
- [ ] no new AI stage
- [ ] model unchanged
- [ ] max9 unchanged
- [ ] max1 repair unchanged
- [ ] six-month structured period unchanged
- [ ] no billing data in generation
- [ ] no graph quota/timetable
- [ ] planner-reference tests pass
- [ ] ending tests pass
- [ ] causal-change controls pass
- [ ] temporal controls pass
- [ ] privacy compatibility passes
- [ ] historical benchmark unchanged
- [ ] provenance preserved
- [ ] repo checks green

Stage A:

- [ ] real career 3-chapter smoke
- [ ] clean source
- [ ] no planner reference failure
- [ ] no terminal binary briefing failure
- [ ] calls accounted
- [ ] no production action

Stage B:

- [ ] numeric authority verified
- [ ] creative 8 main
- [ ] career 8 main
- [ ] one fork/profile
- [ ] 18 accepted target
- [ ] accounting complete
- [ ] blinded bundles generated

Literary PASS remains human-dependent.

---

# 32. Documentation updates

Expected:

- `docs/product/PRODUCT_HU.md`
- `docs/product/MONETIZATION_HU.md`
- `docs/plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md`
- `docs/STATUS_HU.md`
- `docs/DEVELOPMENT_PLAN_HU.md`
- `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
- `docs/operations/NARRATIVE_EVALUATION_HU.md`
- `docs/operations/NARRATIVE_RELEASE_HU.md`
- `docs/decisions/ADR-008-creative-fiction-final-author-canon.md`
- `docs/AI_MODEL_ROUTING_HU.md` if relevant
- generated fiction policy schema docs

Document explicitly:

- 8 chapters = product/evaluation hypothesis, not story schedule
- base personal story uses same best engine
- meaningful evolution is core value, not premium
- authorial freedom comes from causal possibility, not package position

---

# 33. Git workflow

After PR #49 merge:

```text
fix/fiction-v6-earned-life-evolution-45
```

Recommended commits:

1. `test(fiction): freeze measured v5 quality policy`
2. `feat(fiction): allow causally earned life evolution`
3. `fix(fiction): harden planner reference integrity`
4. `fix(fiction): hide decision boundary and vary temporal focus`
5. `test(eval): add base-window evolution evidence`
6. `docs(fiction): define earned evolution and retention benchmark`

No self-merge.

---

# 34. PR body requirements

Source:

```text
Base main SHA:
PR #49 merge SHA:
Measured v5 source: 34f5586b6afaabf73f8a9a4694636e9bea84f097
Measured v5 sourceHash: 990cdf900f0305ac7cbfce1c7654410040d6c72d8c0379af961ef42a2087f6cc
Candidate SHA:
Candidate sourceHash:
```

Policy:

```text
Previous: v5 / quality 2.3 / editor v4
Candidate: v6 / quality 2.4 / editor v5
Fidelity: v1
Model: gpt-6.1-sol
Normal calls: 5
Max physical: 9
Max repairs: 1
Structured fiction period: 6 months
```

Hypotheses:

```text
H1 Larger life changes can emerge organically from accumulated canon without chapter-number scheduling.
H2 More authorial freedom does not create discontinuity or arbitrary escalation.
H3 Long sequences widen when canon supports it, while stable settings remain valid if meaningfully evolving.
H4 Planner reference defects no longer consume the repair in tested regressions.
H5 Decision boundary no longer routinely leaks through waiting-answer endings/binary briefings.
H6 Six-month periods do not force month-by-month prose.
H7 v5 human behavior/NPC/system-invisibility gains remain.
```

Boundaries:

```text
Production deployment: NONE
Production mutation: NONE
Billing change: NONE
Shared entitlement change: NONE
Model change: NONE
Ledger reset: NONE
Second repair: NONE
```

---

# 35. Stop conditions

STOP if required:

- measured v5 prompt change
- implementation before PR #49 merge
- chapter-number evolution schedule
- package/tier data in prompt
- fixed actor/location quota
- mandatory major change
- second repair
- >9 physical calls
- sixth routine stage
- weaker accepted-choice authority
- weaker boundaries/privacy
- withheld reconstruction
- production retention of rejected prose
- model/provider change
- production mutation
- budget cap increase without explicit authority

---

# 36. Completion principle

The target is not a mechanically “dynamic” story.

The target is a living story.

A living Alterward life may:

- stay quiet
- stay in one place
- keep the same people
- change slowly

but it must not be trapped by its starting state.

Freedom does not mean randomness.

The larger the change, the stronger the causal continuity must be.

The story engine should behave like a good novelist:

> notice what the existing life has made possible, choose the most interesting credible consequence, and let that consequence genuinely alter what can happen next.

The subscription benchmark asks a product question, not a generation rule:

> After a base-sized reading window, has enough meaningful, earned evolution occurred that the reader wants to continue this life?

That is the retention objective.

## Execution checkpoint — reference investigation

The original v5 synthetic-local attempt traces were read before the fix. In the creative first attempt, event goal updates used the owned goal correctly, but the unresolved decision options used invented goal IDs in `goal_progress_set`. Domain replay validates future option effects too; this is why it raised `LIFE_GOAL_MISSING`. The v6 advice covers option effects as well as current events, without creating goals or rewriting IDs.

In the career second chapter, the new actor UUID was internally consistent and `actor_add` appeared in the second event. The first scene spanned both events and listed that actor. Scene validation intentionally checks the actor against `stateAfter` of the scene's first event, so the actor did not yet exist at the start of that scene. The fix explains this exact chronology rather than substituting an actor or weakening replay. The initial rejected candidate and its spent repair remain in v5 evidence.

The new regression suite includes these two exact failure shapes, maximum-size bounded current-state reference projection, withheld-history isolation, typed unresolved job-change authority, new fictional actor/community details and temporal concentration under six-month canon. Labelled editor reports test deterministic routing/acceptance only; they do not prove that a real model recognizes scope lock, contrivance, repetitive endings or human credibility. That semantic question belongs to paid text evidence and independent reading.
