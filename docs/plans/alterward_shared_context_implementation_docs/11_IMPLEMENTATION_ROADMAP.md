# 11. Implementációs roadmap

## S0 — Foundation

AI nélkül:

- shared contracts;
- shared core;
- migration;
- repository;
- social profile;
- entitlement;
- context create/list/detail;
- invite/accept;
- tests.

## S1 — Friend deterministic MVP

Explorer:

- 2–10 member;
- 1 active context;
- branch/time binding;
- deterministic test/shared event;
- intents;
- resolution;
- memory-only impacts.

Először AI nélkül legyen végigvihető.

## S2 — Shared AI

- `SharedAiProvider`;
- shared jobs;
- worker;
- validator/repair;
- AI budget.

## S3 — Personal integration

- pending impact materialization;
- `memory.sharedEvents`;
- next personal period;
- UI notification;
- personal fork rules.

## S4 — Connected romantic

- max 2;
- max 1/user;
- mutual formation/escalation;
- unilateral end;
- abuse/privacy tests.

## S5 — Connected work/project + hobby

- roles;
- governance;
- majority/role authority;
- type state;
- leave/remove;
- typed personal impacts.

Financial ownership csak külön validált adapterrel.

## S6 — World sport

- max 20;
- roster;
- coach/captain;
- participant subset;
- concurrency/quorum.

## S7 — Advanced

- context split;
- group fork;
- sponsored seats;
- searchable directory;
- public multi-party snapshot;
- richer SharedEntity.

## Fájltérkép

### contracts
`shared-context.ts`, index export, error messages.

### core
`shared-context.ts`: state validator, policy resolver, impact adapter, time compatibility.

### database
`shared-contexts.ts`, `shared-jobs.ts`, entitlement, deletion anonymization.

### API
Új `SharedContextController`; az `app.ts` később modularizálható.

### worker
`shared-processor.ts`, fair queue.

### AI
`SharedAiProvider` + OpenAI implementation.

### web
Connections dashboard/context/invite/decision/social profile.

### docs
Frissítendő:
- root README;
- STATUS;
- IMPLEMENTATION;
- PRODUCT_PLAN;
- NEXT_STEPS;
- REQUIREMENTS_TRACEABILITY.

## Feature flags

```text
SHARED_CONTEXTS_ENABLED=false
SHARED_FRIEND_ENABLED=false
SHARED_CONNECTED_ENABLED=false
SHARED_WORLD_ENABLED=false
```

Foundation deployolható kikapcsolt funkcióval.

## Rollout

schema → backend read → backend mutation → tests → friend UI → friend beta → shared AI → Connected → World.
