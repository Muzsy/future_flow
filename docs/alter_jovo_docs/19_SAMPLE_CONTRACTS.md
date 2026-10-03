# alterward — kontraktusok és érvényes minták


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A pontos JSON-sémák kódból exportáltak. Régi v0.1 példák nem mai DTO-k; az [archívumban](../archive/alter_jovo_v0_1/19_SAMPLE_CONTRACTS.md) maradnak.

## Kontraktuskatalógus

| Réteg | Sémák | Használat |
|---|---|---|
| Meglévő v1 | [profile](../contracts/profile.schema.json), [lifeState](../contracts/lifeState.schema.json), [simulationOutput](../contracts/simulationOutput.schema.json), [chapterOutput](../contracts/chapterOutput.schema.json), [fidelity](../contracts/fidelity.schema.json) | Mai worker/domain generálás és ellenőrzés |
| V2 2.0.0 | [lifeInput](../contracts/v2/lifeInput.schema.json), [lifeState](../contracts/v2/lifeState.schema.json), [periodCandidate](../contracts/v2/periodCandidate.schema.json), [constraint](../contracts/v2/constraint.schema.json) | Tárolás/API/worker és rövid privát élet integrált |
| API-request | [contracts index](../../packages/contracts/src/index.ts), helyi OpenAPI | V1 create/draft/option resolve; nem azonos az AI-output sémával |
| Public | P09–P12-ben külön snapshot/checkpoint/preview/publish/fork DTO | Még nincs exportált public séma vagy használható végpont |

## V1 create és választás

```json
{
  "profileVersionId": "11111111-1111-4111-8111-111111111111",
  "horizonYears": 10,
  "mode": "baseline",
  "locale": "en"
}
```

`POST /api/v1/futures`, saját létező profil + Bearer token + Idempotency-Key. UUID csak szintaktikai példa. Magyarhoz `locale:"hu"`; `hu-HU` nem elfogadott adatérték. A hiányzó locale új kérésnél `en`.

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

`pnpm schemas` a kontraktusforrást exportálja; CI driftet ellenőriz. Az [AI-fejezetminták](../examples/README.md) tényleges szintetikus generálások szövegei, nem sematikus request-példák. A schema nem garantál szemantikai/nyelvi minőséget vagy jogot; ownership, domain, fidelity és emberi kapu külön.
