# alterward — mérés, monetizáció és üzemeltetés


## Aktuális: a 15 élet / 5 Scenario béta-katalógus kiadási példányai elkészültek

2026-10-08, 2026-10-08T14:31:24.607Z: elkészült a 15 angol Official élet / 45 valódi AI-fejezet és az öt public Official Scenario staging-kiadása, minden példány külön preview/Confirm és tényleges DB-reader hash-ellenőrzés után. Mind a 15 eredeti élet Sonnet-auditált; 11 további teljes copy-audit és külön szerkesztői döntések készültek, a negatív reportok és indokolt egyedi lezárásuk megmaradtak. Külön fork-engedély 15 élethez / 45 ellenőrzött döntési ponthoz, 15 kurált Featured life és tényleges Discovery-visszaolvasás kész; öt Scenario külön personalization consentet kapott. Normál serving és fizetett start flag-ek false, béta keret inaktív, Contabo-deploy nincs. Kizárólag angol termék, magyar rejtve. 194 valódi providerhívás, konzervatív elszámolás 4.668157 USD (3.730325 OpenAI + 0.937832 Claude), ismeretlen usage 0; a tesztelői 3 USD tartalék érintetlen. Ez helyi költségőr-elszámolás, nem szolgáltatói számla/egyenleg. Jóváhagyott összesen 10 USD, 8 + 2 providerplafon, seed 6 + 1 / béta 2 + 1; legfeljebb 10 tesztelő, tényleges kezdéstől 30 nap, közös 0,50 USD/user plafon. Angol Scenario-lista, keresés, lapozás és navigáció implementált; mind az öt valódi public forrás visszaolvasása és hat literal keresés ellenőrzött, új paid AI 0. A teljes helyi check 650 teszt / 60 fájl és production build sikeres; 165 séma: három additív Scenario-discovery contract, a régi 162 és 001–036 változatlan. A megelőző 45016eff pontos verify/container CI sikeres (641/59/162, ismételt migrációk, PostgreSQL/HTTPS/DB TLS, 0 fizetett CI-AI). A katalógus olvasható dokumentumai elkészültek. Következő: személyes Scenario valódi AI-minőség/pozitív interaktív UI, P13 mérés, retention/backup/restore/email/ops, üzemeltetői kapcsolat-email, tényleges tesztelőlista és teljes webhely-zárás, majd engedélyezett Contabo-indulás. P01–P13 és Shared S0–S7 kombinált terve megmarad; 50–100 élet / 20–30 Scenario béta utáni bővítés, teljes nyilvános indulás külön lépés. [Olvasható angol kínálat](../beta-catalog/README.md) · [Bizonyíték és határok](../CLOSED_BETA_CATALOG_REPORT_HU.md) · [Keret](../AI_PRODUCTION_BUDGET_HU.md).

**2026-10-04-i kiinduló állapot (történeti):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · A privát minimális mérés/összesítés kész; fizetés és public analitika tervezett. [Termékterv](../PRODUCT_PLAN_HU.md) · [Költség és státusz](../STATUS_HU.md).

## Elsődleges mérés

**Continuation Rate:** elsőfejezet-vég láthatósági jellel rendelkező gyökéréletek közül később sikeresen folytatottak aránya. A Folytatom kattintási szándék külön proxy. **Continued Life Sessions:** későbbi munkamenetben folytatott egyedi életek száma és külön sikeres folytatási session. A privát mérés szerveroldali 30 perces inaktivitási ablakot használ; sikeres commit és kattintás külön.

Onboarding indítás→első szimuláció; első fejezet megnyitás/befejezés; döntés megjelenés/sikeres mentés; történeti fork; D1/D7/D30 ugyanazon aktivált kohorszban. Kattintás/siker/késleltetés/hiba külön; technikai hiba nem tűnik el a nevezőből. Az [aktív terv](../PRODUCT_PLAN_HU.md) tartalmazza a kezdeti definíciókat. A privát session/fejezetvég/folytatás összesítés működik; D1/D7/D30 kohorsz és public funnel még terv. Nincs validált számszerű retention-küszöb.

## Public funnel

Discovery aktív olvasó → életview → olvasási mélység/befejezés → Save/Share → sign-up → forkindítás → saját élet létrehozása → első AI-időszak → későbbi folytatás. Publish/unlisted/unpublish/report/removal/referral külön. Paid conversion csak későbbi működő payment után. Hosszabb olvasás és egyszeri megnyitás nem ugyanaz.

Analitika minimális opaque ID/locale/feature/idő/error/eredmény. Nincs történet/cél/profil/prompt/kapcsolatnév/auth vagy unlisted token. Optional analytics/consent/retention véglegesítendő; dashboard nem privát profilböngésző. A történeti AI-run audit nem kész termékanalitika.

## Monetizációs irány

Ingyenes: privát működés, adathozzáférés/export és törlés; Discovery/Official/Community olvasás, Save, Share, Publish. Saját AI-generálás/fork/personalize korlátozható. Későbbi prémium: több aktív élet/generálás, mélyebb szimuláció, stílus és külön formázott narratív dokumentum. Adatjogok és privacy nem kerülnek paywall mögé. Pontos ár, ingyenes darabszám, billing provider és subscription nincs eldöntve vagy megvalósítva.

