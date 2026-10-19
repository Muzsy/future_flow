---
status: active-supporting
owner: agents
created: 2026-10-15
base_commit: 4e5fb2ed0f8be298fb1827d097169dcc10a3194a
issue: 34
workstream: N09
state: active
---

# Codex task — Linux funded-runtime upgrade for active personal beta

## Role

You are the implementation agent for the Alterward repository.

Your task is to implement the missing **reviewed Linux upgrade path for an already active funded personal-beta runtime**. This is an operations/recovery/security task, not a product-feature task.

The implementation must preserve the currently active beta authority, cost state and privacy/recovery guarantees while making it possible, in a later separately authorized operation, to upgrade the deployed application/runtime and schema to the reviewed narrative-capable source.

You are **not authorized to perform the production upgrade in this task**.

---

## Repository and base

- Repository: `Muzsy/future_flow`
- Base branch: `main`
- Base commit when this prompt was created: `4e5fb2ed0f8be298fb1827d097169dcc10a3194a`
- Issue: `#34`
- Workstream: `N09`

Before changing anything:

1. fetch the current `main`;
2. compare current `main` with the `base_commit` above;
3. if `main` moved, inspect the delta;
4. continue if the task assumptions are still valid;
5. stop and report a conflict only if new canonical decisions or implementation changes materially invalidate this specification.

Do not silently build on stale assumptions.

---

## Mandatory reading order

Read in this order before implementation:

1. `AGENTS.md`
2. `docs/DOCS_INDEX_HU.md`
3. `docs/STATUS_HU.md`
4. the `N09` and `P08` sections of `docs/DEVELOPMENT_PLAN_HU.md`
5. GitHub Issue `#34`
6. `docs/operations/NARRATIVE_RELEASE_HU.md`
7. `docs/operations/LINUX_OPERATOR_HU.md`
8. `docs/operations/BACKUP_HU.md`
9. `docs/operations/RECOVERY_HU.md`
10. `docs/PERSONAL_BETA_OPERATOR_HU.md`
11. the relevant writer-fence, backup/restore, privacy-replay and Contabo operator runbooks referenced by the above files
12. the actual scripts, migrations, tests and contracts listed under **Implementation areas to inspect** below

Do not bulk-load historical documentation. Read historical reports only when a current canonical/runbook statement requires proof or when resolving a concrete compatibility question.

---

## Task authority

Primary authority:

- Issue `#34` — Add a reviewed Linux upgrade path for active funded personal beta runtimes
- `docs/operations/NARRATIVE_RELEASE_HU.md`
- `docs/operations/LINUX_OPERATOR_HU.md`
- `docs/operations/BACKUP_HU.md`
- `docs/operations/RECOVERY_HU.md`
- `docs/DEVELOPMENT_PLAN_HU.md` — `N09`

The prompt is execution guidance only. If this prompt conflicts with current code, an accepted ADR or a canonical specification, do not choose silently. Document the conflict in the PR and follow the repository precedence rules in `AGENTS.md`.

---

## Goal

Implement a **fail-closed, auditable Linux funded-runtime upgrade transition** that can later be used to upgrade the already active personal-beta deployment from its current funded runtime to a reviewed newer application/runtime/schema while preserving the existing beta's authority and accounting state.

The completed implementation must provide a supported path for:

- preparing an immutable upgrade candidate from an exact reviewed source;
- proving runtime and recovery compatibility before schema/image mutation;
- draining or reconciling existing narrative jobs safely;
- applying schema/image/config changes transactionally or in a bounded state machine;
- preserving the funded window and all cost/accounting state;
- failing closed on stale, incomplete or incompatible evidence;
- recovering from interruption or post-check failure without reverting to an incompatible pre-038 runtime;
- retaining evidence sufficient for later independent review and explicit production apply authorization.

This task ends with **code + isolated tests/fixtures + updated runbooks + PR**.

It does **not** end with production deployment.

---

## Current state that must be respected

At prompt creation, the repository documents the following:

