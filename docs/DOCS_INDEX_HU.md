---
status: canonical
owner: documentation
last_reviewed: 2026-10-12
related:
  - ../AGENTS.md
  - DOCUMENTATION_GOVERNANCE_HU.md
---

# Alterward dokumentumtérkép

Ez a fájl a repository dokumentációs routere. Ha nem tudod, mit kell elolvasnod egy feladathoz, innen indulj.

## 1. Kötelező alapkontextus

Minden agent:

1. `../AGENTS.md`
2. `DOCS_INDEX_HU.md`
3. `STATUS_HU.md`
4. az alábbi táblából a feladathoz tartozó kanonikus vagy átmeneti forrás

A teljes `docs/` fa automatikus beolvasása nem szükséges és nem ajánlott.

## 2. Authority térkép – jelenlegi átmeneti állapot

A dokumentáció konszolidációja több PR-ben történik. Amíg az új kanonikus fájlok elkészülnek, az alábbi útvonalak érvényesek.

| Téma | Elsődleges forrás most | Státusz | Célállapot |
|---|---|---|---|
| dokumentációs működés | `DOCUMENTATION_GOVERNANCE_HU.md` | canonical | változatlan |
| projekt aktuális állapota | `STATUS_HU.md` | transitional | rövid kanonikus STATUS |
| termékcél és scope | `PRODUCT_PLAN_HU.md` + `PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md` | transitional | `product/PRODUCT_HU.md` |
| jövőbeli prioritás | `NEXT_STEPS.md` | transitional | `ROADMAP_HU.md` |
| rendszerarchitektúra | `IMPLEMENTATION.md` és releváns kód | transitional | `architecture/ARCHITECTURE_HU.md` |
| szimulációs contract | `V2_SIMULATION_CONTRACT_HU.md` | active-supporting | feature/architecture canonicalba bekötve |
| AI routing | `AI_MODEL_ROUTING_HU.md` | active-supporting | `architecture/AI_PIPELINE_HU.md` felől hivatkozva |
| Shared Context | `SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md` + kód | transitional | `features/shared/SHARED_CONTEXT_HU.md` |
| sponsored Guest | `SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md` + kód/migration 037 | active-supporting | Shared + monetization canonicalba összevonva |
| monetizáció | Shared entitlement dokumentumok + kód | transitional | `product/MONETIZATION_HU.md` |
| deployment | `DEPLOYMENT_HU.md` | active-supporting | `operations/DEPLOYMENT_HU.md` router/runbook |
| personal beta | `PERSONAL_BETA_ACTIVATION_PLAN_HU.md`, `PERSONAL_BETA_OPERATOR_HU.md` | active-supporting | `operations/BETA_HU.md` |
| backup/restore | `CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md` és recovery runbookok | active-supporting | `operations/BACKUP_HU.md` + `operations/RECOVERY_HU.md` |
| privacy/security | privacy guard/catalog + kód | active-supporting | `architecture/SECURITY_MODEL_HU.md` + operations |
| setup/development | `SETUP.md` | active-supporting | `operations/DEVELOPMENT_HU.md` |
| történeti auditok/reportok | `*_REPORT*`, `audits/`, dátumozott checkpointok | historical | `archive/` alatt |
| v0.1 Alter jövő dokumentumcsomag | `alter_jovo_docs/` | historical/transitional | `archive/alter_jovo_v0_1/` |

A `transitional` fájlba új tartós döntést csak akkor írj, ha az adott PR-ben még nincs kanonikus célfájl. Ha létrejött a célfájl, az indexet azonnal át kell állítani rá.

## 3. Dokumentációs könyvtárak

### `product/`

Termékdefiníció, scope, monetizáció, privacy termékszabályok és béta-scope. Lásd `product/README.md`.

### `architecture/`

Rendszerarchitektúra, adatmodell, AI pipeline, security model. Lásd `architecture/README.md`.

### `features/`

Feature-specifikációk. Lásd `features/README.md`.

### `operations/`

Fejlesztési, tesztelési, deployment-, béta-, backup- és recovery runbookok. Lásd `operations/README.md`.

### `decisions/`

Tartós ADR-ek. Lásd `decisions/README.md`.

### `agents/`

Agent task/handoff/review sablonok.

### `archive/`

Leváltott, lezárt vagy történeti dokumentumok. Nem source of truth.

## 4. Történeti dokumentumok kezelése

A jelenlegi docs gyökérben sok lezárt report, audit és checkpoint található. Ezek a konszolidáció végéig a helyükön maradhatnak, de státuszuk történeti akkor is, ha nincs még fizikailag `archive/` alatt.

Különösen:

- `*_REPORT_HU.md` fájlok alapértelmezésben historical;
- dátumozott release/preflight/checkpoint dokumentumok historical;
- S0/S1/S2/S3 fázisriportok historical, ha a végső feature már létezik;
- closure dokumentumok historical;
- audit eredmény nem írhat felül későbbi kódot vagy kanonikus specifikációt.

Kivétel csak akkor van, ha az index explicit `active-supporting` státuszt ad egy fájlnak.

## 5. Minimális kontextus tipikus feladatokhoz

### Personal Life / Scenario

- `../AGENTS.md`
- `STATUS_HU.md`
- `V2_SIMULATION_CONTRACT_HU.md`
- a konkrét contract/kód

### Shared / entitlement

- `../AGENTS.md`
- `STATUS_HU.md`
- `SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md`
- `SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md`
- `packages/core/src/shared-context.ts` és érintett DB modul

### Deployment / recovery

- `../AGENTS.md`
- `STATUS_HU.md`
- `DEPLOYMENT_HU.md`
- a konkrét aktív runbook

### Dokumentáció módosítása

- `../AGENTS.md`
- `DOCUMENTATION_GOVERNANCE_HU.md`
- `DOCS_INDEX_HU.md`
- a módosítandó kanonikus dokumentum

## 6. Konszolidációs célfájlok

A dokumentáció-rendberakás során létrejövő elsődleges források:

- `ROADMAP_HU.md`
- `product/PRODUCT_HU.md`
- `product/MONETIZATION_HU.md`
- `architecture/ARCHITECTURE_HU.md`
- `architecture/AI_PIPELINE_HU.md`
- `architecture/SECURITY_MODEL_HU.md`
- `features/shared/SHARED_CONTEXT_HU.md`
- `operations/DEVELOPMENT_HU.md`
- `operations/TESTING_HU.md`
- `operations/DEPLOYMENT_HU.md`
- `operations/BETA_HU.md`
- `operations/BACKUP_HU.md`
- `operations/RECOVERY_HU.md`
- `decisions/ADR-*.md`

Ne hivatkozz még nem létező célfájlra kötelező runtime vagy operátori lépésként.
