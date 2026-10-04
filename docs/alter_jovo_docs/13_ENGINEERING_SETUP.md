# alterward — engineering és helyi indítás

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0/S1 implementált: foundation és friend canon/own intent/resolution/pending memória, kikapcsolva; S2–S7 tervezett. 001–009 alkalmazva, következő S2 valódi Shared OpenAI. [S1 megvalósítás és korlátok](../SHARED_CONTEXT_S1_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · Részletes beállítás: [SETUP](../SETUP.md). Parancsforrás: [package.json](../../package.json) és [CI](../../.github/workflows/ci.yml).

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

001–007 már alkalmazott. Checksum-védelem/tranzakció; 003 v2 élet, 004 költségőr, 005 mérés/törlési recovery, 006 privát előnézet, 007 feedback/session. Tiszta domain-kontraktus és API/AI boundary validálás, tulajdonosi FK/SQL invariant. JSON-sémát kódból exportálunk, nem kézzel külön truth source-ként szerkesztünk. Az archív manifest nem regenerálható, a friss témacsomagé igen.

## Munka és release

A felhasználó `Muzsy/future_flow` **main** ágát kérte; nem készítünk helyette kötelező feature branch/PR-folyamatot. Main commit és CI nem nyilvános deploy. Staging/prod külön credential/backup/restore/proxy/HTTPS és release-felelős még feladat. Docker/Kubernetes/Redis/realtime/mobile nem a helyi indítás előfeltétele.

Változás átadása: konkrét viselkedés, séma/migráció/jogosultság/AI-költség hatás, megfelelő ellenőrzés és friss státusz. `apps/web` kódváltozás előtt az ottani AGENTS és a telepített Next útmutató követendő. P06 Auth/UI/kontrollált recovery sikeres; a következő kapu a backup/restore, valós DB-kiesésből recovery és éles Contabo-ops. P07 angol AI-audit kész, használói értékelés a béta után; P09 public alap bővíthető.

### Contabo belső audit

A [2026-10-04-i olvasási audit](../CONTABO_SERVER_AUDIT_HU.md) sikeres SSH-belépéssel lezárta a kapacitás és meglévő környezet inventárját: Ubuntu 24.04.4, 4 vCPU/8 GB RAM, 4,91 GiB elérhető memória és 71 GiB szabad tárhely. Docker 29.1.3/Compose v5.1.4 mellett a YAML-parszolás sikeres. Hoston Node 22 van, az alkalmazás Node 24 Docker image-et használ. A meglévő Caddy miatt közös route és külön proxy-hálózat kell; a saját 80/443 portkötés itt ütközne. Teljes runtime/terhelés/restore és élesítés nem történt; a tűzfal/TLS és karbantartási pontok még rendezendők. Az audit akkori SSH-megállapításait az alábbi végrehajtás felülírja.

[Audit utáni végrehajtás](../CONTABO_PREPARATION_REPORT_HU.md): külön kulcsos SSH és jelszavas tiltás friss kapcsolatokkal ellenőrzött; konfiguráció és proxy-storage védetten mentve, 25 hash egyezik. A Contabo web/API/worker fájl, meglévő proxy hálózatmerge és Caddy adapt sikeres a szerveren; 2816 MiB runtime-korlát, nulla alkalmazásport. [CI 37194453326](https://github.com/Muzsy/future_flow/actions/runs/37194453326): 159 teszt/build/séma-drift és teljes container job sikeres. Külön PostgreSQL/TLS fixture-ben migráció és ismétlés, web/API/worker/proxy, verified HTTPS/DB TLS, API 401, két üres queue és worker megállás SIGKILL nélkül. Ez nem éles telepítés, aktív AI-job drain vagy terhelés/restore bizonyíték. Fizetett AI-hívás nincs az infrastruktúrapróbában.

## Shared S0 implementáció és S1 következő szelet

Shared contract/core, SharedContextRepository/controller és 008/009 implementált, 36 új célzott regresszió és 11 új séma. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). Disabled flags; 008/009 a fejlesztői Supabase-on Session poolerrel alkalmazva, valódi HTTP/export/törlés-próba sikeres. Shared job repository/processor és AI-provider S1/S2; Life v2, 18 régi séma és 001–007 változatlan. pnpm check/séma-drift és izolált PostgreSQL 16 CI-race; paid próba és Contabo-módosítás nincs.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).
