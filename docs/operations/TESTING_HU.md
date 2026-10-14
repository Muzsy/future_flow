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
