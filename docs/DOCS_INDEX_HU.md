---
status: canonical
owner: documentation
last_reviewed: 2026-10-27
related:
  - ../AGENTS.md
  - DOCUMENTATION_GOVERNANCE_HU.md
---

# Alterward dokumentumtérkép

Minden agent innen választja ki a feladathoz szükséges minimális kontextust.

## Kötelező alapkontextus

1. `../AGENTS.md`
2. `DOCS_INDEX_HU.md`
3. `STATUS_HU.md`
4. planning/implementation feladatnál a `DEVELOPMENT_PLAN_HU.md` releváns része
5. a feladathoz tartozó kanonikus forrás

## Kanonikus authority térkép

| Téma | Kanonikus forrás | Aktív supporting |
|---|---|---|
| dokumentáció | `DOCUMENTATION_GOVERNANCE_HU.md` | `agents/*`, `codex-prompts/*` |
| aktuális állapot | `STATUS_HU.md` | kód + aktív runbookok |
| magas szintű roadmap | `ROADMAP_HU.md` | Issue/PR backlog |
| részletes fejlesztési terv | `DEVELOPMENT_PLAN_HU.md` | Issue/PR backlog, történeti `archive/superseded/NEXT_STEPS.md` |
| termék | `product/PRODUCT_HU.md` | `V2_SIMULATION_CONTRACT_HU.md` |
| monetizáció | `product/MONETIZATION_HU.md` | entitlement code/contracts; `plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md` (nem aktivált javaslat) |
| architektúra | `architecture/ARCHITECTURE_HU.md` | package code/contracts |
| Shared | `features/shared/SHARED_CONTEXT_HU.md` | core/database/contracts/migration 037 |
| development/setup | `operations/DEVELOPMENT_HU.md` | `SETUP.md` részletes legacy runbook |
| testing/CI | `operations/TESTING_HU.md` | workflow + targeted test docs |
| deployment | `operations/DEPLOYMENT_HU.md` | `DEPLOYMENT_HU.md`, aktív Contabo/Cloudflare runbookok |
| beta | `operations/BETA_HU.md` | personal beta operator/reader/admission docs; `operations/LINUX_OPERATOR_HU.md` |
| backup | `operations/BACKUP_HU.md` | `CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md` és retention runbookok |
| recovery | `operations/RECOVERY_HU.md` | restore/privacy/writer-fence runbookok |
| security operations | `operations/SECURITY_OPERATIONS_HU.md` | privacy catalog, writer fence, monitor docs |
| személyes történetminőség | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md` | `plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md`; `plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`; `plans/alterward_fiction_human_quality_development_plan_codex.md`; `plans/045_fiction_v4_1_real_quality_iteration.md`; `plans/045_fiction_v6_earned_life_evolution.md`; `plans/046_fiction_v7_narrative_economy.md`; `plans/047_fiction_v8_series_evidence.md`; `plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md` (élő világ terv, a C függelék a tulajdonosi döntéseket rögzíti; [ADR-009](decisions/ADR-009-character-state-artifact-fold.md) elfogadva); `operations/NARRATIVE_EVALUATION_HU.md`; `operations/NARRATIVE_RELEASE_HU.md`; Issue #24 |
| AI routing | `AI_MODEL_ROUTING_HU.md` | `packages/ai`, budget docs; architecture consolidation később |

## Aktív történetminőségi munka

**Aktuális fókusz — 2026-10-24:** befagyasztott v9 C5 motor → technikai stabilizálás/integráció → N09 → kis zárt béta. Az editor/history további finomítása DEFERRED. Első kiadási olvasás: [bétafókuszú lezárás](operations/NARRATIVE_RELEASE_HU.md#bétafókusz-és-motorbefagyasztás--2026-10-24), majd a master plan.

Az aktív részletes végrehajtási terv a [master plan V9-1–V9-5 sora](DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23). A **v9 C5** a [#81](https://github.com/Muzsy/future_flow/pull/81) merge-dzsel a `main` része (`4fb7b489`, 2026-10-25); a motoralap `7bd4d42`. Az integráció és a későbbi operátori javítások saját review/CI-eredménye külön követett. A #88 utáni `adf2b95` saját main CI-je és tényleges célgépes image-fixture próbája 16/16 + cleanup PASS. A #90 engedélyezett Daily v4/friss backup/offsite/97-táblás izolált restore/monitor/aktiválás lánca PASS. A 2026-10-26 readonly DB/drain/Auth/runtime és Access felmérés után az éles exact036 séma miatti #92 javítás beolvadt (`6d17fda`), teljes review és saját main CI40251518673 SUCCESS. Új célgépes build és standalone próba 16/16 + cleanup PASS; a későbbi jóváhagyott éles recovery6d17fda/schema038 és a candidate mentése/restore-ja PASS. A #96 reviewed9088275 Daily-javítás engedélyezett éles lánca az új038 mentéssel/offsite/izolált restore-ral/monitorral/timeraktiválással és független readbackkel PASS; #95/#34 technikai kész, V9-4 DONE. A serving app6d17fda image-en fut, legacy/üres cohorttal; a Daily9088275 és a régi active-proof újrakiadási korlát külön dokumentált. Utána V9-5 tesztelői alapút. Production utolsó igazolt állapota legacy; az implementáció, review, mérés és élesítés külön státusz.

**2026-10-27 frissítés:** #105 reviewed `b31464a` → exact-tree main `66062ec`, saját main CI és új `3200b28e` célgépes image16/16+14/14/cleanup PASS,16:47 UTC friss normál monitor és külön runtime/timer readback PASS. Serving6d17fda/legacy/régi allowance és kliens/Daily03dc190 marad; saját3USD és teljes saját Playwright még nincs. Következő a konkrét éles saját fiókos csomag külön engedélye; a [release runbook aktuális szakasza](operations/NARRATIVE_RELEASE_HU.md#reader-javítás-main-és-új-célgépes-image--2026-10-27) írja le a proofokat és a végrehajtási határt. A korábbi bejegyzések történeti részkapuk.

Minimális kontextus: [STATUS](STATUS_HU.md) → [master plan](DEVELOPMENT_PLAN_HU.md) → [creative terv C5](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md#v9-első-változat-és-oksági-ismétlés--c5-2026-10-23). Szereplőállapot és elfogadott fázisok: [élő világ terv](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md), [ADR-009](decisions/ADR-009-character-state-artifact-fold.md). Modellalapú összehasonlítás: [mérési runbook C5](operations/NARRATIVE_EVALUATION_HU.md#c5-ellenőrzés-az-editoros-javítások-offline-elemzése-után--2026-10-23); kiadás: [release runbook](operations/NARRATIVE_RELEASE_HU.md).

A [045 v6](plans/045_fiction_v6_earned_life_evolution.md), [046 v7](plans/046_fiction_v7_narrative_economy.md) és [047 v8](plans/047_fiction_v8_series_evidence.md) verziótervek korábbi döntések és mérések bizonyítékai. Nem az aktuális feladatsorrend vagy új költési engedély forrásai. A v8 baseline továbbra befagyasztott regressziós alap.

## Leváltott fő dokumentumok

Nem kanonikusak:

- `PRODUCT_PLAN_HU.md`, `PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md` → `product/PRODUCT_HU.md`;
- `IMPLEMENTATION.md` → `architecture/ARCHITECTURE_HU.md`;
- `NEXT_STEPS.md` → `ROADMAP_HU.md` + `DEVELOPMENT_PLAN_HU.md`;
- a korábbi teljes `REQUIREMENTS_TRACEABILITY_HU.md` mátrix → `archive/superseded/REQUIREMENTS_TRACEABILITY_HU.md`; az aktív fájl csak traceability router;
- régi Shared terv/S0–S3/sponsored decision → `archive/shared/`;
- `SETUP.md` és gyökér `DEPLOYMENT_HU.md` részletes supporting/legacy runbook, nem dokumentációs belépési pont;
- `alter_jovo_docs/*` történeti v0.x anyag, nem authority.

## Könyvtárak

- `product/` — termék és monetizáció
- `architecture/` — rendszerhatárok, AI/security modellek
- `features/` — feature-specifikációk
- `operations/` — development, testing, deployment, beta, backup, recovery, security operations
- `decisions/` — ADR-ek
- `agents/` — task/handoff/review sablonok
- `codex-prompts/` — konkrét Codex work package promptok; active-supporting, nem kanonikus authority
- `contracts/` — részletes contract-anyagok
- `archive/` — történeti/leváltott dokumentumok

## Minimális kontextus

### Personal simulation / Scenario
`STATUS_HU.md` → `DEVELOPMENT_PLAN_HU.md` releváns P-pont → `product/PRODUCT_HU.md` → `V2_SIMULATION_CONTRACT_HU.md` → kód/contract.

### Shared / monetizáció
`STATUS_HU.md` → `DEVELOPMENT_PLAN_HU.md` releváns S-pont → `features/shared/SHARED_CONTEXT_HU.md` → `product/MONETIZATION_HU.md` → kód/migration.

### Development / CI
`operations/DEVELOPMENT_HU.md` → `operations/TESTING_HU.md` → task-specifikus contract.

### Deployment
`operations/DEPLOYMENT_HU.md` → konkrét aktív Contabo/Cloudflare runbook.

### Personal beta
`DEVELOPMENT_PLAN_HU.md` P08 → `operations/BETA_HU.md` → `PERSONAL_BETA_OPERATOR_HU.md` és a konkrét reader/admission runbook.

### Backup/recovery
`operations/BACKUP_HU.md` → `operations/RECOVERY_HU.md` → konkrét active runbook.

### Security/privacy
`operations/SECURITY_OPERATIONS_HU.md` → releváns privacy catalog/writer-fence/recovery document → kód.

### Codex implementation task
`AGENTS.md` → `DOCS_INDEX_HU.md` → `STATUS_HU.md` → releváns `DEVELOPMENT_PLAN_HU.md` rész + kanonikus spec → `codex-prompts/active/<task>.md` → tényleges kód/contract/tesztek.

## Történeti státusz

Alapértelmezésben `historical`: `*_REPORT_HU.md`, lezárt audit, checkpoint, closure, phase report. Ezek proofként olvashatók, de kanonikus döntést nem írhatnak felül.

A dokumentum-státusz részletes szabálya: `DOCUMENTATION_GOVERNANCE_HU.md`.

- [Linux active-funded runtime upgrade](operations/FUNDED_RUNTIME_UPGRADE_HU.md) — active-supporting; Issue #34, N09 implementáció és változatlan release kapuk.
