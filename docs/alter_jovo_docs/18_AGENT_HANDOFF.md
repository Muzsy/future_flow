# alterward — fejlesztői átadás


## Aktuális: a 15 élet / 5 Scenario béta-katalógus kiadási példányai elkészültek

2026-10-08, 2026-10-08T14:31:24.607Z: elkészült a 15 angol Official élet / 45 valódi AI-fejezet és az öt public Official Scenario staging-kiadása, minden példány külön preview/Confirm és tényleges DB-reader hash-ellenőrzés után. Mind a 15 eredeti élet Sonnet-auditált; 11 további teljes copy-audit és külön szerkesztői döntések készültek, a negatív reportok és indokolt egyedi lezárásuk megmaradtak. Külön fork-engedély 15 élethez / 45 ellenőrzött döntési ponthoz, 15 kurált Featured life és tényleges Discovery-visszaolvasás kész; öt Scenario külön personalization consentet kapott. Normál serving és fizetett start flag-ek false, béta keret inaktív, Contabo-deploy nincs. Kizárólag angol termék, magyar rejtve. 194 valódi providerhívás, konzervatív elszámolás 4.668157 USD (3.730325 OpenAI + 0.937832 Claude), ismeretlen usage 0; a tesztelői 3 USD tartalék érintetlen. Ez helyi költségőr-elszámolás, nem szolgáltatói számla/egyenleg. Jóváhagyott összesen 10 USD, 8 + 2 providerplafon, seed 6 + 1 / béta 2 + 1; legfeljebb 10 tesztelő, tényleges kezdéstől 30 nap, közös 0,50 USD/user plafon. Angol Scenario-lista, keresés, lapozás és navigáció implementált; mind az öt valódi public forrás visszaolvasása és hat literal keresés ellenőrzött, új paid AI 0. A teljes helyi check 650 teszt / 60 fájl és production build sikeres; 165 séma: három additív Scenario-discovery contract, a régi 162 és 001–036 változatlan. A megelőző 45016eff pontos verify/container CI sikeres (641/59/162, ismételt migrációk, PostgreSQL/HTTPS/DB TLS, 0 fizetett CI-AI). A katalógus olvasható dokumentumai elkészültek. Következő: személyes Scenario valódi AI-minőség/pozitív interaktív UI, P13 mérés, retention/backup/restore/email/ops, üzemeltetői kapcsolat-email, tényleges tesztelőlista és teljes webhely-zárás, majd engedélyezett Contabo-indulás. P01–P13 és Shared S0–S7 kombinált terve megmarad; 50–100 élet / 20–30 Scenario béta utáni bővítés, teljes nyilvános indulás külön lépés. [Olvasható angol kínálat](../beta-catalog/README.md) · [Bizonyíték és határok](../CLOSED_BETA_CATALOG_REPORT_HU.md) · [Keret](../AI_PRODUCTION_BUDGET_HU.md).

**2026-10-04-i kiinduló állapot (történeti):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [Dokumentációs központ](../README.md), [állapot](../STATUS_HU.md), [backlog](../NEXT_STEPS.md). Következő helyben: **P09 fizetett scan-job költségőrrel és curator/Publication/Confirm alap**, az elkészült S0–S2 alapra. P06 backup/restore/valós DB-kiesés és Contabo-ops későbbi kiadási kapu; P09–P13 public szál megmarad.

## Kiindulás és feladat

V2 12 lépéses angol onboarding (HU elrejtve), valódi AI hat hónap, choice/folytatás/történeti fork, memória/javítás és költségőr integrált. V1 archívum megmarad. [Riport](../V2_IMPLEMENTATION_REPORT_HU.md).

P01–P05 technikai mag kész, Supabase 001–014 alkalmazva. P06 valódi Auth/AI HTTP-próba és törlés kész, UI-bizonyíték az aktuális riportban; backup/restore és valós DB-kiesésből recovery nyitott; P07 új angol minta AI-auditja és P08 feedback/session-műszerezés kész; valódi használói béta még nincs. Nyilvános aktiválás még nem engedhető kész kapuk nélkül.

