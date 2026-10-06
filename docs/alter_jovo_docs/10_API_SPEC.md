# alterward — API specifikáció és tervezett bővítés

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · A tényleges controller: [apps/api/src/app.ts](../../apps/api/src/app.ts). OpenAPI helyben: `http://localhost:4000/api/openapi.json`. A tervezett végpontcsaládok még nem hívhatók.

## Meglévő v1

Base `/api/v1`, Bearer Supabase token; a controller összes alábbi végpontja hitelesített. `Accept-Language` jelenleg minden értéknél angol feliratot ad. Biztonságos hibakód/üzenet, requestId; nincs stack/prompt. A visszaadott DB-nézetekben jelenleg snake_case mezők is vannak, nem ígérünk általános camelCase DTO-t vagy kész generált klienst.

| Metódus/útvonal | Tényleges művelet |
|---|---|
| GET /me | Hitelesített belső fiókazonosító |
| POST /me/consent | `adult:true`, `acknowledged:true`, alpha-privacy-v1 elfogadás |
| GET /questionnaires/current | Angol kérdőív ugyanazon adatkulcsokkal, HU-fejléc mellett is |
| GET /profile | Saját draft/aktuális profil visszaolvasása |
| PATCH /profile/draft | Revisionnel válasz/kapcsolat mentése |
| POST /profile/draft/commit | Immutable profilverzió, kérésben revision |
| GET /futures | Saját életek |
| POST /futures | V1 tízéves élet + job, `Idempotency-Key` kötelező |
| GET /futures/:id | Saját élet és ágak |
| GET /jobs/:id | Saját job/status, lokalizált biztonságos hiba |
| GET /branches/:id | Saját branch, állapot, fejezetek/döntések nézete |
| GET /branches/:id/timeline | Saját canon és örökölt prefix |
| POST /decisions/:id/resolve | `type:"option"`, `optionId` → új gyermekág + job; `Idempotency-Key` kötelező |
| GET /me/export | Saját JSON-adatletöltés, friss tényleges hitelesítés |
| DELETE /me | Megerősített fióktörlés, friss hitelesítés, Auth-admin kulcs szükséges |

Külön `GET /health` technikai health. UI `/job/:id` és API `/api/v1/jobs/:id` eltérő útvonal.

## Érvényes create példa

```http
POST /api/v1/futures
Authorization: Bearer <session-token>
Idempotency-Key: example-life-create-001
Accept-Language: en
Content-Type: application/json

{
  "profileVersionId": "11111111-1111-4111-8111-111111111111",
  "horizonYears": 10,
  "mode": "baseline",
  "locale": "en"
}
```

Az UUID csak formai példa; létező saját committed profil kell. Új termék API-kérésben locale kizárólag `en`; régi tárolt `hu` a kompatibilitási szerződésben megmarad. Hiányzó locale új kérésnél angol. Tartalomnyelv az életre rögzül, gyermekág nem vehet át eltérő UI-nyelvet. Azonos idempotenciakulcs eltérő bemenettel 409; draftnál elavult revision szintén 409. A v1 resolve nem fogad szabad szöveges döntést.

## Meglévő v2

Base `/api/v2`; minden alábbi művelet Supabase-hitelesítést és tulajdonosi ellenőrzést kér.

| Metódus/útvonal | Tényleges művelet |
|---|---|
| GET /lives, POST /lives | Saját angol élet lista/létrehozás; create idempotenciakulccsal |
| GET /draft, PATCH /draft | Saját revisionös rövid onboarding-piszkozat |
| GET /branches/:id | Saját állapot, időszakok, fejezetek és döntések |
| POST /branches/:id/choice | Aktuális opció egyszeri alkalmazása |
| POST /branches/:id/continue | Következő időszak ugyanazon ágon |
| POST /branches/:id/periods/:periodId/fork | Saját történeti döntésből új ág |
| POST /jobs/:id/retry | Hibás saját v2 job folytatása |
| POST /interactions | Zárt allowlist mérési jel, szerveroldali session |
| POST /feedback | Privát általános/fejezetszintű feedback, idempotencia és napi limit |
| POST /branches/:id/public-preview | Tulajdonosi, lejáró snapshot-előnézet; `{revision, copy}` |
| GET /public-previews/:id | Saját privát előnézet; nincs anon olvasás |

Choice/continue/fork/retry revision- és idempotenciavédett; elavult kérés 409. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [feedback/session](../BETA_FEEDBACK_AND_METRICS_HU.md), [előnézet határa](../PUBLIC_DRAFT_FOUNDATION_HU.md). Export és fióktörlés továbbra `/api/v1/me` alatt kezeli mindkét verziót.

## Public műveletek — tervezett

P09–P12 anonim snapshot-olvasás, publish/Confirm, Save/Share/Report/moderation és public fork még nincs. A meglévő `public-preview` nevű végpont tulajdonosi privát előnézetet készít, és nem tesz nyilvánossá tartalmat.

Public olvasás csak snapshot, szükséges permission/moderation ellenőrzéssel; privát végpont nem nyitható meg. Unlisted külön tokenes hozzáférés. Save/új saját élet auth, curator/admin külön role. Mutációk revision/hash/idempotencia és limit; olvasás nem indít AI-jobot. Szabad szöveges döntés, profil-AI enrichment, kapcsolati CRUD, notification/follow/comment, külön chapter-generate és élet-DELETE végpont nincs a mai controllerben.

## Shared S0 API — alapból kikapcsolva

Social-profile GET/PUT, shared-contexts create/list/detail, meghívás/lista/POST-preview/accept/targeted-decline/revoke és leave/end/archive controller elkészült; a két alapflag false mellett 404. Szabályok és konkrét útvonalak: [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). Shared-jobs/continue/intent/shared-impacts és remove még tervezett. Auth + tagsági scope + saját branch + server entitlement + revision/idempotencia; ismert ID nem permission. Gépi SHARED_* / SUBSCRIPTION_REQUIRED hibák, angol felirat. S0 strict DTO és OpenAPI a kódból kész, token preview POST bodyban, cache no-store.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S1 implementációs kiegészítés

S1 GET context events, POST event intents/resolve és GET saját branch shared-impacts implementált a négy kikapcsolt flag mögött. Strict own option/revision/idempotencia, safe history/own response, nincs candidate/fixture-generátor HTTP-n.

## S2 implementációs kiegészítés

S2 új Auth/no-store útvonal: POST /api/v2/shared-contexts/:id/continue csak contextRevision+Idempotency-Key; GET /api/v2/shared-jobs/:id safe progress. Nincs candidate/fixture/tier DTO. Egy aktív job/context; initiating-user Shared cap 3/24h és 1 aktív. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

Személyes choose/continue meglévő endpointjai átvétel előtt validálják a kliensrevisiont, ugyanazon kérés új revisionnel enqueue-ol. Nincs külön kliens által beküldött memória/authority endpoint. Shared intent engedett előrehaladt saját ágnál is, az eredeti event effectiveAt alapján. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: P09 ScenarioVersion állapot

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Aktuális riport](../SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: P09 döntési checkpoint állapot

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális riport](../PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: P09 döntési előnézeti felület

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: P09 teljes tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.
