# alterward — tesztelés és minőség

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-05 · [Ellenőrzött állapot](../STATUS_HU.md) · [AI-próba](../AI_VALIDATION.md) · [Nyelvek](../LOCALIZATION_HU.md).

## Meglévő bizonyíték és határ

159 automatizált teszt sikeres, benne hat angol kiadási/költségstop és további hat feedback/session regresszió és 20 determinisztikus eset ×3 időszak; négy valódi EN/HU Sol/Luna lánc ×3 időszak. [Aktuális bizonyíték és korlát](../V2_IMPLEMENTATION_REPORT_HU.md). Valódi Auth/UI/export/törlés és kontrollált recovery sikeres, a backup/restore és éles ops még nyitott; angol szerkesztői döntés AI-ra bízva, használói minőség kiadás után mérendő.

## Kötelező technikai invariánsok

- Canon múlt és profilpillanatkép változatlan; nem létező szereplő/esemény/cél/asset nincs.
- Rendezett idő, ág/revision egyezés, nincs választás utáni történet függő döntésnél.
- Tényleges munka/tulajdon/hely/pénz változás és aktív hard korlát; unknown nem hamis tény.
- Egyszeri választás/job/commit, dupla kérés, restart/lease-vesztés és concurrent revision védelem.
- Saját/másik felhasználó/token nélküli hozzáférés, RLS, friss auth export/törlés, törlés közbeni worker-visszaírás tiltása.
- Locale kompatibilitás, katalóguskulcs/interpoláció/kérdőív egyezés, immutable életnyelv, EN/HU AI-hivatkozások és régi HU job.
- Kérési foglalás, kvóta nem retryolódik, ismeretlen fogyasztás nem tűnik el, hibaköltség elszámolt.

## P07 generatív és angol szerkesztői ellenőrzés

20 determinisztikus eset három egymást követő perioddal és eltérő választásokkal kész. Négy valódi EN/HU lánc és az új angol béta-minta auditált; a húsz generatív eset további lefedettségi cél, a megmaradt keret szerint. Domain/jogosultság/adatkezelés minden esetben sikeres. Indulás előtt AI angol szerkesztői ellenőrzés; kiadás után használói értékelés: személyesség, hihetőség, következetesség, érdeklődés, érthetőség és folytatási vágy; külön ismétlés/általánosság/jóslásérzet/új tartós tény. Fix szövegegyezés helyett canon és hibakategória.

Modell/prompt/routing csere azonos state/cél mellett teljes láncot mér: cost/accepted period, idő, invalid/repair/fallback, checker téves elfogadás/riasztás, nyelvi minőség. Az AI-ellenőr nem arany igazságforrás. Paid esetek fokozatosan, foglalással; 20 eset nem engedi túllépni a külön OpenAI/Claude 5–5 USD kereteket. Valós felhasználói export nem tesztfixture.

## P13 public kapu

Private/unlisted/public anon/owner/other/moderator mátrix, tokenváltás, lejárt/módosított preview és explicit hash-Confirm; harmadik személy PII; eredetbadge; dupla Save/Publish/Fork; revoke közbeni olvasás/fork; cache/OG/sitemap törlés; raw private DTO/checkpoint szivárgás; report-visszaélés; export/törlés és forrásattribution; public döntési checkpoint egyszeri választása. Nyilvános fork első három saját időszaka is ellenőrizendő. Olvasás/nyelvváltás/Save/Share nem növeli OpenAI-hívásszámot.

## Release és pilot

P06 valós integrációs HTTP/böngészős próba és kontrollált recovery kész; teljes restore/valós DB-kiesés/éles ops még nyitott; P07 technikai/nyelvi minőség; P08 korlátozott éles angol béta és későbbi 20–50 használó célkohorsz; P13 teljes public gate. Auth/privacy/adatvesztés/canon corruption release blocker, átlagos 18/20 élmény nem mentesít. Retenciós cél a következő értékelt kohorsz előtt rögzítendő. Teljesítmény/terhelés/backup-restore/riasztás külön mért indulási feladat, nem már teljesített SLA.

Claude külső audit: [bizonyíték és hibás gépi riasztások](../examples/CLAUDE_EXTERNAL_AUDIT_HU.md). Ismert kontrollhibák mellett az auditor idézet/verdikt megbízhatósága is mérendő. A fő történetek külső kánonellenőrzése sikeres, emberi minőség még nyitott. Nyolc új fizetés nélküli transport/budget/audit-validátor teszt.

A teljes izolált Linux CI web/API/worker/Caddy futáspróbája, 001–007 és ismételt migráció, verified DB TLS/HTTPS, API 401 és üres queue-leállítás sikeres. Aktív generálási job drain, Contabo-élesítés és terhelésmérés nincs ezzel igazolva. [CI és ellenőrzési határok](../CONTABO_PREPARATION_REPORT_HU.md).

## Shared tesztmátrix — S0 regressziók és további kapuk

Új esetek: tier/type/slot/taglimit, last-slot/romantic két párhuzamos accept, invite expiry/reuse/recipient/block, outsider privacy, own intent/authority, policy tie/quorum, time mismatch/backdated, duplicate event/intent/impact, lease/restart/repair, fair queue, fork tagság nélkül, háromtagú deletion/recovery, húsz párhuzamos sport-intent. Friend DoD valódi AI és saját következő period, nem csak fixture. A korábbi 159 mellé 36 S0 regresszió: profile/privacy/entitlement, tokenhash/idempotencia, cap/time/revision, RLS/canon és export/deletion/recovery/admin-handover, valamint HTTP/OpenAPI/flag határok. PGlite célzott tesztek sikeresek; a valódi PostgreSQL utolsó slot/tag és ötcontextes deletion race CI-ben külön fut. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). S2–S6 további AI/impact/queue és romantikus API-concurrency elfogadásai még nyitottak.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S1 implementációs kiegészítés

S1 19 domain +12 persistence +5 HTTP új regresszió. Teljes készlet 231; konkrét local/main CI és valós PostgreSQL concurrency bizonyíték az S1 riportban. A korábbi 195 az S0 slice történeti száma.

## S2 implementációs kiegészítés

S2: 29 új regresszióval 260 teszt/23 fájl; teljes check és két valós Sol/PGlite Shared pipeline sikeres. CI-ben valós PG párhuzamos enqueue/claim és lease-reclaim próba bővítve; pontos main CI a S2 riportban. 35 korábbi schema és kilenc alkalmazott SQL változatlan, két új schema. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

S3 késői resolution, once/batch/stale/rollback, in-flight/retry snapshot, history-position/fork, leave/export/törlés/RLS, bounded input és compatible-month regressziók. 279 teszt/24 fájl; új valós PostgreSQL choice/delete verseny a main CI-ben sikeres. Egy valódi angol Sol-eset, validált külső Claude-audit; nem húsz generatív eset vagy friend Auth-release. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
