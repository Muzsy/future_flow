# alterward — angol kiadás és nyelvi kompatibilitás


## Aktuális: a 15 élet / 5 Scenario béta-katalógus kiadási példányai elkészültek

2026-10-08, 2026-10-08T14:08:15.768Z: elkészült a 15 angol Official élet / 45 valódi AI-fejezet és az öt public Official Scenario staging-kiadása, minden példány külön preview/Confirm és tényleges DB-reader hash-ellenőrzés után. Mind a 15 eredeti élet Sonnet-auditált; 11 további teljes copy-audit és külön szerkesztői döntések készültek, a negatív reportok és indokolt egyedi lezárásuk megmaradtak. Külön fork-engedély 15 élethez / 45 ellenőrzött döntési ponthoz, 15 kurált Featured life és tényleges Discovery-visszaolvasás kész; öt Scenario külön personalization consentet kapott. Normál serving és fizetett start flag-ek false, béta keret inaktív, Contabo-deploy nincs. Kizárólag angol termék, magyar rejtve. 194 valódi providerhívás, konzervatív elszámolás 4.668157 USD (3.730325 OpenAI + 0.937832 Claude), ismeretlen usage 0; a tesztelői 3 USD tartalék érintetlen. Ez helyi költségőr-elszámolás, nem szolgáltatói számla/egyenleg. Jóváhagyott összesen 10 USD, 8 + 2 providerplafon, seed 6 + 1 / béta 2 + 1; legfeljebb 10 tesztelő, tényleges kezdéstől 30 nap, közös 0,50 USD/user plafon. A teljes helyi check 641 teszt / 59 fájl és production build sikeres; 162 séma és 001–036 változatlan. A megelőző 8c9a6de5 pontos verify/container CI sikeres (635/59/162, ismételt migrációk, PostgreSQL/HTTPS/DB TLS, 0 fizetett CI-AI). A katalógus olvasható dokumentumai elkészültek. Következő: általános Scenario-lista/navigáció, személyes Scenario valódi AI-minőség/pozitív interaktív UI, P13 mérés, retention/backup/restore/email/ops, üzemeltetői kapcsolat-email, tényleges tesztelőlista és teljes webhely-zárás, majd engedélyezett Contabo-indulás. P01–P13 és Shared S0–S7 kombinált terve megmarad; 50–100 élet / 20–30 Scenario béta utáni bővítés, teljes nyilvános indulás külön lépés. [Olvasható angol kínálat](beta-catalog/README.md) · [Bizonyíték és határok](CLOSED_BETA_CATALOG_REPORT_HU.md) · [Keret](AI_PRODUCTION_BUDGET_HU.md).

2026-10-04 · [Indulási döntés](ENGLISH_RELEASE_PLAN_HU.md) · [Közös státusz](STATUS_HU.md) · [Dokumentációs központ](README.md).

## Aktív nyelvi policy

A legújabb felhasználói döntés szerint az induló termék kizárólag angol felületet és angol AI-történeteket ad. A magyar minták fogalmazására érkezett kritika; a magyar felület és generálás most halasztott. Az AI végzi az angol szerkesztői ellenőrzést, majd a korlátozott éles béta visszajelzései alapján javítunk. Előzetes kézi EN/HU minősítésre nem várunk. A fejlesztési dokumentáció magyar marad.

| Terület | Jelenlegi működés |
|---|---|
| Regiszter | `supportedLocales` = `en`, `hu` tárolt/kutatási kompatibilitás; `enabledLocales` = csak `en` a termékben |
| Felület | Angol katalógus minden képernyőn; a nyelvválasztó egy engedett nyelvnél nem jelenik meg |
| Régi cookie | `alterward_locale=hu` is angol HTML/metadata/kliensnyelvet eredményez; az engedélyezett nyelv szerver- és kliensoldalon is szűrt |
| API-feliratok | `Accept-Language: hu` mellett is angol kérdőív és biztonságos hiba |
| Új élet/draft | V1 future és v2 create/draft request csak `locale: en`; explicit `hu` 422, generálási job nélkül |
| Visszatöltött draft | Az új onboarding az angol felület nyelvét rögzíti, a többi válasz/revision megmarad |
| Régi magyar történetek | Nem jelennek meg a v1/v2 listában; közvetlen olvasás/timeline/job/choice/continue/fork/retry/preview az API-n elrejtve |
| Saját adatok | Az ingyenes export a régi HU adatokat is megőrzi; fióktörlés ugyanazt a teljes adatgráfot kezeli |
| Kánon/adatbázis | A mentett `content_locale` immutable; alkalmazott migráció és korábbi történet nem módosul |
| Későbbi nyelvek | Katalógusok és kódok megmaradnak; visszakapcsolás külön termékdöntés és nyelvi minősítés |

