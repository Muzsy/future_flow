---
status: canonical
owner: documentation
last_reviewed: 2026-10-12
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
4. a feladathoz tartozó kanonikus forrás

## Kanonikus authority térkép

| Téma | Kanonikus forrás | Aktív supporting |
|---|---|---|
| dokumentáció | `DOCUMENTATION_GOVERNANCE_HU.md` | `agents/*` |
| aktuális állapot | `STATUS_HU.md` | kód + aktív runbookok |
| roadmap | `ROADMAP_HU.md` | Issue/PR backlog |
| termék | `product/PRODUCT_HU.md` | `V2_SIMULATION_CONTRACT_HU.md` |
| monetizáció | `product/MONETIZATION_HU.md` | entitlement code/contracts |
| architektúra | `architecture/ARCHITECTURE_HU.md` | package code/contracts |
| Shared | `features/shared/SHARED_CONTEXT_HU.md` | core/database/contracts/migration 037 |
| development/setup | `operations/DEVELOPMENT_HU.md` | `SETUP.md` részletes legacy runbook |
| testing/CI | `operations/TESTING_HU.md` | workflow + targeted test docs |
| deployment | `operations/DEPLOYMENT_HU.md` | `DEPLOYMENT_HU.md`, aktív Contabo/Cloudflare runbookok |
| beta | `operations/BETA_HU.md` | personal beta operator/reader/admission docs |
| backup | `operations/BACKUP_HU.md` | `CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md` és retention runbookok |
| recovery | `operations/RECOVERY_HU.md` | restore/privacy/writer-fence runbookok |
| security operations | `operations/SECURITY_OPERATIONS_HU.md` | privacy catalog, writer fence, monitor docs |
| AI routing | `AI_MODEL_ROUTING_HU.md` | `packages/ai`, budget docs; architecture consolidation később |

## Leváltott fő dokumentumok

Nem kanonikusak:

- `PRODUCT_PLAN_HU.md`, `PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md` → `product/PRODUCT_HU.md`;
- `IMPLEMENTATION.md` → `architecture/ARCHITECTURE_HU.md`;
- `NEXT_STEPS.md` → `ROADMAP_HU.md`;
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
- `contracts/` — részletes contract-anyagok
- `archive/` — történeti/leváltott dokumentumok

## Minimális kontextus

### Personal simulation / Scenario
`STATUS_HU.md` → `product/PRODUCT_HU.md` → `V2_SIMULATION_CONTRACT_HU.md` → kód/contract.

### Shared / monetizáció
`STATUS_HU.md` → `features/shared/SHARED_CONTEXT_HU.md` → `product/MONETIZATION_HU.md` → kód/migration.

### Development / CI
`operations/DEVELOPMENT_HU.md` → `operations/TESTING_HU.md` → task-specifikus contract.

### Deployment
`operations/DEPLOYMENT_HU.md` → konkrét aktív Contabo/Cloudflare runbook.

### Personal beta
`operations/BETA_HU.md` → `PERSONAL_BETA_OPERATOR_HU.md` és a konkrét reader/admission runbook.

### Backup/recovery
`operations/BACKUP_HU.md` → `operations/RECOVERY_HU.md` → konkrét active runbook.

### Security/privacy
`operations/SECURITY_OPERATIONS_HU.md` → releváns privacy catalog/writer-fence/recovery document → kód.

## Történeti státusz

Alapértelmezésben `historical`: `*_REPORT_HU.md`, lezárt audit, checkpoint, closure, phase report. Ezek proofként olvashatók, de kanonikus döntést nem írhatnak felül.

A dokumentum-státusz részletes szabálya: `DOCUMENTATION_GOVERNANCE_HU.md`.