- the first personal beta is already active;
- the funded window is already running and must not be restarted or extended by this task;
- the existing project/user budget and usage ledger are authoritative operational state;
- reader/Auth binding has already occurred;
- production is still on the previous/default narrative runtime;
- the new narrative pipeline and migration 038 exist in `main` but are not yet deployed to the funded beta;
- the current Linux operator supports reader/funded/daily/writer-fence operations, but not active-funded image/schema upgrade;
- the old owner upgrade path is tied to a different original-zero / image-only starting state and is not authority for an already funded runtime;
- migration `038_narrative_artifacts.sql` adds nullable narrative artifact storage;
- pre-038 recovery images are not automatically valid after schema 038;
- rollback/recovery compatibility must include stored prompt-policy revisions and narrative artifacts, not only the database column layout.

Do not turn any of these observations into new business rules. Verify them against current code and docs before implementation.

---

## Design direction

### Preferred architecture

Prefer a **dedicated funded-runtime upgrade transition** over broadening the legacy owner-upgrade path.

Reason:

- the old owner-upgrade path starts from a different state model;
- the active funded runtime has a live window, ledger, readers, limits and operational history that must be preserved;
- replaying initial activation or reinterpreting old receipts is explicitly prohibited.

You may reuse existing low-level, reviewed primitives where appropriate, including:

- SSH/host pin validation;
- private workspace validation;
- GitHub CI readback;
- source/helper hash validation;
- Docker/container inspection;
- Access/CA identity checks;
- backup/restore proof validation;
- writer fence and queue inspection;
- lock acquisition;
- durable journal/state writing;
- service stop/start primitives;
- post-check and recovery helpers.

Do **not** duplicate security-sensitive primitives unnecessarily if a current reviewed helper already provides the exact required contract.

If code inspection shows that safely extending an existing operator is materially better than introducing a dedicated entry point, you may do so only if:

1. the original-zero and active-funded state machines remain explicitly distinguishable;
2. existing behavior remains byte/contract compatible where required;
3. tests prove an owner-zero path cannot accidentally consume funded-runtime receipts and vice versa;
4. the PR explains why this is safer than a separate path.

No silent semantic widening.

---

## Implementation areas to inspect

Inspect at minimum, if still present on current `main`:

### Existing operator entry points

- `scripts/contabo-personal-beta.mjs`
- `scripts/contabo-personal-beta-readers.mjs`
- `scripts/contabo-fence-operator.mjs`
- `scripts/contabo-daily.mjs`
- `scripts/contabo-recovery.mjs`
- `scripts/contabo-owner-upgrade.mjs`

### Server-side operator logic

- `scripts/ops/contabo-personal-beta.py`
- current reader operator backend
- current writer-fence backend
- current recovery/managed-recovery logic
- `scripts/ops/contabo-owner-upgrade.py`
- `scripts/ops/contabo-owner-upgrade-fixture.py`
- backup/daily/health helpers required by current runbooks

### Schema and runtime compatibility

- `database/migrations/038_narrative_artifacts.sql`
- schema/catalog fingerprint guards
- runtime code reading/writing `narrative_artifact`
- prompt-policy revision compatibility for stored/frozen narrative jobs
- recovery readers/replayers of narrative artifacts and queue snapshots

### Narrative runtime configuration added after prompt creation (2026-10-19)

`deploy/compose.yaml` now forwards `NARRATIVE_PIPELINE_MODE` (default `legacy`) and `NARRATIVE_COHORT_USER_IDS` (default empty) to api/worker, and `AI_FICTION_TIMEOUT_MS` (default 180000) plus `AI_FICTION_MAX_REQUEST_BYTES` (default 100000, bound 100000–196608, narrative jobs only) to the worker. Consequences for this task:

- the rendered compose of the candidate differs from the active funded render by these added keys, so the upgrade is not image-only; accept exactly these keys and only at their defaults, with every funded environment byte otherwise unchanged;
- enabling a cohort or raising the deadline/envelope is a later, separately authorized configuration step with its own prepare/apply/readback, not part of the image/schema upgrade;
- `validate_owner_configuration` refuses a non-legacy mode or non-empty cohort for owner-only renders.

