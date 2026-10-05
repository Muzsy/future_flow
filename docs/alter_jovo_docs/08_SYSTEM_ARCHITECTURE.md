# alterward — rendszerarchitektúra

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · Meglévő architektúra és tervezett bővítés. [Implementáció](../IMPLEMENTATION.md).

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

Külön contracts/core/database/API/AI/worker/web modul a monorepóban, nem új fizetős szolgáltatás. Life/branch egytulajdonosú marad; context saját canon/revision/lease. Worker fair ciklus personal-v2→shared→legacy; S2 óta három queue, a Shared csak enabled+friend flag mellett claimelhető. Rendezett user→context→member/invite/event→branch lock, lazy egyágas impact, deleting-account védelem. A négy feature flag létezik és false; lazy személyes impact S3-ban implementált.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S2 implementációs kiegészítés

S2 SharedJobRepository és shared-processor a meglévő 008 táblákon; fair personal-v2 → Shared → legacy kör. Claim/verify/complete rendezett user → context → job, clock_timestamp lease; checkpointból új paid hívás nélküli restart. Feature false. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

S3 user→own branch mutation-lock alatt egyszer materializálja a memóriát; nincs minden személyes ágat zároló Shared-tranzakció. Kontextus generálás rendezett érintett user-lockokkal működik, a queue-snapshot immutable; retry nem frissíti. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).
