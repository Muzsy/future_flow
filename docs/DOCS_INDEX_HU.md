---
status: canonical
owner: documentation
last_reviewed: 2026-10-12
related:
  - ../AGENTS.md
  - DOCUMENTATION_GOVERNANCE_HU.md
---

# Alterward dokumentumtérkép

Ez a repository dokumentációs routere. Minden agent innen választja ki a feladathoz szükséges minimális kontextust.

## Kötelező alapkontextus

1. `../AGENTS.md`
2. `DOCS_INDEX_HU.md`
3. `STATUS_HU.md`
4. a feladathoz tartozó kanonikus forrás

## Kanonikus authority térkép

| Téma | Kanonikus forrás | Támogató források |
|---|---|---|
| dokumentációs működés | `DOCUMENTATION_GOVERNANCE_HU.md` | `agents/*` |
| aktuális projektállapot | `STATUS_HU.md` | aktív runbookok és kód |
| jövőbeli prioritások | `ROADMAP_HU.md` | Issue/PR backlog |
| termékdefiníció | `product/PRODUCT_HU.md` | `V2_SIMULATION_CONTRACT_HU.md` |
| rendszerarchitektúra | `architecture/ARCHITECTURE_HU.md` | contractok, package code |
| Shared Context | átmenetileg `SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md` + kód | sponsored Guest doc, S-riportok; phase 3-ban kanonizálva |
| monetizáció | átmenetileg entitlement kód + `SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md` | phase 3-ban `product/MONETIZATION_HU.md` |
| AI routing | `AI_MODEL_ROUTING_HU.md` | `packages/ai`, budget docs |
| personal beta | `PERSONAL_BETA_ACTIVATION_PLAN_HU.md` + `PERSONAL_BETA_OPERATOR_HU.md` | phase 4-ban operations routerbe konszolidálva |
| deployment | `DEPLOYMENT_HU.md` | Contabo/Cloudflare aktív runbookok |
| backup/recovery | aktív backup/recovery runbookok | phase 4-ban operations routerbe konszolidálva |
| privacy/security | privacy/security guardok + kód | phase 4/5 kanonikus security/ADR réteg |

## Leváltott, de még nem archivált gyökérdokumentumok

A következő fájlok már **nem kanonikusak**, akkor sem, ha tartalmuk részben továbbra is hasznos:

- `PRODUCT_PLAN_HU.md` — leváltotta `product/PRODUCT_HU.md`;
- `PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md` — leváltotta `product/PRODUCT_HU.md`;
- `IMPLEMENTATION.md` — leváltotta `architecture/ARCHITECTURE_HU.md`;
- `NEXT_STEPS.md` — leváltotta `ROADMAP_HU.md`;
- `alter_jovo_docs/*` — történeti/átmeneti v0.x dokumentáció; nem írhatja felül a fenti kanonikus fájlokat.

Ezek fizikailag az archive-rendezési fázisban kerülnek végleges helyre.

## Könyvtárak

- `product/` — termék, scope, monetizáció
- `architecture/` — rendszerhatárok, adatfolyamok, AI/security modell
- `features/` — feature-specifikációk
- `operations/` — development/testing/deployment/beta/backup/recovery
- `decisions/` — ADR-ek
- `agents/` — task/handoff/review sablonok
- `contracts/` — részletes contract-anyagok
- `examples/` — példák
- `archive/` — leváltott/történeti dokumentumok

## Dokumentum-státusz szabály

- `canonical` — elsődleges source of truth;
- `active-supporting` — aktuális részletes kiegészítő/runbook;
- `transitional` — összevonásra vagy archiválásra vár;
- `historical` — lezárt audit/report/checkpoint;
- `archived` — csak történeti hivatkozás.

Részletes szabály: `DOCUMENTATION_GOVERNANCE_HU.md`.

## Minimális kontextus feladattípusonként

### Personal simulation / Scenario

- `STATUS_HU.md`
- `product/PRODUCT_HU.md`
- `V2_SIMULATION_CONTRACT_HU.md`
- konkrét contract/kód

### Shared / entitlement

- `STATUS_HU.md`
- Shared átmeneti elsődleges források a fenti táblából
- `packages/core/src/shared-context.ts`
- érintett database module/migration

### Deployment / recovery

- `STATUS_HU.md`
- `DEPLOYMENT_HU.md`
- a konkrét aktív runbook

### Dokumentáció/architektúra

- `DOCUMENTATION_GOVERNANCE_HU.md`
- `STATUS_HU.md`
- `architecture/ARCHITECTURE_HU.md`
- érintett ADR/spec

## Történeti fájlok

Alapértelmezésben historical:

- `*_REPORT_HU.md`;
- dátumozott preflight/checkpoint/closure fájlok;
- S0/S1/S2/S3 vagy más lezárt fázisriportok;
- audit outputok.

Ezek mérési vagy döntési kontextushoz olvashatók, de nem írhatják felül a kanonikus dokumentációt.
