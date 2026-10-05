# alterward — kontraktusok és érvényes minták

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-05 · A pontos JSON-sémák kódból exportáltak. Régi v0.1 példák nem mai DTO-k; az [archívumban](../archive/alter_jovo_v0_1/19_SAMPLE_CONTRACTS.md) maradnak.

## Kontraktuskatalógus

| Réteg | Sémák | Használat |
|---|---|---|
| Meglévő v1 | [profile](../contracts/profile.schema.json), [lifeState](../contracts/lifeState.schema.json), [simulationOutput](../contracts/simulationOutput.schema.json), [chapterOutput](../contracts/chapterOutput.schema.json), [fidelity](../contracts/fidelity.schema.json) | Mai worker/domain generálás és ellenőrzés |
| V2 2.0.0 | [lifeInput](../contracts/v2/lifeInput.schema.json), [lifeState](../contracts/v2/lifeState.schema.json), [periodCandidate](../contracts/v2/periodCandidate.schema.json), [constraint](../contracts/v2/constraint.schema.json) | Tárolás/API/worker és rövid privát élet integrált |
| API-request | [contracts index](../../packages/contracts/src/index.ts), [v2 create](../contracts/v2/lifeCreateRequest.schema.json), [draft](../contracts/v2/lifeDraftRequest.schema.json), [continue](../contracts/v2/lifeContinueRequest.schema.json), [feedback](../contracts/v2/betaFeedback.schema.json), helyi OpenAPI | V1/v2 request; nem azonos az AI-output sémával |
| Privát előnézet | [snapshotDraft](../contracts/public/snapshotDraft.schema.json), [previewCopy](../contracts/public/previewCopy.schema.json) | Tulajdonosi POST/GET előnézet kész; nincs anon olvasás/publish/fork |
| Public — terv | Külön futtatható checkpoint/publish/fork DTO | P09–P12 további munka |

## V1 create és választás

```json
{
  "profileVersionId": "11111111-1111-4111-8111-111111111111",
  "horizonYears": 10,
  "mode": "baseline",
  "locale": "en"
}
```

`POST /api/v1/futures`, saját létező profil + Bearer token + Idempotency-Key. UUID csak szintaktikai példa. Új termékélet kizárólag `locale:"en"`; explicit `hu` 422. A tárolt szerződés a régi magyar adatot továbbra olvassa, a saját export teljes. A hiányzó locale új kérésnél `en`.

```json
{
  "type": "option",
  "optionId": "22222222-2222-4222-8222-222222222222"
}
```

`POST /api/v1/decisions/:id/resolve`, tényleges saját döntés opciója kell, új gyermekágat indít. Nincs v1 `type:freeform` vagy same-branch folytatás. [API részletek](10_API_SPEC.md).

## V2 használati szabály

Life input explicit locale, saját/alternatív identitás, környezet, fő cél, tényállapot, korlát és kizárólag `private`. A period hat/tizenkét hónap, 2–5 esemény, utolsó esemény végén egy nyitott döntés; state revision és branch egyezés. Opció javaslat, a periodvalidator nem választ. Unknown `null`, stabil ID/ref; schema után domain validálás szükséges.

Tervezett public checkpoint nem a `lifeStateV2Schema` közvetlen kiadása. Mező-allowlist, PII általánosítás, public azonosítók és új tulajdonosi import kell; nem lehet privát profile/world/memory FK. Dokumentált koncepció nem érvényes kész requestbody.

## Példák eredete és generálása

`pnpm schemas` a kontraktusforrást exportálja; CI driftet ellenőriz. Az [AI-fejezetminták](../examples/README.md) tényleges szintetikus generálások szövegei, nem sematikus request-példák. A schema nem garantál szemantikai/nyelvi minőséget vagy jogot; ownership, domain és fidelity külön kötelező; angol AI szerkesztői ellenőrzés indulás előtt, használói minőségmérés kiadás után.

## Shared S0 exportált szerződés és későbbi adapterek

A változatlan forrás blueprintje javaslat; a packages/contracts/shared-context.ts S0 kódja és 11 JSON-sémája már exportált a docs/contracts/shared könyvtárba. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). Külön Shared 1.0.0 contract, typed policy/state/candidate/intent/impact, Life v2 2.0.0 megőrzése. Opcionális memory.sharedEvents csak jogosult alkalmazott canonprojekció; régi job mező nélkül valid. A személyes memory.sharedEvents és intent/resolution végrehajtás S1/S3; az új shared sémák pnpm schemas-szal készülnek, a 18 meglévő JSON-séma nem változott.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S1 implementációs kiegészítés

S1 hat új exported JSON-séma: decisionRules, decisionEnvelope, intentRequest, intent, resolutionResult, memoryImpact. A korábbi 29 és Life v2 2.0.0 byte szerint változatlan; own pending memory még nem Life period-input. [S1 riport](../SHARED_CONTEXT_S1_REPORT_HU.md).

## S2 implementációs kiegészítés

S2 két additív JSON-séma: shared/aiInput és shared/aiCandidate; összesen 37. A friend AI-kimenetből a future weighted-vote dinamikus map kimarad; az általános Shared 1.0.0 és Life 2.0.0 megmarad. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

S3 két additív séma: shared/personalMemory és shared/personalMemories; összesen 39. Az opcionális LifePeriodInput memory.sharedEvents TS-bővítés, LifeStateV2 és régi sémák változatlanok. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
