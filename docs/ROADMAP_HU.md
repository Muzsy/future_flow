---
status: canonical
owner: product
last_reviewed: 2026-10-12
related:
  - STATUS_HU.md
  - product/PRODUCT_HU.md
---

# Alterward roadmap

A roadmap jövőbeli prioritásokat és sorrendet rögzít. A jelenlegi állapotot a `STATUS_HU.md` írja le.

## P0 — Documentation governance és canonicalization

Cél: több AI agent párhuzamos munkája determinisztikus source-of-truth mellett.

Definition of Done:

- root `AGENTS.md`;
- docs router és governance;
- rövid kanonikus STATUS/ROADMAP/PRODUCT/ARCHITECTURE;
- Shared + monetization konszolidáció;
- operations konszolidáció;
- ADR/archive rendezés;
- dokumentációs CI.

## P1 — Personal beta activation

Cél: a már előkészített személyes angol béta tényleges elindítása legfeljebb 10 résztvevővel.

Gate-ek:

- végleges tesztelőlista;
- meghívás és Auth/reader mapping;
- candidate backup + ellenőrzött restore;
- személyes AI budget/window egyszeri aktiválása;
- bejelentkezett valós AI E2E;
- monitorozás és operátori rollback kész.

Shared minden flagje ebben a körben maradjon kikapcsolva.

## P2 — Shared friend beta

Cél: valós kétfős/baráti interakció tesztje, első körben öt baráti pár, legfeljebb 10 személy.

Belépési feltételek:

- P1 tapasztalatok értékelve;
- Shared privacy/personal prose retention szabályok ellenőrizve;
- downgrade lifecycle döntés lezárva;
- sponsored Guest UX és targeted invite E2E ellenőrizve;
- költség- és rate-limit monitorozás aktív.

A Shared beta első terméktípusa `friend_group`.

## P3 — Billing foundation

Cél: a meglévő entitlement modell mögé tényleges fizetési lifecycle.

Scope:

- payment provider döntés;
- checkout;
- subscription state/webhook;
- entitlement szinkron;
- upgrade/downgrade/cancel/grace szabályok;
- failure/retry/idempotency;
- invoice/tax/legal integrációs határok;
- billing és AI költségtelemetria.

A billing nem módosíthatja csendben a privacy/data-control jogokat.

## P4 — Shared relationship expansion

A friend beta után, mérési adatok alapján:

- romantic relationship;
- work project;
- hobby group;
- sports team.

A domainben meglévő típusok release-e külön termékdöntés. A séma létezése nem jelent automatikus termékaktiválást.

## P5 — Community/public release expansion

A már meglévő publication/discovery/fork/curation/moderation infrastruktúra publikus termékbe vezetése csak külön release-gate után.

Fókusz:

- privacy és publikálási consent;
- moderation/abuse;
- Discovery minőség;
- fork attribution/provenance;
- public/private állapot egyértelműsége;
- valós retention és engagement mérés.

## P6 — Scale és platform expansion

Csak valós termékhasználat után:

- nagyobb Official/Scenario katalógus;
- további nyelvek;
- mobil kliens ugyanarra az API/domain alapra;
- kifinomultabb agent/tooling csak igazolt igény esetén.

## Nem aktuális infrastruktúra-cél

Jelenleg nem prioritás:

- vector DB alapú projektmemória;
- külön agent orchestrator;
- RAG a saját repository dokumentációjára;
- MCP-alapú központi projektmemória.

Előbb a Git repository kanonikus tudásrétegét kell stabilan használni.
