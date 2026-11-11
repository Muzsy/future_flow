---
status: active-supporting
owner: agents
last_reviewed: 2026-10-15
related:
  - ../../AGENTS.md
  - ../DOCS_INDEX_HU.md
  - ../DEVELOPMENT_PLAN_HU.md
  - ../agents/TASK_TEMPLATE.md
  - ../agents/REVIEW_TEMPLATE.md
---

# Codex végrehajtási promptok

Ez a könyvtár az Alterward konkrét, végrehajtható Codex-feladatainak tartós helye.

A promptok **nem kanonikus source of truth-ok**. Nem írhatják felül a futó kódot, ADR-t, kanonikus specifikációt, `STATUS_HU.md`, `ROADMAP_HU.md` vagy `DEVELOPMENT_PLAN_HU.md` döntéseit. Feladatuk, hogy ezekből egy adott implementációs körre pontos, auditálható végrehajtási utasítást képezzenek.

## Könyvtárszerkezet

```text
docs/codex-prompts/
├── README.md
├── TEMPLATE.md
├── active/
│   └── <issue-or-task>_<short-name>.md
└── completed/
    └── <issue-or-task>_<short-name>.md
```

## Életciklus

1. A feladat előtt az aktuális `main` alapján új prompt készül az `active/` könyvtárban.
2. A prompt rögzíti a kiinduló commitot, authority-forrásokat, scope-ot, invariánsokat, acceptance criteria-t, teszteket és Git workflow-t.
3. A Codex külön branch-en dolgozik és PR-t nyit `main` ellen.
4. A PR-t GitHub alapján külön review követi.
5. Merge után a prompt a `completed/` könyvtárba kerülhet, és a lezárási metadata kiegészíthető a PR- és merge-adatokkal.

## Kötelező szabályok

- A Codex mindig először az `AGENTS.md` kötelező olvasási sorrendjét követi.
- A prompt csak a feladathoz szükséges minimális kanonikus kontextust nevezze meg.
- A promptban szereplő `base_commit` a készítéskori `main` HEAD; ha a `main` közben érdemben elmozdult, a Codex indulás előtt köteles újraértékelni a konfliktust.
- Közvetlen `main` commit tilos, kivéve explicit emberi utasításra.
- Egy prompt egy jól körülhatárolt work package legyen.
- Opportunista refactor, hallgatólagos üzleti döntés, security/privacy/budget/recovery lazítás tilos.
- Production mutation, paid API call, credential rotation vagy release aktiválás csak akkor megengedett, ha a prompt ezt explicit emberi authority alapján engedélyezi.
- Titok, token, személyes tesztelői adat vagy éles credential nem kerülhet promptba vagy commitba.

## Prompt státusz

Javasolt frontmatter:

```yaml
---
status: active-supporting
owner: agents
created: YYYY-MM-DD
base_commit: <main SHA>
issue: <number-or-null>
workstream: <P08|N09|S3|B01|...>
state: active
---
```

Lezárás után:

```yaml
state: completed
pr: <number>
merge_commit: <sha>
review_result: approved
```

A lezárási metadata történeti traceability, nem termékállapot-authority.

## Ajánlott elnevezés

Issue esetén:

`034_linux_funded_runtime_upgrade.md`

Issue nélküli work package esetén:

`B01_stripe_billing_foundation.md`

A fájlnév legyen stabil; lezáráskor ugyanaz a név kerüljön a `completed/` alá.

## Review contract

A Codex PR-ja csak implementációs jelölt. A review során ellenőrizni kell legalább:

- scope és acceptance criteria teljesülése;
- diff és érintett fájlok;
- regressziók és invariánsok;
- security/privacy/budget/recovery határok;
- dokumentációs konzisztencia;
- teszt- és CI-bizonyíték;
- scope creep vagy nem engedélyezett production hatás.

A review eredménye legyen egyértelmű: `APPROVE`, `CHANGES REQUIRED` vagy `REJECT`.