See `docs/operations/NARRATIVE_RELEASE_HU.md` (Narratív runtime konfiguráció).

### Tests

Inspect existing operator, fixture, recovery, backup, writer-fence and narrative-recovery tests and extend the existing test architecture rather than creating an unrelated parallel test framework.

This list is guidance, not permission to modify every listed file. Modify only what the accepted design requires.

---

## Required state model

Define an explicit, reviewable funded-upgrade lifecycle. Names may differ if current conventions demand it, but the semantics must cover at least:

1. **inspect**
   - read-only observation of current active funded runtime;
   - verify exact funded authority and operational identity;
   - no service mutation;
   - no schema mutation;
   - no paid calls.

2. **prepare**
   - bind an exact source commit, reviewed target image/digest and compatible recovery image/capabilities;
   - capture target schema/catalog expectations;
   - bind current active funded baseline;
   - bind current window/budget/readers/limits/ledger invariants;
   - bind current queue/reservation/lease/fence observations;
   - generate a short-lived candidate;
   - no production mutation.

3. **apply**
   - only possible from a valid unexpired prepared candidate;
   - obtain required locks;
   - establish writer fence/drain state;
   - re-read current authority and reject drift;
   - require candidate-bound encrypted backup/offsite/restore/privacy proof before irreversible schema/runtime mutation;
   - upgrade schema/runtime/config in an explicitly ordered transition;
   - perform post-checks;
   - persist durable receipts/journal;
   - fail closed and recover on error.

4. **recovery / failed apply handling**
   - interruption-safe;
   - no blind replay;
   - no deletion of evidence to permit retry;
   - preserve cost/window/account state;
   - reject an incompatible rollback image;
   - allow only a reviewed compatible recovery target.

5. **inspect-after / readback**
   - exact image/source/schema/runtime capability readback;
   - funded-state invariants proven unchanged;
   - writer/queue state safe;
   - Access/CA/host/network identity preserved;
   - unrelated workloads preserved.

Do not introduce an automatic production rollout loop.

---

## Non-negotiable invariants

The implementation must preserve, before vs. after an upgrade attempt, all applicable authoritative values below.

### Funded window

Must not change:

- original window start;
- original window end;
- whether the current one-time funded activation has already occurred;
- expiration semantics;
- no automatic renewal or extension.

### Monetary authority

Must not change or reset:

- project allowance;
- per-user allowance;
- used amount;
- reservations;
- committed usage;
- historical usage;
- existing cost receipts/journal;
- daily cap;
- concurrent cap;
- provider attribution.

Image/config/schema changes must never create a fresh ledger.

### Participants and access

Must preserve:

- exact reader set;
- exact Auth/application user binding authority;
- Cloudflare Access state expected by current operator proofs;
- origin/CA identity;
- host pin;
- TLS expectations;
- no new participant admission.

### Privacy and data control

Must preserve:

- deletion/revocation replay requirements;
- export/delete privacy boundaries;
- private narrative artifact exclusion from public DTOs/surfaces;
- RLS/role/grant expectations;
- Shared remains OFF for the personal beta unless separately authorized elsewhere;
- withheld/private material must not be reconstructed through recovery or narrative replay.

### Infrastructure isolation

Must preserve:

- unrelated containers/workloads;
- project-scoped service targeting;
- existing network/proxy boundaries;
- no global VPS restart;
- no unrelated service mutation.

### Evidence integrity

Must not:

- hand-edit existing receipts;
- rewrite historical source commits;
- delete journals/locks/receipts to get a clean retry;
- accept stale proof as fresh candidate proof;
- replace exact hashes with manually edited expected values;
- downgrade verification because a test otherwise fails.

---

## Migration 038 requirements

Migration `038_narrative_artifacts.sql` is part of the upgrade boundary.

The operator/recovery design must enforce:

1. **compatible recovery capability exists before target schema mutation**;
2. pre-038 recovery images cannot be treated as valid just because they can start;
3. schema/catalog guards remain strict;
4. no dropping or ignoring the new column/artifacts to make rollback simpler;
5. migration replay/restore behavior is explicitly tested;
6. legacy existing periods with null artifact remain readable;
7. stored narrative artifacts survive backup/restore;
8. deletion/revocation replay still removes or hides data according to current authority;
9. consumer/public projections do not start exposing private artifact data.