Nincs „fizess jobb jövőért”, félelem/sérülékenység alapú upsell, személyiségadat eladás vagy hitelképességi API. A hipotézist használat és egységköltség támaszthatja alá.

## Költség és ops

Mérendő event/story/check/summary/redaction task, token/price version, sikeres period/folytatás/public fork ára, P50/P95 és hibák/javítás/fallback költsége. Projekt/user keretfoglalás és concurrent reservation P05-ben elkészült. A helyi single-process smoke-guard nem szolgáltatói hard spend limit, és nem teljes app budget.

Queue mélység, lease/heartbeat, provider/DB/auth hibák, invalid arány, latency és spend anomaly, deletion/revocation/cache hiba monitorozandó. Request/job/life ID supporthoz, tartalom nélkül. Staging/prod credential, mentés/visszaállítás, Auth-siker/DB-hiba helyreállítása, admin jogosultság/audit és incidensfelelős indulási feladat. Main commit nem deploy.

Official tartalom költsége előzetes kis v2 seedméréssel becsülendő. 50–100 élet/20–30 sablon nem jelent korlátlan paid futtatást. Már elköltött és megmaradt kísérleti keret egy helyen, a [státuszban](../STATUS_HU.md); régi riportok az akkori állapotot őrzik.

### Contabo üzemeltetési audit

A [2026-10-04-i belső audit](../CONTABO_SERVER_AUDIT_HU.md) szerint a jelenlegi kapacitás korlátozott bétára megfelelőnek tűnik. Az auditkori root/jelszavas SSH az alábbi végrehajtásban már szűkítve. Indulás előtt rendezendő: megengedő helyi INPUT policy, a közös Caddy három lejárt tanúsítványa/egy kézfogási hibája, elkülönített alterward hálózat/route, függő reboot és csomagkarbantartás, külön külső/config/secret és Supabase mentés/restore. A meglévő alkalmazásspecifikus backup timerek sikeres státusza nem teljes VPS-restore bizonyíték. OpenAI/Auth hálózati TLS és a projekt CA-jával DB TLS rendben; valódi éles generálás és telepítés nem történt. A szerver módosítása külön üzemeltetési lépés, a kísérleti keretek változatlanok.

[Engedélyezett folytatás](../CONTABO_PREPARATION_REPORT_HU.md): SSH-jelszavas tiltás és új kulcsos hozzáférés ellenőrzött, meglévő kulcs megmaradt. Konfiguráció/proxy-storage mentés készült, mind a 25 hash ellenőrzött; elkülönített erőforráskorlátos Contabo-csomag és közös proxy merge/adapt sikeres. TLS/storage/ACME javítás, tűzfal, teljes backup/restore és egyeztetett kernel-reboot továbbra nyitott; más alkalmazásokat nem indítottunk újra. [Teljes CI](https://github.com/Muzsy/future_flow/actions/runs/37194453326) sikeres: web/API/worker/proxy, izolált DB TLS/migrációk és üres worker-leállítás, valós adat és fizetett AI nélkül; 159 automatizált teszt és build is sikeres. Domain és külön éles AI-keret még nincs, deploy nem történt.

## Shared entitlement és initiator költség — terv

Free 0, Explorer 1 friend, Connected 3 friend/romantic/work/hobby, World 5 minden típus; abszolút 5/user, minden tag saját entitlementje. Inviting/active/paused számít, ended/archived nem. A korábbi árjavaslat nem végleges, billing és grace nyitott. Shared AI initiator user/project keretéből egyszer számlázott; saját follow-up külön saját keret, olvasás/intent nulla AI. Meglévő kumulatív 5+5 USD és nulla éles allowance marad. Új shared funnel/költség mérés tartalom/token/intent nélkül tervezett.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S2 implementációs kiegészítés

S2 a kezdeményező user/project budgetet terheli; olvasás/intent nem paid. Két kisminta összesen 0.023755 USD konzervatív fogyasztás; OpenAI maradvány 3.051006625 USD, Claude 2.681955 USD. Éles budget továbbra 0, entitlement nem költési engedély. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


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


## 2026-10-07: public aktivitásmérés

P10 read-start/viewport depth/end-after-30sec/share-click/clipboard-success/failure és sikeres save/unsave/report/publish/owner-withdraw/hide/remove napi UTC counter kész. Ez nem unique human/comprehension/referral/fork cohort. Client DNT/GPC, nincs cookie/local storage/profil; raw session 20 perc TTL, lejárat+24h worker-cleanup. Protected metrics:public 90 napos összesített időablak; külön aggregate-retention még nincs. Ranking/Trending/Most Forked csak későbbi abuse/public-fork kapuval. [Bizonyíték](../PUBLIC_ACTIVITY_METRICS_REPORT_HU.md).


## 2026-10-07: jóváhagyott első éles AI-időszak

Az első éles 30 nap OpenAI 10 USD, Claude 5 USD, user összesített 0,50 USD jóváhagyott. Az időszak a deploykor kezdődik, nincs önmegújítás; operator/audit konfiguráció és provider-fedezet ellenőrzendő. A szerver/domain költsége külön, a korábbi 5–5 USD fejlesztési napló változatlan. [Részletek](../AI_PRODUCTION_BUDGET_HU.md).
