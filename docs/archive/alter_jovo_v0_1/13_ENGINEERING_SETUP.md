# Alter Jövő — engineering setup

## 1. Repo

```text
alter-jovo/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ worker/
├─ packages/
│  ├─ contracts/
│  ├─ api-client-ts/
│  ├─ config/
│  └─ test-fixtures/
├─ database/
│  ├─ migrations/
│  ├─ seed/
│  └─ policies/
├─ docs/
├─ infra/
├─ scripts/
└─ .github/
```

## 2. Package manager

Javaslat: `pnpm` workspace.

Egy package manager legyen és lockfile kötelező.

## 3. Runtime

Node verzió repo-ban rögzítve:
- `.nvmrc` vagy `.tool-versions`;
- `engines`;
- CI ugyanaz.

Ne dokumentumban hardcode-oljunk gyorsan avuló patch verziót.

## 4. TypeScript

`strict: true`

Kerülendő:
- indokolatlan `any`;
- unchecked type assertion;
- DTO/domain type keverés.

## 5. Validation

Három réteg:
- API boundary → DTO validation;
- AI boundary → JSON schema;
- DB boundary → constraint.

## 6. DB migráció

`database/migrations`

Minden schema change:
- migration;
- compatibility review;
- seed update, ha kell.

Productionben nincs auto-sync.

## 7. Seed

Minimum:
- trait definitions;
- questionnaire v0;
- prompt metadata;
- 5 synthetic profile.

Valós user adat tilos.

## 8. Local dev

- Docker Compose opcionális;
- Supabase local/dev;
- mock AI provider;
- UI AI key nélkül is induljon.

## 9. Mock AI

Kötelező.

Fixtures:
- event generation;
- decision;
- chapter;
- profile extraction később.

Előny:
- determinisztikus;
- gyors;
- olcsó;
- CI-kompatibilis.

## 10. Env

Példa:

```text
APP_ENV
WEB_BASE_URL
API_BASE_URL

SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY

AI_PROVIDER
AI_API_KEY

LOG_LEVEL
```

Service role csak server.

## 11. Secrets

- `.env` gitignore;
- `.env.example` csak kulcsnév;
- prod secret manager;
- CI secret scan;
- rotation playbook.

## 12. CI

Minden PR:
1. frozen install;
2. lint;
3. typecheck;
4. unit;
5. integration;
6. contract diff;
7. migration validation;
8. web build;
9. api build;
10. dependency/security scan.

Live AI eval inkább nightly/explicit.

## 13. Git

- `main` deployable;
- short-lived feature branch;
- PR;
- protected main.

## 14. PR template

- mit változtat;
- domain impact;
- migration?;
- API breaking?;
- privacy impact?;
- AI cost impact?;
- tests.

## 15. Coding style

Backend:
- vékony controller;
- use-case service;
- domain invariant;
- explicit transaction.

Frontend:
- feature-based;
- central API client;
- isolated form state;
- server/client component tudatos.

## 16. Feature flags

Experimental funkció:
- flag;
- default off;
- cohort.

## 17. Observability

MVP:
- requestId;
- jobId;
- opaque userId;
- structured log;
- latency;
- AI usage;
- error rate.

Később tracing/dashboard/alert.

## 18. Error taxonomy

- `AUTH_*`
- `PROFILE_*`
- `SIMULATION_*`
- `AI_*`
- `JOB_*`
- `STORY_*`
- `PRIVACY_*`

## 19. Admin

Minimum:
- user id keresés;
- job státusz;
- AI run meta;
- future státusz;
- engedélyezett retry;
- delete/export support.

Admin ne kapjon automatikus hozzáférést teljes privát történethez.

## 20. Release

Staging:
- migration;
- smoke;
- synthetic future;
- web e2e.

Production:
- backup check;
- migration;
- API;
- worker;
- web;
- smoke;
- monitor.

## 21. Development order

### Slice A
Auth + user + health.

### Slice B
Profile draft → commit.

### Slice C
Future API → mock simulation → timeline.

### Slice D
Real AI event generation.

### Slice E
Story.

### Slice F
Decision/fork.
