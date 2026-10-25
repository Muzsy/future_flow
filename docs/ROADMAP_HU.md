---
status: canonical
owner: product
last_reviewed: 2026-10-25
related:
  - STATUS_HU.md
  - DEVELOPMENT_PLAN_HU.md
  - product/PRODUCT_HU.md
---

# Alterward roadmap

A roadmap jövőbeli prioritásokat és sorrendet rögzít. A jelenlegi állapotot a `STATUS_HU.md`, a részletes végrehajtási állapotot a `DEVELOPMENT_PLAN_HU.md` írja le.

## P0 — Documentation governance és canonicalization — DONE

Cél: több AI agent párhuzamos munkája determinisztikus source-of-truth mellett.

Elkészült:

- root `AGENTS.md`;
- docs router és governance;
- kanonikus STATUS/ROADMAP/PRODUCT/ARCHITECTURE;
- Shared + monetization konszolidáció;
- operations konszolidáció;
- ADR/archive rendezés;
- dokumentációs CI;
- az eredeti P01–P13 + Shared S0–S7 részletes terv kanonikus migrációja `DEVELOPMENT_PLAN_HU.md`-be.

## P1 — Personal beta értékelés és történetminőség

Az első személyes tesztelő aktiválása, a 30 napos ablak és háromfejezetes paid E2E megtörtént. A 2026-10-24-i tulajdonosi prioritás a v9 motor befagyasztása, technikai stabilizálása és a kis zárt béta kiadása; a történetminőség további javítását a valós olvasói visszajelzés irányítja. A legfeljebb 10 fős korlát megmarad; bővítés nem automatikus.

Az elfogadott 2026-10-20-i prioritás szerint az élő világ **v9 fejlesztése a következő zárt narratív béta elé kerül**. A C5 review és mérési checkpoint elkészült. A 2026-10-24-i döntéssel a közeli sorrend: motorbefagyasztás → PR-integráció és kiadást akadályozó technikai hibák javítása → v9-kompatibilis N09 üzemeltetés és tesztelői E2E → kis zárt béta. További editor-/history-kalibráció, új promptfinomítás és archetípus-fejlesztés DEFERRED; ezek nem új béta-előfeltételek. A részletes státuszokat és teljesülési feltételeket a [master plan V9-1–V9-5](DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23) tartja nyilván.

A PR-integráció 2026-10-25-én a [#81](https://github.com/Muzsy/future_flow/pull/81) merge-dzsel megtörtént (`4fb7b489`), a C5 alkalmazáskód változatlan. A teljes source-review APPROVE; a main saját CI-je külön követett. A közvetlen feladat a célgépes N09 bizonyíték és a tesztelői használati út előkészítése.

Nyitott kapuk:

- érdemi döntéskövetkezmény és alternatív ág; teljes N08 paid/human benchmark nyilvános/fizetős kiadás előtt, zárt bétára az elfogadott [helyettesítő kapurend](operations/NARRATIVE_RELEASE_HU.md#zárt-narratív-béta-kapurend--tulajdonosi-döntés-2026-10-19);
- N09 Linux funded-runtime upgrade (Issue #34), audit/CI/recovery és kontrollált target/apply;
- későbbi sessionből sikeres folytatás, olvasói feedback és retention;
- további résztvevő pontos Auth/reader admissionje, új candidate-hoz kötött backup/restore;
- eredeti budget/window és monitor/rollback megőrzése; nincs újraaktiválás vagy ledger-reset.

Shared minden flagje ebben a körben maradjon kikapcsolva.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` V9-1–V9-5, N08/N09 és P08.

## P2 — Shared friend beta

Cél: valós kétfős/baráti interakció tesztje, első körben öt baráti pár, legfeljebb 10 személy.

Belépési feltételek:

- P1 tapasztalatok értékelve;
- Shared privacy/personal impact retention szabályok ellenőrizve;
- downgrade lifecycle döntés lezárva;
- sponsored Guest UX és targeted invite E2E ellenőrizve;
- költség- és rate-limit monitorozás aktív.

A Shared beta első terméktípusa `friend_group`.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` S3 + S7 sponsored Guest része + D01.

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

A billing nem módosíthatja csendben a privacy/data-control jogokat. A [személyes gazdaságossági javaslat](plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) elkészült; fejezetmennyiségei/árai még nem elfogadott szabályok. Előbb minőség és használat/költség/fizetési hajlandóság mérendő, utána külön csomagdöntés és termékegyenleg/billing fejlesztés. Shared tier enum és slot nem személyes havi fejezetkvóta.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` B01.

## P4 — Shared relationship expansion

A friend beta után, mérési adatok alapján:

- romantic relationship;
- work project;
- hobby group;
- sports team.

A domainben meglévő típusok release-e külön termékdöntés. A séma létezése nem jelent automatikus termékaktiválást.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` S4–S6.

## P5 — Community/public release expansion

A már meglévő publication/discovery/fork/curation/moderation infrastruktúra publikus termékbe vezetése csak külön release-gate után.

Fókusz:

- privacy és publikálási consent;
- moderation/abuse;
- Discovery minőség;
- fork attribution/provenance;
- public/private állapot egyértelműsége;
- valós retention és engagement mérés.

A P09–P12 technikai foundation jelentős része már elkészült; a publikus launchot a P13 gate kezeli.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` P09–P13.

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