The schema upgrade order must be documented and mechanically guarded.

---

## Narrative runtime compatibility requirements

Compatibility is not satisfied merely by supporting migration 038.

The upgrade/recovery path must account for frozen/stored queue/runtime policy revisions that may already exist or that are valid repository contracts, including current documented generations such as:

- planner v1;
- planner v2;
- planner v3;
- writer v1;
- writer v2;
- writer v3;
- fidelity/editor stages;
- planReviewer marker/report policy introduced by the current stricter queue path;
- legacy/default narrative path.

Do not rename or mutate frozen policy markers in stored jobs.

A rollback/recovery image is compatible only if it can safely interpret the stored jobs/artifacts it may encounter, or if a reviewed reconciliation procedure deterministically resolves them before serving.

Capability must be validated before paid dispatch.

---

## Queue drain and writer-fence requirements

Changing `NARRATIVE_MODE`, cohort flags or future queue policy is **not** a drain strategy.

The implementation must explicitly handle:

- queued jobs;
- already snapshotted narrative-policy jobs;
- active leases;
- reservations;
- ready-to-commit work;
- in-flight writer state;
- worker pause/fence;
- stale or foreign writers.

Required behavior:

1. fence/pause new writes using current authority;
2. inspect queue/lease/reservation state;
3. classify each supported state;
4. if current runbooks allow a bound ready job to complete through a no-new-provider-call commit path, preserve that behavior;
5. otherwise use a reviewed cancel/recovery/reconcile path;
6. never mutate canon/checkpoint/admission counters by hand to fake a drained state;
7. no new paid provider call may occur during an offline fixture or production apply unless a later explicit production authorization separately permits it;
8. post-upgrade worker exposure occurs only after complete post-check.

Fixtures must prove that flag-off alone cannot falsely satisfy drain readiness.

---

## Prepare candidate requirements

A prepared funded-runtime upgrade candidate must be bound to exact evidence, not human-readable assertions.

At minimum bind or validate, as applicable to current operator architecture:

- source commit SHA;
- hashes of imported operator helpers used by the transition;
- exact Verify CI source/result;
- exact Container CI source/result;
- independent source-audit source SHA/result contract;
- immutable target application image digest;
- immutable compatible recovery image digest/capability;
- target schema/catalog fingerprint;
- current deployed source/image identity;
- current funded-state authority hash/projection;
- current reader/access/CA/host/network/proxy baseline;
- current writer/queue/lease/reservation observation;
- candidate-specific backup/restore proof identifiers/hashes;
- prepare timestamp and expiry.

Preserve the existing short-lived preparation principle. Current runbooks use a 900-second class of preparation expiry; reuse the canonical existing rule unless current code/docs require a stricter value.

Stale candidate => fail closed.

Do not refresh a candidate by editing its timestamp or hashes.

---

## Backup and restore gate

Before an apply path can mutate the target schema/runtime, require a candidate-bound backup/recovery proof compatible with current canonical backup policy.

The implementation must integrate with or validate the current backup/restore authority such that:

- snapshot/config capture succeeded;
- archive is encrypted;
- manifest/hashes verify;
- offsite/local copy requirement is satisfied;
- isolated restore succeeded;
- schema/catalog checks succeeded;
- privacy deletion/revocation replay succeeded where required;
- narrative artifact data survived correctly;
- cleanup succeeded;
- proof is tied to this candidate, not an earlier generic backup;
- no plaintext secret/proof body is committed or printed.

A backup file existing on disk is not sufficient.

---

## Apply ordering requirements

Derive the exact order from current operational primitives, but the design must make unsafe partial states impossible to serve.

A valid implementation should reason explicitly about ordering similar to:

