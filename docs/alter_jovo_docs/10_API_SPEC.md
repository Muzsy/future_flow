# alterward — API specifikáció és tervezett bővítés

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

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
