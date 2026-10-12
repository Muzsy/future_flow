---
status: active-supporting
owner: documentation
last_reviewed: 2026-10-12
related:
  - DEVELOPMENT_PLAN_HU.md
  - DOCS_INDEX_HU.md
  - archive/superseded/REQUIREMENTS_TRACEABILITY_HU.md
---

# Alterward requirements traceability — aktív router

Ez a fájl már nem tartalmazza a teljes történeti követelménymátrixot. Az eredeti, teljes változat változatlanul megmarad itt:

- `archive/superseded/REQUIREMENTS_TRACEABILITY_HU.md`

## Aktív traceability szabály

- eredeti P01–P13 és Shared S0–S7 végrehajtási azonosítók → `DEVELOPMENT_PLAN_HU.md`;
- magas szintű sorrend és release-fázis → `ROADMAP_HU.md`;
- pillanatnyi állapot és aktív kockázat → `STATUS_HU.md`;
- termékcél és scope → `product/PRODUCT_HU.md`;
- Shared viselkedés/entitlement/privacy → `features/shared/SHARED_CONTEXT_HU.md`;
- monetizáció/billing → `product/MONETIZATION_HU.md`;
- technikai rendszerhatár → `architecture/ARCHITECTURE_HU.md`;
- deploy/beta/backup/recovery/security folyamat → `operations/` megfelelő kanonikus dokumentuma;
- tartós döntés → `decisions/ADR-*.md`;
- tényleges jelenlegi működés → kód, migrációk, contractok és tesztek.

## Történeti források szerepe

A régi pozicionálási, public/community és Shared requirements mátrixok továbbra is használhatók eredettörténet és elfogadott döntések visszakeresésére, de nem írhatják felül a jelenlegi kanonikus dokumentumokat.

Ha egy régi követelmény újra aktív fejlesztési feladattá válik, azt a `DEVELOPMENT_PLAN_HU.md` megfelelő pontjába vagy új workstreambe kell visszaemelni, majd a témaspecifikus kanonikus dokumentummal és Issue/PR-rel végrehajtani.
