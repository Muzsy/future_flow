# alterward — rendszerarchitektúra

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált: foundation, friend canon/own intent/pending memória és valódi Shared OpenAI/lease/fair queue, kikapcsolva; S3–S7 tervezett. 001–009 alkalmazva, következő S3 személyes integráció/Connections/privacy. [S2 megvalósítás és korlátok](../SHARED_CONTEXT_S2_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · Meglévő architektúra és tervezett bővítés. [Implementáció](../IMPLEMENTATION.md).

## Meglévő adatfolyam

Next.js web → `/api/v1` és `/api/v2` NestJS API → PostgreSQL tulajdonosi/tranzakciós réteg → külön worker → szerveroldali OpenAI → validált canon/fejezet/jobcheckpoint → API-visszaolvasás. Supabase Auth adja az identitást; a szerver `getUser` ellenőrzést használ. A kliens nem hív OpenAI-t és nem módosít közvetlen canonical táblát.

Monorepo: `apps/web`, `apps/api`, `apps/worker`; `packages/contracts`, `core`, `database`, `ai`; `database/migrations`; `scripts`; `tests`; `docs`. A repó `future_flow`, a termék alterward, a meglévő `@future-flow/*` csomagnevek kompatibilitásból maradnak. Next/Nest patchverzió forrása a package és lockfile, nem egy elavuló architektúraleírás.

## Queue és határok

PostgreSQL jobs + `FOR UPDATE SKIP LOCKED`, lease token, heartbeat és tranzakciós enqueue/commit. PGMQ/Redis nem szükséges a jelenlegi működéshez. A v0.1 PGMQ-javaslatot a tranzakciós hordozhatóság váltotta fel. Átvett job régi workere nem commitolhat. Esemény/történet checkpoint megőrzi az elfogadott lépéseket.

Contracts a típusok/sémák; core a tiszta domain; database a tárolás; ai a provider/prompt/nyelvi utasítás/audit; API alkalmazásszintű auth/idempotencia; worker orchestráció; web megjelenítés/űrlap. Moduláris monolit, külön workerfolyamattal; új microservice/vektoradatbázis nem előfeltétel.

## V2 — integrált privát élet

A v2 szerződés/domain, 003–005 tárolás, API és worker együtt működik: élet/head/revision/period/choice, hat hónapos AI, same-branch continuation, saját történeti fork, memória és költségfoglalás. A 006 privát snapshot/szcenáriópiszkozatot, a 007 feedbacket és aktivitási sessiont ad. V1 DTO és immutable canon megmarad; az API-verzió és az életszerződés külön fogalom. A tárolt nyelvek regisztere bővíthető, a termékben csak angol engedett.

## Public bővítés — terv

| Modul | Felelősség |
|---|---|
| Simulation | Privát élet/ág/időszak/tény/korlát/AI/job |
| Public Content | ScenarioVersion, Publication, sanitized PublicSnapshot/checkpoint, Discovery |
| Community | Save, Share és új saját privát fork; később social |
| Moderation | PII/tartalmi scan, Report, review, hide/remove és audit |

Public endpoint csak külön DTO-ból ad olvasást, nem új anon policy a privát táblákon. Snapshot cache verzió szerint, permission/revocation ellenőrzés hozzáférésenként; CDN esetén purge és rögzített invalidálási ablak. SEO/OG kizárólag public, explicit indexelhető snapshot. Olvasás nem kerül workerqueue-ba.

## Infrastrukturális határ

Most helyi web/API/worker és Supabase működik; a main CI ellenőriz, nem deployol. Staging/production izoláció, HTTPS/reverse proxy/rate-limit, backup/restore, monitor/alert és release-felelősség külön indulási feladat. Storage/avatar, realtime push, natív mobil, fizetés és admin UI nem kész szolgáltatás; csak használati igény alapján később épül. A több klienshez API-határ marad, mobiltechnológia nem aktuális implementációs kötelezettség.

A Contabón a meglévő Caddy marad a belépési pont. A külön web/API/worker csomag nyilvános alkalmazásport nélkül, elkülönített titkokkal és verified CA-mounttal előkészített. A teljes izolált runtime CI sikeres; az élő route/hálózat és alkalmazás még nincs aktiválva. [Telepítés és kapuk](../DEPLOYMENT_HU.md).

## Tervezett SharedContext modul

Külön contracts/core/database/API/AI/worker/web modul a monorepóban, nem új fizetős szolgáltatás. Life/branch egytulajdonosú marad; context saját canon/revision/lease. Worker fair ciklus personal-v2→shared→legacy; a jelenlegi kódban csak két queue. Rendezett user→context→member/invite/event→branch lock, lazy egyágas impact, deleting-account védelem. Feature flag-ek kezdetben false, még nem léteznek a konfigurációban.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S2 implementációs kiegészítés

S2 SharedJobRepository és shared-processor a meglévő 008 táblákon; fair personal-v2 → Shared → legacy kör. Claim/verify/complete rendezett user → context → job, clock_timestamp lease; checkpointból új paid hívás nélküli restart. Feature false. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).
