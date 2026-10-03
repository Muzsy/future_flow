# Alter Jövő — rendszerarchitektúra

## 1. Cél

Webalkalmazásként indul, de a backend és az API eleve több kliensre készül.

## 2. High-level

```text
                    ┌──────────────────┐
                    │     Next.js      │
                    │    Web Client    │
                    └────────┬─────────┘
                             │
                        HTTPS / REST
                             │
                    ┌────────▼─────────┐
                    │     NestJS       │
                    │ Modular Monolith │
                    └───┬────┬────┬────┘
                        │    │    │
               ┌────────┘    │    └────────┐
               ▼             ▼             ▼
          PostgreSQL     AI Providers    Storage
          / Supabase     abstraction     / Supabase
               │
               ├─────────► Queue / PGMQ
               └─────────► Realtime

Később:
                    ┌──────────────────┐
                    │ Flutter Mobile   │
                    └────────┬─────────┘
                             │
                        ugyanaz az API
```

## 3. Miért külön backend?

Várható:
- web;
- mobil;
- AI job;
- worker;
- community;
- admin;
- verziózott szimuláció;
- költségmérés.

A domain logika ezért külön NestJS-ben legyen.

## 4. Miért modular monolith?

MVP-ben:
- gyorsabb;
- egyszerűbb deploy;
- könnyebb tranzakció;
- kevesebb distributed-system hiba;
- könnyebb refaktor.

Modulhatárok későbbi szétválasztást engedjenek.

## 5. Backend modulok

```text
src/
├─ auth/
├─ users/
├─ profiles/
├─ questionnaires/
├─ relationships/
├─ futures/
├─ simulation/
├─ stories/
├─ decisions/
├─ branches/
├─ ai/
├─ jobs/
├─ community/
├─ moderation/
├─ notifications/
├─ billing/
├─ analytics/
├─ admin/
└─ common/
```

MVP-ben aktív:
auth, users, profiles, questionnaires, relationships, futures, simulation, stories, decisions, branches, ai, jobs, common.

## 6. Web

Next.js App Router.

Javasolt:
```text
app/
features/
components/
lib/
api-client/
schemas/
state/
styles/
```

Frontend:
- render;
- form validation;
- API client;
- UI state.

Frontend nem:
- szimulál;
- canonical state-et számol;
- közvetlen AI providert hív.

## 7. Mobil később

Flutter:
- UI layer;
- data layer;
- use-case/domain layer szükség szerint;
- generated API client.

A szerver marad a domain truth source.

## 8. API

REST + OpenAPI.

Base:
`/api/v1`

Előny:
- egyszerű;
- mobilbarát;
- kliens generálható;
- NestJS támogatás.

## 9. Auth

Supabase Auth mint identity provider.

Flow:
1. kliens login;
2. token;
3. NestJS verify;
4. belső user record;
5. object authorization;
6. RLS defense-in-depth, ahol releváns.

`service_role` soha nem kliensoldali.

## 10. Adatbázis

PostgreSQL:
- reláció;
- tranzakció;
- JSONB;
- RLS;
- migráció;
- analytics.

A fontos domain entitások ne csak JSON blobok legyenek.

## 11. Queue

Hosszú AI műveletek:
- first future;
- branch simulation;
- chapter;
- re-generation.

MVP javaslat:
**Supabase Queues/PGMQ**, ha Supabase az infra.

Alternatíva később:
BullMQ + Redis.

## 12. Job state

```text
queued
running
validating
completed
failed
cancelled
```

Job meta:
- id;
- type;
- owner;
- resource;
- stage;
- error;
- timestamps.

## 13. Storage

- avatar;
- export;
- később story illustration.

Default privát bucket.
Signed URL rövid TTL.

## 14. Realtime

Csak ahol kell:
- job progress;
- notification;
- később live comment.

Nem kell minden táblára.

## 15. First future adatfolyam

```text
Web
 ↓
POST /futures
 ↓
NestJS
 ↓
future + job transaction
 ↓
queue
 ↓
worker
 ↓
profile snapshot
 ↓
initial state
 ↓
AI candidate events
 ↓
domain validate
 ↓
simulate
 ↓
persist
 ↓
story AI
 ↓
story validate
 ↓
chapter persist
 ↓
job complete
```

## 16. Monorepo

```text
alter-jovo/
├─ apps/
│  ├─ web/
│  ├─ api/
│  ├─ worker/
│  └─ mobile/       # később
├─ packages/
│  ├─ contracts/
│  ├─ api-client-ts/
│  ├─ config/
│  └─ shared-types/
├─ database/
│  ├─ migrations/
│  └─ seed/
├─ docs/
├─ infra/
└─ scripts/
```

## 17. Dependency szabály

```text
controllers
 ↓
application services
 ↓
domain
 ↓
ports/interfaces

infrastructure adapters
 ↑
ports/interfaces
```

AI SDK ne szivárogjon domain layerbe.

## 18. Config

Environment:
- secrets;
- endpoint;
- provider key;
- feature flags.

Repo/config:
- questionnaire;
- prompt template;
- domain rules.

## 19. Környezetek

Minimum:
- local;
- staging;
- production.

Külön DB/Auth/Storage/AI credential.

## 20. Deploy

MVP:
- web: Next host vagy container;
- api/worker: Docker;
- DB/Auth/Storage/Queue: Supabase;
- HTTPS.

Ne Kubernetes-szel kezdjünk.

## 21. Skálázási út

1. worker horizontal scale;
2. queue szétválasztás;
3. DB read replica;
4. story/community külön service csak szükség esetén;
5. analytics pipeline.

## 22. Invariantok

1. AI provider nem kliensből elérhető.
2. Canonical state csak backend domain service-en át módosul.
3. Future profile versionhöz kötött.
4. Fork előtti branch immutable.
5. AI state output validált.
6. Privát adat default.
7. Mobil nem függ a web implementációjától.
