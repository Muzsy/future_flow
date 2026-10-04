# 12. Implementáló agent végrehajtási checklist

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Indulás

- HEAD ellenőrzés.
- Ha eltér a baseline-tól, diff.
- Olvasd: root README, STATUS, PRODUCT_PLAN, V2_SIMULATION_CONTRACT, PUBLIC_CONTENT_IMPLEMENTATION_PLAN, `apps/web/AGENTS.md`.
- Migrációs sorszám újraellenőrzés.
- Alkalmazott migrációt ne módosíts.

## Invariánsok

- personal ownership egyuseres;
- SharedContext külön domain;
- nincs ownership bypass más branchére;
- interaction projection nélkül nincs shared AI;
- AI output domain-validált;
- nincs arbitrary JSON mutation;
- nincs AI user-proxy;
- nincs automatikus publication;
- nincs hardcoded ár core-ban;
- tier gate server-side.

## Első PR

Csak foundation:

- contract/core;
- migration;
- repository;
- social profile;
- entitlement;
- friend create/list/detail;
- invite/accept/decline;
- tests.

AI még ne legyen.

## Második PR

- intents;
- deterministic resolution;
- impacts;
- personal memory integration;
- tests.

## Harmadik PR

- shared jobs;
- SharedAiProvider;
- worker;
- friend UI;
- paid smoke csak engedéllyel.

## Web

`apps/web/AGENTS.md` kötelező. Telepített Next dokumentációt olvasd el módosítás előtt.

## Parancsok

```bash
pnpm build:packages
pnpm schemas
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## AI költség

Automatizált teszt nem használ paid API-t. Valódi smoke csak explicit kerettel/guarddal.

## Dokumentáció

Minden fázis után a repo státusz dokumentumai a valós implementációt tükrözzék.

## Tiltott shortcutok

- personal `is_shared` flag;
- közös company/team state másolása minden personal state-be;
- email public user lookup;
- kliens által megadott role/weight vak bizalma;
- client-only tier gate;
- minden group member automatikus `actors`-ba másolása;
- 20 personal branch egyetlen hosszú transactionben;
- AI által kitalált más-user intent.