1. acquire locks;
2. durable transition intent/journal;
3. fence writers / stop required app services in bounded scope;
4. fresh authority/queue/foreign-workload readback;
5. verify candidate and candidate-bound restore proof again;
6. verify compatible recovery target before schema change;
7. apply schema change only through reviewed migration mechanism;
8. start target image/config with worker exposure still controlled;
9. validate schema/catalog/runtime capability;
10. validate Auth/readers/Access/CA/network/proxy;
11. validate unchanged funded window/limits/ledger/reservations/usage;
12. validate private/export/public DTO boundaries;
13. validate queue/fence state;
14. only then restore allowed serving/worker state;
15. persist post-check receipt.

The actual ordering may differ if current primitives require it, but justify any deviation in code comments/runbook and prove it in fixtures.

Do not make schema mutation first and hope recovery works afterward.

---

## Failure and recovery semantics

Implement and test fail-closed behavior for at least:

### Pre-apply failures

- stale prepare;
- source/CI/audit mismatch;
- target image digest mismatch;
- recovery image incompatibility;
- schema/catalog expectation mismatch;
- reader/access/CA/host drift;
- active unsupported reservation or lease;
- foreign writer;
- missing backup/restore proof;
- candidate/proof hash mismatch.

Expected: no target mutation.

### During apply

- interruption after durable intent but before service stop;
- interruption after service stop but before schema mutation;
- interruption after schema mutation but before new image healthy;
- interruption after new image starts but before post-check;
- lock contention;
- competing operator;
- unexpected foreign workload state.

Expected: deterministic inspect/recovery behavior with no blind retry.

### Post-check failure

Examples:

- health failure;
- runtime/source mismatch;
- schema/catalog mismatch;
- access/auth/readers mismatch;
- ledger/window/limit mismatch;
- queue/fence unsafe;
- public/privacy projection failure.

Expected: serving remains or becomes safely closed and only a compatible recovery target may be used.

---

## Rollback definition

Do not implement "rollback" as restoring a pre-038 image or old DB snapshot blindly.

After schema 038 or new narrative artifacts may exist:

- rollback target must be schema-compatible;
- rollback target must understand all relevant stored prompt-policy revisions or have a reviewed reconciliation path;
- narrative artifacts must not be dropped;
- current deletion/revocation replay must still be applied;
- funded window and ledger must remain unchanged;
- a prior database snapshot cannot automatically be served without privacy replay and authority verification.

If no compatible rollback target exists, the correct behavior is **fail closed**, not "best effort" serving.

---

## Required isolated fixture matrix

Build or extend Linux/root fixtures that exercise the actual file/Docker/state-machine primitives as far as the repository's existing fixture architecture allows.

At minimum cover:

### Success path

- valid active funded baseline;
- valid target/recovery capability;
- valid candidate;
- valid backup/restore proof;
- no unsafe queue work;
- schema/runtime upgrade succeeds;
- post-check succeeds;
- funded state before/after is byte-equivalent or logically exactly equivalent for all protected fields;
- unrelated workload preserved.

### Failure paths

- stale candidate rejected before mutation;
- target digest mismatch rejected;
- incompatible recovery target rejected;
- pre-038 rollback target rejected once schema 038 is active;
- active reservation/lease state rejected or explicitly reconciled according to reviewed rules;
- writer/queue not drained rejected;
- failed post-check triggers safe recovery/closed state;
- interruption after transition journal is recoverable without deleting evidence;
- competing lock/operator rejected;
- foreign workload is neither stopped nor mutated;
- funded window cannot be restarted;
- project/user allowance cannot be reset;
- usage/reservation ledger cannot be zeroed;
- reader list cannot be broadened as an upgrade side effect;
- old owner-zero receipts cannot be substituted for funded-runtime authority;
- manually altered candidate/receipt hash rejected.

### Compatibility paths

- pre-038 legacy data remains readable after upgrade;
- narrative artifact survives restore;
- supported frozen prompt-policy revisions remain interpretable;
- plan-review-era queue marker compatibility is checked;
- public/export/privacy projection does not expose private artifact unexpectedly;
- current delete/revoke replay remains effective.

Do not fake the critical assertions by mocking away the state being tested. Use synthetic/fake secrets and isolated containers/databases only.

---

## Security requirements

