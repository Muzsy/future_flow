# alterward — engineering és helyi indítás


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valós Auth/ops nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Részletes beállítás: [SETUP](../SETUP.md). Parancsforrás: [package.json](../../package.json) és [CI](../../.github/workflows/ci.yml).

## Környezet

Node 24, pnpm 11.19.0, strict TypeScript, workspace és lockfile. A termék alterward, csomagnevek `@future-flow/*`. A gyökér `.env` szerver/worker, `apps/web/.env.local` csak publikus kliensváltozó. Az [érték nélküli minta](../../.env.example) használható; kulcs/jelszó nem kerül Gitbe, chatbe vagy logba. A már védett titokmappa neve technikai okból FutureFlow marad.

```powershell
pnpm install --frozen-lockfile
pnpm build:packages
pnpm db:migrate
pnpm dev
```

Web `http://localhost:3000`, API `http://localhost:4000`, OpenAPI `/api/openapi.json`. Supabase DB/Auth és OpenAI konfiguráció kell a tényleges generáláshoz. Hiányzó AI-kulcs nem ad mock személyes életet. UI/build/automatizált teszt kulcs nélkül ellenőrizhető. A valós smoke API-kreditet használ; dokumentációfrissítéshez nem szükséges.

## Ellenőrzések

```powershell
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
```

CI frozen install, formázás, typecheck, teszt, build, sémaexport és `docs/contracts` driftellenőrzés. Külön lint/SAST/dependency/production-deploy lépés jelenleg nem állítható késznek. Dokumentáció-only változásnál link/manifest/forráshash/diff ellenőrzés megfelelő; nem kell új paid AI-próba.

## Migráció és szerződés

001–006 már alkalmazott. Checksum-védelem/tranzakció; 003 v2 élet, 004 költségőr, 005 mérés/törlési recovery. Tiszta domain-kontraktus és API/AI boundary validálás, tulajdonosi FK/SQL invariant. JSON-sémát kódból exportálunk, nem kézzel külön truth source-ként szerkesztünk. Az archív manifest nem regenerálható, a friss témacsomagé igen.

## Munka és release

A felhasználó `Muzsy/future_flow` **main** ágát kérte; nem készítünk helyette kötelező feature branch/PR-folyamatot. Main commit és CI nem nyilvános deploy. Staging/prod külön credential/backup/restore/proxy/HTTPS és release-felelős még feladat. Docker/Kubernetes/Redis/realtime/mobile nem a helyi indítás előfeltétele.

Változás átadása: konkrét viselkedés, séma/migráció/jogosultság/AI-költség hatás, megfelelő ellenőrzés és friss státusz. `apps/web` kódváltozás előtt az ottani AGENTS és a telepített Next útmutató követendő. A következő kapu P06 valós Auth/ops és P07 emberi minőség; P09 public alap előkészíthető.
