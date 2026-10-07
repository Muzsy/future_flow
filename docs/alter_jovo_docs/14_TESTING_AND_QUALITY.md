# alterward — tesztelés és minőség


## Aktuális: valódi public-fork AI és belépési útvonal

P12 public-fork engine, három valódi angol AI-időszak és külső Claude-audit kész: nyelv/kánon helyes, 0 finding, 4/5/5/5/4 szerkesztői pontszám. Az eredeti private canon és public reader változatlan; az új élet privát, nem Official. Az olvasás utáni login/signup csak ellenőrzött public útvonalra tér vissza, új fiók külön felnőtt/AI-privacy és költség-hozzájárulást ad; fiókváltás nem küld indítást más felhasználó nevében. Teljes helyi check 563 teszt/50 fájl/build és 144 séma; végső kliensjavítás további két új célzott teszttel/típus/build ellenőrzéssel, 17 valódi Auth/HTTP check és tényleges cleanup. A d38b0e3 034 verify/container CI és nyolc PG-proof sikeres; az új onboarding pontos CI még ellenőrizendő. Új genuine próba 9 OpenAI + 1 Claude hívás: 0,1814238 / 0,031204 USD becslés. Kumulatív guard OpenAI 2,939418375 USD, Claude 2,409600 USD; külön 5–5 USD keretből 2,060581625 / 2,590400 USD marad. Következő Scenario személyre szabás és P13; privacy/retention/Shared/ops, eredeti célállomány és éles név/kontakt/AI-keret/kínálat döntése megmarad. Contabo élesítés még nem történt. [Bizonyíték és határ](../PUBLIC_FORK_QUALITY_ONBOARDING_REPORT_HU.md).

**2026-10-04-i kiinduló állapot (történeti):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

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

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.

A [4745a3 main CI](https://github.com/Muzsy/future_flow/actions/runs/37347782878) verify és container jobja sikeres: 314 teszt/27 fájl, teljes build/48 séma-drift, 14 migráció/ismétlés, PostgreSQL editor-preflight/duplamentés/visszatöltés/új review és korábbi Shared-próbák, TLS és tiszta worker-stop. Valódi böngészős/Auth/Sol próba is sikeres; öt új kérés 0.063175 USD. [Teljes előnézeti bizonyíték](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md). Következő a fizetett scan-job közös projekt/user költségőrrel; publikáció még nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: P09 ScenarioVersion állapot

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Aktuális riport](../SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: P09 döntési checkpoint állapot

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális riport](../PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: P09 döntési előnézeti felület

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: P09 teljes tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: P09 teljes tartalom AI-job

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](../PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.


## 2026-10-06: P10 read-only Discovery első szelet

471/40 teljes helyi check és Next/API/worker build; 7 új PGlite/HTTP/link regresszió. Valódi Supabase Auth/verified TLS/genuine seed Discovery-próba kész, költségőr-naplók változatlanok. Additív [CI](https://github.com/Muzsy/future_flow/actions/runs/37537224387) PostgreSQL/HTTPS Discovery proof sikeres: 6 új és minden 71 korábbi proof megmarad, 0 paid AI. Pozitív vizuális/böngészős teszt még feladat. [Részletes bizonyíték és következő kapuk](../DISCOVERY_FOUNDATION_REPORT_HU.md).