Do not weaken any of the following:

- private workspace ownership/mode rules;
- symlink/hardlink/alias rejection;
- SSH host pinning;
- TLS/CA verification;
- source/helper hash binding;
- GitHub CI readback authority;
- container/project scoping;
- DB target identity checks;
- writer fence;
- queue/lease/reservation checks;
- secrets isolation;
- log redaction;
- fail-closed schema/catalog guards.

No real credentials in tests.

No secret values in receipts intended for normal review.

No production participant email/UUID in repository files.

---

## Production / paid-action boundary

### Explicitly NOT authorized by this task

Do not:

- SSH into production to mutate state;
- deploy the new runtime;
- run migration 038 against production;
- alter production Docker containers;
- alter production Cloudflare Access;
- alter production Supabase state;
- change production readers;
- rotate credentials;
- open a new beta window;
- extend the existing beta window;
- reset project/user budgets;
- reset cost ledgers;
- perform paid OpenAI/Claude/provider calls;
- enable narrative cohort in production;
- merge your own PR.

Read-only repository work and isolated local/container fixtures are authorized.

If a verification requires real production mutation or paid provider activity, implement the guard/runbook for it and report it as a later release prerequisite; do not execute it.

---

## Documentation requirements

Update the current operational/canonical documents in the same implementation PR where required by the actual change.

At minimum review and update as appropriate:

- `docs/operations/NARRATIVE_RELEASE_HU.md`
- `docs/operations/LINUX_OPERATOR_HU.md`
- `docs/operations/RECOVERY_HU.md`
- `docs/operations/BACKUP_HU.md` if the candidate-bound backup contract changes
- `docs/DEVELOPMENT_PLAN_HU.md` N09 status/gate only if implementation evidence genuinely changes the status
- `docs/STATUS_HU.md` only if the repository state materially changes enough to warrant it

Do not mark N09 complete merely because code compiles.

N09 release readiness requires the evidence stated in canonical docs; production apply is separately authorized later.

Do not claim production upgraded.

Do not create a redundant implementation report if the Issue/PR plus canonical docs are sufficient.

---

## Required implementation quality

### Code organization

- Prefer small explicit state-transition helpers over one monolithic unsafe script.
- Reuse reviewed primitives where contracts match exactly.
- Keep client-side loader/orchestration and server-side privileged logic boundaries consistent with the existing operator architecture.
- Use durable atomic file writes where current operator state uses them.
- Validate strict schemas for candidate/receipt/journal inputs.
- Reject unknown fields where current security contracts require exact shape.
- Keep receipts secret-free and bounded in size.
- Make transitions idempotent only where semantically safe; do not make an interrupted destructive transition look like a fresh initial request.

### Error handling

- Explicit error classes/messages for operator-actionable failures.
- Do not catch-and-continue across security or authority mismatches.
- Recovery failure leaves the system closed.
- No automatic retry across a persisted transition/journal without evidence reconciliation.

### Testability

- Critical transition logic must be testable without production credentials.
- Fixtures must exercise real filesystem permission/atomicity behavior on Linux/root where relevant.
- Docker/container tests must remain isolated and must not touch unrelated host workloads.

---

## Acceptance criteria

The implementation PR is acceptable only if all of the following are demonstrated.

### Operator capability

- [ ] A documented Linux funded-runtime upgrade command/path exists.
- [ ] It starts from an already active funded runtime, not original-zero state.
- [ ] Inspect is read-only.
- [ ] Prepare is non-mutating and short-lived.
- [ ] Apply requires exact candidate-bound evidence.
- [ ] Existing activation receipts are not hand-edited or replayed.

### State preservation

- [ ] Original funded start/end window is preserved.
- [ ] Project allowance is preserved.
- [ ] Per-user allowance is preserved.
- [ ] Usage and reservations are preserved.
- [ ] Daily/concurrent limits are preserved.
- [ ] Readers/Auth authority is preserved.
- [ ] Access/CA/host/network authority is preserved.
- [ ] Unrelated workloads are preserved.

### Queue/writer safety

