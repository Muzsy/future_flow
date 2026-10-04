# alterward — API specifikáció és tervezett bővítés


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A tényleges controller: [apps/api/src/app.ts](../../apps/api/src/app.ts). OpenAPI helyben: `http://localhost:4000/api/openapi.json`. A tervezett végpontcsaládok még nem hívhatók.

## Meglévő v1

Base `/api/v1`, Bearer Supabase token; a controller összes alábbi végpontja hitelesített. `Accept-Language` választott felületnyelv, alap angol. Biztonságos hibakód/üzenet, requestId; nincs stack/prompt. A visszaadott DB-nézetekben jelenleg snake_case mezők is vannak, nem ígérünk általános camelCase DTO-t vagy kész generált klienst.

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

## V2/public tervezett műveletek

P01–P03 /api/v2 végpontok és DTO-k elkészültek: [aktuális v2 API](../V2_IMPLEMENTATION_REPORT_HU.md). P09–P12 public olvasás/preview/Confirm/Save/Report/moderation/fork még tervezett.

Public olvasás csak snapshot, szükséges permission/moderation ellenőrzéssel; privát végpont nem nyitható meg. Unlisted külön tokenes hozzáférés. Save/új saját élet auth, curator/admin külön role. Mutációk revision/hash/idempotencia és limit; olvasás nem indít AI-jobot. Szabad szöveges döntés, profil-AI enrichment, kapcsolati CRUD, notification/follow/comment, külön chapter-generate és élet-DELETE végpont nincs a mai controllerben.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
