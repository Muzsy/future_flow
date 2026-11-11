---
status: canonical
owner: product
last_reviewed: 2026-11-01
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

## P1 — Meghívásos személyes éles indulás

**Tulajdonosi döntés — 2026-11-01:** végleges működésű személyes éles szolgáltatást készítünk, eleinte 10 új meghívottal, majd további tízfős csoportokkal. A teljes ingyenes/fizetős működés az első csoport előtt készül el; a nyílt önregisztráció szerveroldalon zárt marad. További csoport hozzáadása ugyanazon alkalmazás rendes felhasználókezelése, új bétaablak vagy keretreset nélkül.

A v9 C5 motor befagyasztott. Meglévő alap: teljes saját fiókos történetút PASS, működő háromfős béta, schema039 és backup/restore bizonyítékok, implementált billing-mag, a #128/#130/#129 main-integrációja saját zöld CI-kkel. Az utóbbi integrációs alap `a7b5296`; a legutóbb megőrzött serving-proof továbbra `e8693158`/schema039, billing OFF. A két állapot nem azonos.

A sorrend: tartós meghívás/admission és üzemeltetési kikapcsolás → teljes fizetési/felhasználói út, USD-költségvédelem és végleges feltételek → pontos forrás rolloutja és mért E2E → első tíz → mérés alapján következő tíz. Az elfogadott ajánlat 1 ingyenes fejezet, normál 14,99 USD bruttó/8 fejezet; az első tíz kijelölt fióknak három ciklusig 9,99 USD bruttó/5 fejezet. Későbbi csoportnak nincs automatikus kupon.

Az alkalmazandó N08-minőségi, privacy/security, költség- és recovery-kapuk érvényesek. A fizetős scope-ra a korábbi béta-helyettesítés nem automatikus; új API-méréshez külön számszerű engedély kell. A motor további finomítása és az archetípus-fejlesztés DEFERRED. A régi béta története és ledgerje változatlanul megőrzendő, átvezetése külön végrehajtási lépés.

Részletes munkacsomagok és acceptance: [master plan I01–I07](DEVELOPMENT_PLAN_HU.md#23-meghívásos-éles-indulás-munkacsomagjai--2026-11-01), P08 és B01. A nyílt önregisztráció később ugyanennek a szolgáltatásnak a hozzáférés-bővítése; nem Community/Shared aktiválás.

## P2 — Shared friend beta — a személyes indulás után

Cél: valós kétfős/baráti interakció tesztje, első körben öt baráti pár, legfeljebb 10 személy.

Belépési feltételek:

- P1 tapasztalatok értékelve;
- Shared privacy/personal impact retention szabályok ellenőrizve;
- downgrade lifecycle döntés lezárva;
- sponsored Guest UX és targeted invite E2E ellenőrizve;
- költség- és rate-limit monitorozás aktív.

A Shared beta első terméktípusa `friend_group`.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` S3 + S7 sponsored Guest része + D01.

## P3 — Billing és személyes éles működés — P1 előfeltétele

Cél: a meglévő billing-alapot teljes személyes éles előfizetési szolgáltatássá integrálni. Ez a P1 előfeltétele, nem a Shared beta után következő munka.

A provider/fejezetmodell, SQL tároló, Checkout/webhook és generálási kapu alapja kész; a következő feladatok a felhasználói bekötés, minden elérhető generálás kapuzása, lemondás/visszatérítés, tartós konfigurációkezelés/kikapcsolás, élő Stripe/feltételek és a teljes mért út. A személyes árak elfogadottak; gazdaságossági feltevések továbbra méréssel ellenőrizendők. A billing az olvasást és az adatkontrollt nem teszi fizetési túszzá. A Shared tier és slot nem személyes fejezetkvóta.

Részletes végrehajtás: `DEVELOPMENT_PLAN_HU.md` B01 és I01–I06; termékszabály: [MONETIZATION_HU](product/MONETIZATION_HU.md).

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