## AI-tartalom

Új életek és folytatásaik angol nyelvű eseményt, döntést, opciót, címet, narrációt és ellenőrzési megjegyzést kapnak. Más nyelvű szabad szöveges bemenet nem írhatja felül a kimeneti nyelvet. Az AI provider magyar képessége a külön kutatási eszközben megmarad; ez nem engedélyez új magyar termékéletet. Régi, már tárolt jobok nyelvi jelentését nem változtatjuk meg.

A felület és tartalomnyelv megkülönböztetése megmarad a szerződésekben. `Locale` és a tárolt v2 input/setup/draft sémák olvassák a korábbi `hu` adatot is; az új `lifeCreateRequestV2Schema` és `lifeDraftRequestV2Schema` az engedett terméknyelvre szűkít. A [kódból exportált request-sémák](contracts/v2/lifeCreateRequest.schema.json) ezt külön mutatják. Olvasás, újratöltés és a nyelvi elrejtés nem indít API-generálást vagy fizetett fordítást.

A jelenlegi környezetsablon magyar földrajzi kontextusa külön kérdés a történet angol nyelvétől. Profilérték, opcióazonosító, kérdőívhash, pénznem és szabad felhasználói címke nem fordul át automatikusan. A kérdőív angol megjelenítése ugyanazokat az adatkulcsokat/pontozást használja.

## Nyelvek későbbi engedélyezése

1. Teljes katalógus, kérdőív és biztonságos hibaszöveg, egyező kulcsokkal/interpolációval.
2. A nyelv regisztrálása és additív DB-nyelvkód-bővítés, ha még nincs támogatva; alkalmazott migráció nem írható át.
3. Többidőszakos valódi AI-próba és dokumentált nyelvi ellenőrzés, különösen a magyar természetes fogalmazás javítása.
4. Az `enabledLocales` bővítése, csak az elfogadott kiadási döntés után. Ekkor válik láthatóvá a választó és használhatóvá az adott nyelv.
5. Public tartalom/keresés/SEO és RTL szükség szerint; olvasáskor továbbra sincs fizetett fordítás.

## Korábbi mérési bizonyíték

A kétnyelvű alap korábban működött: angol/magyar v1 alap és ág, 12 valódi OpenAI-hívással és 0,3352520 USD becsléssel. V2-ben négy EN/HU Sol/Luna lánc ×3 időszak és Claude külső audit készült. Ezek történeti mérések, nem aktív kétnyelvű kiadási követelmények. A minta szövege és nyers mérési eredménye változatlan. [Angol háromidőszakos fő minta](examples/AI_V2_ENGLISH_STORY.md), [angol Claude-próbák](examples/CLAUDE_GENERATED_STORIES_EN.md), [audit](examples/CLAUDE_EXTERNAL_AUDIT_HU.md).

A korábbi böngészős próba két nyelvet és 390 px nézetet ellenőrzött. Az angol átállás új regressziói: HU-cookie, HU-fejléc, tiltott új HU élet/draft, elrejtett régi v1/v2 történet, változatlan export/kánon és angol fióktörlési megerősítés. 2026-10-04-én a valódi szintetikus Supabase-fiókos angol HTTP- és böngészős végigpróba sikeres: onboarding/draft, fejezet/döntés/folytatás, visszatérés/export, Auth/DB-törlés és kontrollált recovery. [Bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md). Email-kézbesítés, teljes backup/restore és éles deploy továbbra külön P06 ops-kapu.

## Shared Context tervezett lokalizációja

Connections, meghívó/consent/entitlement/decision/block/report és SHARED_* hibák angolul kerülnek kiadásra. A context és a shared job mentett locale-ja az aktív EN-policyt követi; a forrás EN/HU mintakatalógusa nem kapcsolja vissza a magyart. A shared szerződés külön verzió, a meglévő HU adatok/export kompatibilitása megmarad. Másik context nyelve nem fordítja át és nem generálja újra a személyes canont. [Új integrációs terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: sanitized döntési checkpoint foundation

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és pontos korlátok](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: döntési előnézet és leírásszerkesztő

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális bizonyíték](PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: teljes előnézeti tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: teljes tartalom AI-job és költségőr

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.
