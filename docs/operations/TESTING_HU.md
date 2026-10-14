---
status: canonical
owner: operations
last_reviewed: 2026-10-12
---

# Testing és quality gates

## Normál repository gate

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
```

Dokumentációs CI bevezetése után `pnpm docs:check` is kötelező dokumentációt érintő PR-ben.

## Verify workflow

A GitHub Verify pipeline a repository alap quality gate-je. Többek között ellenőrzi:

- frozen dependency installt;
- formázást;
- backup/source archive boundary-kat;
- root-only reader/security contractokat;
- TypeScript typechecket;
- automatizált teszteket;
- production buildet;
- closed-site production web buildet live credential nélkül;
- sémagenerálást és eltérést;
- container build/deployment/TLS határokat.

Merge csak a releváns kötelező ellenőrzések sikeres lefutása után.

## Célzott tesztek

Az alap suite nem helyettesíti a domain-specifikus próbát.

Külön ellenőrzés kell például:

- migration/schema változás;
- backup/recovery;
- Auth/privacy/writer fence;
- Shared concurrency/entitlement;
- AI routing/budget;
- deployment/TLS/secret boundary.

## Paid AI

CI alapértelmezésben nem költhet éles AI keretet. Valódi provider E2E csak explicit budgettel, dokumentált célból és megfelelő cleanup/receipt mellett engedett.

## Hibajavítási elv

Tesztet ne lazíts pusztán azért, hogy zöld legyen. Előbb döntsd el, hogy:

1. runtime bug;
2. hibás/elavult teszt;
3. megváltozott elfogadott contract;
4. környezeti/runner hiba.

Contract változásnál a kanonikus dokumentáció ugyanabban a PR-ben frissítendő.

## Személyes narratív baseline

`tests/narrative-baseline.test.ts`: nyolc kitalált profil, rögzített dátumok és stabil UUID-k; a valódi personal worker három feladata és a kanonikus döntés/folytatás három időszakon át, szolgáltatási hívás nélkül. A fixture-próza nem történetminőségi pass bizonyíték. A teljes fejlesztés acceptance és külön paid/humán benchmark gate-je: `../plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md`.

N01 célzott kör: narrative-memory, narrative-ai-context, life-ai, life-job-recovery, shared-privacy, life-api és life-persistence. A narrative-memory teszt valódi migrációkból épített PGlite adatbázison ellenőrzi a cohort/default-off utat, a megőrzött choice-t, prefix-forkot, withheld SQL olvasást, UTF-8 limitet és context checkpoint újrahasználatot. Szolgáltatási hívás helyett test transport/fixture provider.

N02: narrative-contracts és narrative-quality suite. Negative cases: idegen candidate/event/branch/option, scene időrend, actor introduction/provenance, Shared identity, thread deadline/reused ID, hamis editorial pass, hibás paragraph/event reference, artifact hash/receipt/delta eltérés. A két szólimit külön ellenőrzött; egy jó rövidebb narrative fejezet nem bukik a puha célhosszon. A generated narrative sémák új namespace-ben vannak, régi V2 diff nélkül.

N03: narrative-storage.test.ts ellenőrzi a null legacy periodot, kötelező/atomikus új mellékletet, stale payload és hamis receipt/fidelity/body elutasítását, own exportot, explicit web/public projekciót, RLS-t és immutable/cascade szabályt. A privacy restore proof mentésében új mellékletes periodok szerepelnek a törölt fiókhoz és élethez; replay után ezek hiánya külön ellenőrzött. Az új recovery baseline csak izolált migration mérésből frissül, éles adatbázison teszt nem fut.

N04: narrative-ai.test.ts a négy új task strict outputját, két locale és modellroutingját, a valódi projected request/receipt hash-t, untrusted szöveg- és inventoryhatárt, withheld/oversize stopot, budget denialt, transport retry számlázását és incomplete/schema-error kezelését ellenőrzi. Az editor csak a végső fejezetet és valódi one-based bekezdéseket kapja, nem írói önértékelést. A mock prose/score és a stub kulcs nem valódi API vagy minőségmérés.