- [ ] New writes can be fenced before transition.
- [ ] Queue/lease/reservation state is inspected explicitly.
- [ ] Flag-off alone does not count as drain.
- [ ] Frozen narrative-policy jobs are not silently rewritten.
- [ ] Unsafe in-flight state fails closed or follows a reviewed deterministic reconciliation path.

### Schema/recovery

- [ ] Compatible recovery capability is required before schema 038 apply.
- [ ] Pre-038 incompatible rollback is rejected.
- [ ] Narrative artifacts survive backup/restore.
- [ ] Legacy/null artifacts remain readable.
- [ ] Delete/revoke replay remains valid.
- [ ] Schema/catalog guards are not weakened.

### Runtime compatibility

- [ ] Supported frozen narrative policy revisions are covered by capability checks/tests.
- [ ] Current plan-review queue marker/report compatibility is covered.
- [ ] Recovery/rollback cannot select an image that cannot interpret current stored runtime policy/artifact state.

### Failure handling

- [ ] Stale proof rejected.
- [ ] Lock contention handled fail-closed.
- [ ] Interrupted apply can be inspected/recovered deterministically.
- [ ] Failed post-check does not serve an unverified state.
- [ ] Incompatible recovery target keeps serving closed.
- [ ] Evidence is not deleted to permit retry.

### Operational evidence

- [ ] Linux/root isolated fixture covers success path.
- [ ] Fixture covers failed post-check.
- [ ] Fixture covers interrupted transition/recovery.
- [ ] Fixture covers active reservation/lease condition.
- [ ] Fixture covers stale candidate/proof.
- [ ] Fixture covers incompatible rollback.
- [ ] Fixture proves foreign workloads preserved.
- [ ] Before/after protected funded state comparison is explicit.

### Documentation

- [ ] Relevant runbooks updated.
- [ ] Production/paid boundary remains explicit.
- [ ] No document falsely claims production rollout.
- [ ] N09 status updated only to the level justified by evidence.

---

## Required tests and verification

Run repository checks applicable to the final diff.

Minimum expected:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
pnpm docs:check
```

In addition run all targeted operator/recovery tests introduced or affected by this work.

For Python tests, use the repository's current test invocation rather than inventing a new runner. Discover the existing commands from workflow/package/runbook files.

Run Linux/root-specific fixture checks where the repository CI architecture supports them.

If a root-only test cannot execute in your local environment:

- do not mark it PASS;
- ensure it is wired into the appropriate CI job;
- run all non-root coverage locally;
- state exactly what remains CI-only.

Do not perform paid provider calls as part of verification.

Do not use production credentials.

---

## CI expectations

The PR should be structured so the repository's Verify and Container workflows exercise the relevant changes.

If existing CI does not cover a new critical funded-upgrade fixture, add a bounded CI step using synthetic/isolated state, provided it does not require secrets or mutate external systems.

Do not weaken or skip existing checks to obtain green CI.

Expected final evidence should include exact workflow run IDs / source SHA when available.

---

## Independent audit boundary

Issue #34 requires commit-bound independent source audit before any production apply.

This implementation task should:

- make the upgrade package auditable as a bounded source set;
- document which files/helpers constitute the privileged upgrade bundle;
- preserve exact-source/hash validation where existing operators use it;
- provide the commands or runbook entry needed to bind a later audit result to a candidate.

Do not fabricate an audit result.

If no independent auditor is available during implementation, leave the production apply gate closed and report audit as an unresolved release prerequisite.

---

## Expected Git workflow

1. Start from current `main`.
2. Create a dedicated implementation branch, suggested:
   - `feat/linux-funded-runtime-upgrade-34`
3. Keep changes strictly within Issue #34 / N09 scope.
4. Make focused commits.
5. Run all applicable checks.
6. Push the branch.
7. Open a PR against `main`.
8. Link Issue `#34` in the PR body.
9. Do **not** merge the PR yourself.
10. Do not close Issue #34 unless the repository's normal merge workflow closes it and acceptance evidence truly supports closure.

---

## PR body requirements

The PR body must contain these sections.

### 1. Scope

What exact funded-upgrade capability was added.