## Kötelező keretek

1. Terméknév alterward, repó `Muzsy/future_flow`, **main** ág; belső legacy azonosítókat ne cserélj indok nélkül.
2. Valódi OpenAI, nincs AI nélküli termékmód. Helyettesítő kizárólag elkülönített tesztben.
3. Canon/state validált és determinisztikus; próza nem tartós tényforrás. Függő döntés után nincs előre commitolt következmény.
4. Ág/múlt/profil immutable, choice egyszer alkalmazva, revision/idempotencia/lease védelem.
5. Kizárólag angol minden új induló funkcióban; magyar elrejtve; életnyelv immutable, nyelvváltás nem generál.
6. Saját élet privát, export/törlés ingyenes. Publichoz külön sanitized snapshot/checkpoint és explicit preview/Confirm.
7. Kulcs/log/prompt/titok nem kerül Gitbe, chatbe, kliensbe. Korábbi admin-kulcs függőséget ne kérd újra az érték chatbe másolásával.
8. OpenAI 5 USD és Claude kutatás/audit külön 5 USD, szolgáltatónként összesített korábbi/future fogyasztással; aktuális fogyasztás a státuszban és helyi naplóban. Paid próba előtt közös foglalás, egy folyamat, unknown foglalás megmarad.
9. Modellek jelenleg Sol; Luna candidate csak saját teljeslánc- és nyelvi minősítés után. Ne kapcsolj automatikus drágább fallbacket számlázási hibára.
10. A public rendszer a teljes MVP része, személyes core után. Ne helyettesítsd általános social feed/komment/DM építésével.

## Ellenőrzés és átadás

Repository/AGENTS és érintett kód olvasása; migrált v1 adatok/hash-ek, ownership, period/head concurrency, atomic choice/job/canon és locale célzott ellenőrzése. `pnpm format:check`, typecheck/test/build, schema drift a változásnak megfelelően. Paid OpenAI-próba csak indokolt új AI-változásnál és előzetes keretből. Automatizált domain/privacy siker nem emberi termékvalidáció.

P06 valódi Auth/DB-törlés sikeres; email-kézbesítés/backup/restore/valós DB-kiesésből recovery nyitott; P07 angol automatikus/szerkesztői minőség, P08 emberi folytatás, P09–P13 public. Main commit/CI nem nyilvános deployment. Átadásban kész és tervezett rész, teszt és korlát világosan szerepeljen. Nagy új termékdöntést ne találj ki; visszafordítható részletet dokumentálva oldj meg, tényleges hiányzó információt tisztázz.

Claude kliens/CLI és szintetikus fixture-ök kész; [mért modellajánlás](../CLAUDE_MODEL_EVALUATION_HU.md). Kulcs védett .env és külső vault; .local/claude-audit/usage.json megőrzendő, külön lock. Haiku nem minősített narrátor/esemény alapnak. Sonnet rutin külső auditor-jelölt, Opus vitás mintavétel; használói minőség kiadás után mérendő; kézi HU/EN előkapu felülírva. A raw audit JSON téves riasztásokat is tartalmaz, nem canon-forrás.

Contabo: [előkészítés](../CONTABO_PREPARATION_REPORT_HU.md), védett SSH-kulcs/hostpin, jelszavas SSH tiltva. Ne próbáld újra a régi SSH-jelszót. Konfigurációmentés megvan, teljes restore nincs; éles alkalmazás nem fut. Korábbi main CI-k dátumozott bizonyítéka a [státuszban](../STATUS_HU.md); aktuális helyi ellenőrzés 314 teszt/48 séma/14 migráció. Éles AI-allowance nulla, domain alterward.com; helyi munka nem engedély proxycserére vagy rebootra.

## Shared átadási követelmények

