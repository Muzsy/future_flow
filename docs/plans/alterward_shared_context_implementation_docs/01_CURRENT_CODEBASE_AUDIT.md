# 1. Jelenlegi kódbázis audit

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Aktuális technikai alap

A repó Node 24 + pnpm 11.19 monorepo. Fő részek:

- `apps/web`: Next.js;
- `apps/api`: NestJS REST;
- `apps/worker`: háttér AI worker;
- `packages/contracts`: Zod/TS szerződések;
- `packages/core`: determinisztikus domain;
- `packages/database`: PostgreSQL repository/tranzakció;
- `packages/ai`: OpenAI Responses API;
- `database/migrations`: jelenleg 001–007;
- `tests`: Vitest + PGlite.

A root `pnpm check` format + typecheck + test + build.

## Privát v2 életmodell

Kulcsfájlok:

- `packages/contracts/src/life-v2.ts`
- `packages/core/src/life-v2.ts`
- `packages/database/src/lives.ts`
- `packages/database/src/life-jobs.ts`
- `apps/worker/src/life-processor.ts`
- `database/migrations/003_period_lives.sql`

`LifeStateV2` tartalmaz employment/location/finance/assets/actors/skills/goals/opportunities/resources mezőket.

Az `actors` max. 30, és egy actor jelenleg:

```ts
{
  id: UUID,
  label: string,
  relationship: 'partner' | 'family' | 'friend' | 'colleague' | 'other'
}
```

Ez nem lehet a teljes 10–20 fős valódi user-csoport elsődleges tárolója. A Shared Context taglistája külön adatmodell.

## Ownership

A 003 migrációban a life/branch/period/history/choice/job mind `user_id`-hoz kötött. A repository és FK-struktúra egytulajdonosú.

**Döntés:** nem módosítjuk multi-ownerre. A Shared Context külön domain.

## Újrahasznosítandó konzisztencia-minták

A meglévő v2-ből átveendő:

- revision;
- idempotency;
- `FOR UPDATE`;
- egy aktív job/aggregate;
- worker lease + heartbeat;
- immutable canon;
- hash;
- strukturált AI output → core validáció → transaction commit;
- max. egy automatikus repair.

## Public/privacy alap

Releváns:

- `packages/contracts/src/public-draft.ts`
- `packages/core/src/public-draft.ts`
- `packages/database/src/public-drafts.ts`
- `006_public_draft_foundation.sql`

A Shared Context ugyanazt az elvet használja:

```text
PRIVATE LIFE STATE
        ↓ allowlist
INTERACTION PROJECTION
        ↓
SHARED CONTEXT
```

Más user teljes private state-et nem kap.

## Account deletion

`apps/api/src/account-deletion.ts` recovery-kompatibilis Auth→DB törlést használ.

Shared Contextnél egy user törlése nem törölheti mások közös történetét. A shared history member-ID alapú legyen; user/life/branch link törölhető vagy nullázható.

## API

A v2 API az `apps/api/src/app.ts` `LifeController` mintáját használja:

- AuthGuard;
- Zod;
- DomainError;
- Idempotency-Key;
- repository ownership.

Az új Shared controller ezt a mintát kövesse.

## Worker

`apps/worker/src/main.ts` jelenleg legacy és v2 life queue közt vált. Shared job után fair 3-queue scheduling kell. Első verzióban nem kell külön microservice.

## Frontend

Aktuális:

- `apps/web/app/[...route]/page.tsx` → `Experience`;
- `components/experience.tsx`;
- `components/life-experience.tsx`;
- `lib/client.ts`.

**Kötelező:** web módosítás előtt elolvasni `apps/web/AGENTS.md` és az ott előírt telepített Next.js dokumentációt.

## Kompatibilitási tilalmak

Tilos:

- 001–007 checksum változtatás;
- v1/v2 canon átírás;
- `LIFE_CONTRACT_VERSION = 2.0.0` jelentésének csendes változtatása;
- personal `visibility: private` megszüntetése;
- direct kliens DB-hozzáférés shared/private táblákhoz;
- más user branchének ownership megkerüléssel olvasása.
