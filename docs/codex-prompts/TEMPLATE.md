---
status: active-supporting
owner: agents
created: YYYY-MM-DD
base_commit: <main SHA>
issue: <number-or-null>
workstream: <workstream-id>
state: active
---

# Codex task — <title>

## Role

You are the implementation agent for the Alterward repository.

## Repository

- Repository: `Muzsy/future_flow`
- Base branch: `main`
- Base commit at prompt creation: `<sha>`

Before changing anything, fetch the current `main`. If it has moved materially from `base_commit`, inspect the delta and stop only if the task assumptions are invalidated or conflict with new canonical decisions.

## Mandatory reading order

1. `AGENTS.md`
2. `docs/DOCS_INDEX_HU.md`
3. `docs/STATUS_HU.md`
4. relevant section of `docs/DEVELOPMENT_PLAN_HU.md`
5. task-specific canonical docs listed below
6. relevant code, contracts, migrations, tests and active runbooks

Do not bulk-load historical documentation unless needed to resolve a specific question.

## Task authority

- Issue: `<issue>`
- Workstream: `<id>`
- Canonical sources:
  - `<path>`
  - `<path>`

## Goal

<One clear outcome.>

## Current state

<What is true in current main and, if relevant, production. Distinguish main from deployed runtime.>

## Scope

- <required change>
- <required change>

## Non-scope

- <explicitly excluded work>
- <no unrelated refactor>

## Required implementation

1. <step/outcome>
2. <step/outcome>
3. <step/outcome>

## Invariants and constraints

Preserve all applicable existing guarantees, including:

- ownership and authorization boundaries;
- privacy and deletion/export guarantees;
- idempotency and concurrency protections;
- AI budget, rate-limit and cost attribution;
- writer-fence, recovery and rollback safety;
- compatibility with existing stored data and queued work;
- existing release flags unless explicitly changed by this task.

Do not weaken a guard merely to make tests pass.

## Production / paid-action boundary

Default: **not authorized**.

Unless this task explicitly says otherwise, do not:

- mutate production;
- deploy or activate a release;
- start a new beta window;
- make paid provider calls;
- rotate credentials;
- reset or edit cost ledgers/receipts;
- change Cloudflare/Supabase production state.

## Acceptance criteria

- [ ] <criterion>
- [ ] <criterion>
- [ ] <criterion>

## Required tests and verification

Run all relevant repository checks. At minimum, where applicable:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
pnpm docs:check
```

Also run task-specific tests for the affected security/recovery/operations boundary.

Record exact commands and results in the PR body.

## Documentation requirements

Update canonical documentation in the same PR if this task changes product behavior, contracts, data model, entitlement, monetization, privacy/security, AI routing/budget, deployment/recovery, release gates or workstream status.

Do not create a new status/report document when the result belongs in an existing canonical document or the Issue/PR history.

## Git workflow

1. Create a dedicated branch from current `main`.
2. Do not commit directly to `main`.
3. Keep the branch limited to this task.
4. Make focused commits.
5. Push the branch.
6. Open a PR against `main`.
7. Do **not** merge the PR yourself unless explicitly instructed.

## PR body requirements

Include:

- task/issue reference;
- implementation summary;
- files/areas changed;
- acceptance criteria mapping;
- exact verification commands and results;
- documentation impact;
- production/paid-action statement;
- known risks and unresolved items;
- deviations from this prompt, if any.

### Implementation evidence

Provide concrete evidence, for example:

```text
Tests: <count/result>
Typecheck: PASS
Build: PASS
Schemas: PASS / unchanged
Docs check: PASS
Production mutation: NONE
Paid provider calls: NONE
```

Do not claim checks that were not actually executed.

## Final response

Return only a concise handoff containing:

- branch name;
- final commit SHA;
- PR number;
- summary of changes;
- checks executed and results;
- unresolved risks;
- any deviation from the task specification.