S0–S2 és S3 személyes/time backend elkészült kikapcsolva. 001–010 Session poolerrel alkalmazva/ismételve; 010 immutable, új migration a következő számon. S0 valódi háromfiókos Auth/HTTP/export/törlés és S3 izolált Sol→own-memory→period/chapter/fidelity+Claude audit sikeres. S3 Connections/moderáció/retained PII/full Auth-release kapu még hátravan. Globális lock-sorrend, own branch és canon megtartása kötelező; mások története nem account cascade. Main/angol/helyi munka, két eredeti budget és P09–P13 public terv megmarad. [S3 bizonyíték](../SHARED_CONTEXT_S3_REPORT_HU.md).

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

S3 személyes/time szelet elkészült; 010 alkalmazva, ezért nem szerkeszthető. Új 39 séma/279 teszt. Következő S3 UI/moderation/retained privacy/full Auth gate; minden feature false. OpenAI guard 2.074165875 USD, Claude guard 2.338015 USD; eredeti naplók megmaradnak. A jelenlegi két új minta változatlan. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


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


## 2026-10-07: jóváhagyott első éles AI-időszak

Az éles budget jóváhagyva: első 30 nap 10/5 USD és közös user 0,50 USD. Nem kell újra engedélyt kérni erre a keretre; csak a tényleges induláskor szabad aktiválni, nincs automatikus megújítás. A régi 5–5 USD kutatási keret/ledger nem emelhető/resetelhető. Új runtime CI még ellenőrizendő, Scenario personalization/P13 és P/S/ops folytatandó. [Részletek](../AI_PRODUCTION_BUDGET_HU.md).


## 2026-10-07: Scenario személyre szabás privát alapja

Budget exact 05e6014 CI sikeres, új paid AI 0/éles aktiválás nincs. P12 privát Scenario-composition foundation kész 588/53/148 helyi ellenőrzéssel, exact foundation CI még ellenőrizendő. Következő public Scenario kiadás/permission, durable own preview és cross-owner start/API/UI; aztán P13, minden korábbi P/S/ops scope megtartandó. [Részletek](../SCENARIO_PERSONALIZATION_FOUNDATION_REPORT_HU.md).


## 2026-10-07: külön public Scenario kiadási API

Main 89a7cf5 composition exact CI sikeres; külön public Scenario backend 035/repeat és 600/54/154 helyi check kész, új exact CI/PG proof még ellenőrizendő. Új paid AI 0, normál feature false, production 10/5 USD csak tényleges indulástól. Következő own personal preview/start/attribution/API/UI, majd P13/P/S/ops. Nem szabad technikai fixture-evidence-et valódi provider vagy nyilvános seed bizonyítékaként kezelni. [Részletek](../PUBLIC_SCENARIO_PUBLICATION_REPORT_HU.md).


## 2026-10-07: saját személyes Scenario-előnézet és életindítás

Az első éles 30 nap 10 USD OpenAI + 5 USD Claude és közös user 0,50 USD jóváhagyott; csak valódi indulástól, nincs automatikus megújítás vagy éles aktiválás. A public Scenario javított ede2499 pontos CI verify/container sikeres: 600/54/154, 001–035/repeat, nyolc új PG-proof, korábbi PG/HTTPS/TLS és 0 paid AI. P12 saját tartós teljes személyes előnézet, külön profil/hash/ack jóváhagyás, cross-owner idempotens privát élet/egy normál AI-job, élő source/consent, rendezett UPDATE lockok, source-detach attribution, saját törlési tombstone, retention/export/RLS/cascade implementált. Fejlesztői DB 001–036/repeat, két új üres privát RLS-tábla; normál public/personal/operator false. Teljes helyi check 610 teszt/55 fájl/types/script-types/build és 159 séma; a korábbi 154 és 001–035 változatlan. Az új personal Scenario pontos CI/real-PG és valódi Auth/AI proof még ellenőrizendő; az angol reader/Confirm/saját profil/előnézet/start UI még következik. P13/P11/Shared/retention/ops és teljes 50–100 élet/20–30 Scenario scope megmarad. Új paid AI 0, régi kutatási naplók és 5–5 USD keret változatlan; Contabo-deploy nincs. [Részletek](../PERSONAL_SCENARIO_START_REPORT_HU.md).
