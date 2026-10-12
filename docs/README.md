# Alterward dokumentáció

Ez a könyvtár az Alterward aktív és történeti projekt-dokumentációját tartalmazza.

## Hol kezdjem?

Agent vagy fejlesztő esetén:

1. [`../AGENTS.md`](../AGENTS.md)
2. [`DOCS_INDEX_HU.md`](DOCS_INDEX_HU.md)
3. [`STATUS_HU.md`](STATUS_HU.md)
4. planning/implementation feladatnál [`DEVELOPMENT_PLAN_HU.md`](DEVELOPMENT_PLAN_HU.md)
5. a Docs Index által megjelölt témaspecifikus forrás

A dokumentációs szabályok: [`DOCUMENTATION_GOVERNANCE_HU.md`](DOCUMENTATION_GOVERNANCE_HU.md).

## Fő területek

- `DEVELOPMENT_PLAN_HU.md` — az eredeti P01–P13 + Shared S0–S7 kanonikus végrehajtási master planje
- `product/` — termék, scope, monetizáció
- `architecture/` — rendszerhatárok, adatfolyamok, AI és security
- `features/` — feature-specifikációk
- `operations/` — development, testing, deployment, beta, backup/recovery
- `decisions/` — ADR-ek
- `agents/` — agent task/handoff/review sablonok
- `contracts/` — gépi/emberi contract anyagok
- `examples/` — példák
- `archive/` — leváltott és történeti dokumentumok

A docs gyökérben maradhatnak régi reportok vagy supporting runbookok, de a fájlnév önmagában nem authority. Mindig a `DOCS_INDEX_HU.md` besorolása dönt.

## Alapelv

Egy témához lehetőleg egy kanonikus forrás tartozik. Lezárt auditok és reportok bizonyítékok, nem jelenlegi specifikációk. A teljes régi checkpoint/backlog történet az archívumban marad; az aktív végrehajtási státusz a `DEVELOPMENT_PLAN_HU.md`-ben él.
