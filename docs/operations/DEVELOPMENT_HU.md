---
status: canonical
owner: operations
last_reviewed: 2026-10-12
related:
  - ../SETUP.md
  - ../../AGENTS.md
---

# Development operations

## Supported repository toolchain

- Node.js: `>=24 <25`
- pnpm: `11.19.0`
- TypeScript monorepo
- local web/API/worker development through root scripts

## First-time setup

1. install Node 24 and the repository pnpm version;
2. `pnpm install --frozen-lockfile`;
3. create local secret environment from `.env.example` without committing values;
4. configure only the services needed for the task;
5. run migrations only against an explicitly selected development/test database.

Detailed Supabase/OpenAI/local secret setup remains in `../SETUP.md` until that long-form runbook is further decomposed.

## Local commands

```bash
pnpm dev
pnpm build:packages
pnpm db:migrate
pnpm verify:infra
```

Verification commands are defined in `TESTING_HU.md`.

## Secret boundary

Never commit API keys, DB passwords, Supabase service-role keys, recovery identities or production `.env` files.

`NEXT_PUBLIC_*` values are the only configuration intentionally available to the browser. Server/admin/DB/AI secrets must stay server-side.

## Database work

Migration policy:

- do not rewrite an already-applied migration;
- new schema changes get a new migration;
- update runtime/repository code and tests together;
- update privacy/recovery schema baselines when the schema legitimately changes;
- verify repeat migration/deployment behavior through CI.

## AI work

Paid provider smoke tests are never part of an ordinary code/documentation edit by default. Use deterministic/local tests unless the task explicitly requires a real provider call and the approved budget/gate permits it.

## Branch workflow

Follow root `AGENTS.md`: Issue → branch → change → verification → PR → CI → merge.