### 2. State-machine design

Describe:

- inspect;
- prepare;
- apply;
- persisted journal/receipt;
- recovery;
- readback.

### 3. Preserved invariants

Explicit before/after list for:

- window;
- project/user budget;
- ledger/usage/reservations;
- caps;
- readers;
- Access/CA/host/network;
- unrelated workloads.

### 4. Queue/drain behavior

Explain why queue flags alone are insufficient and how leases/reservations/frozen policy jobs are handled.

### 5. Schema/recovery compatibility

Explain migration 038 ordering and incompatible rollback rejection.

### 6. Prompt-policy compatibility

List supported stored/frozen policy revisions and the mechanism that prevents selecting an incompatible runtime/recovery image.

### 7. Failure matrix

Table of tested failures and resulting state.

### 8. Files/areas changed

List the privileged operator bundle separately from tests/docs.

### 9. Verification

Exact commands and results.

### 10. CI evidence

Exact source SHA and workflow results.

### 11. Production / paid-action statement

Must state explicitly:

```text
Production mutation: NONE
Production migration: NONE
Production deployment: NONE
Paid provider calls: NONE
Beta window reset/extension: NONE
Credential rotation: NONE
```

unless an authorized human later separately changes the scope. This prompt does not authorize such changes.

### 12. Remaining release prerequisites

Examples:

- independent exact-source audit;
- immutable image digest proof;
- candidate-specific backup/offsite/restore proof;
- explicit production apply authorization;
- N08 paid/human quality release gate if still open.

### 13. Deviations

Any deviation from this prompt must be explicit and justified.

---

## Implementation evidence format

Include a concise evidence block similar to:

```text
Base main: <sha>
Implementation head: <sha>

Repository checks:
- format: PASS
- typecheck: PASS
- tests: PASS (<exact count if available>)
- build: PASS
- schemas: PASS
- docs: PASS

Targeted funded-upgrade tests:
- success transition: PASS
- stale candidate: PASS
- post-check failure: PASS
- interrupted transition: PASS
- lock contention: PASS
- active reservation/lease: PASS
- incompatible rollback: PASS
- foreign workload preservation: PASS
- funded state preservation: PASS
- narrative artifact restore: PASS
- prompt-policy compatibility: PASS

Production mutation: NONE
Paid provider calls: NONE
```

Only claim checks actually executed.

---

## Stop conditions

Stop implementation and report instead of improvising if you discover any of the following:

- current production-authority model cannot distinguish active funded runtime from original-zero using immutable evidence;
- safe schema-038 recovery requires a product/data decision not present in canonical docs;
- existing stored queue policy cannot be interpreted by any current candidate/recovery runtime and resolving it would require destructive mutation;
- existing backup format cannot safely preserve required narrative artifacts without a broader migration not covered by Issue #34;
- completing the task requires weakening privacy, schema/catalog, hostpin, TLS, budget or writer-fence guards;
- current `main` materially supersedes Issue #34.

In these cases:

1. do not invent a workaround;
2. do not modify production;
3. document the exact conflict;
4. propose the smallest follow-up Issue or owner decision required.

---

## Definition of done for this Codex task

This Codex task is done when:

- a coherent Linux active-funded upgrade path exists in code;
- it is protected by strict candidate/evidence validation;
- the current beta's funded/account/access state is structurally preserved;
- schema 038 and recovery compatibility are ordered safely;
- queue/fence/drain is explicit;
- incompatible rollback fails closed;
- isolated fixtures cover success and required failures;
- docs describe the exact supported operator flow and remaining production gates;
- repository checks are green or any external CI-only check is clearly identified;
- a PR is open against `main`;
- no production or paid action was performed.

Production rollout remains a later, separately authorized operation.

---

## Final response to the human reviewer

Return a concise handoff containing only:

- branch name;
- final commit SHA;
- PR number;
- implementation summary;
- principal operator/state-machine files changed;
- exact checks executed and result;
- CI state/run ID if available;
- unresolved release prerequisites;
- deviations from this task specification;
- confirmation that production mutation and paid calls were not performed.

Do not merge the PR.
