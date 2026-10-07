# alterward — angol indulás és visszajelzések


## Aktuális: külön saját élet törlése

P11 külön egész-élet törlés elkészült: saját life + aktuális branch/revision, gépelt DELETE LIFE, friss verified Auth, pontos idempotens retry. Minden saját ág/fejezet/választás/job/preview/review/kiadás/refresh/token/save/external jog cascade; másik élet és account aktív marad. Az adott élet Shared-tagsága leválik; érintett próza rejtett, dátum/eredmény/canon változatlan, unsafe personal/shared input és lease érvénytelen. A törlés nem nulláz napi kvótát: 032 csak kind/admitted_at, legfeljebb 24h + worker 15m; RLS/immutable/minimal export/account-cascade. Teljes check 544/47/build, 135 séma; régi 133/001–031 változatlan. Dev DB 001–032 repeat, 69 aw_/69 RLS. 26 valódi kétfiókos Auth/HTTP/TLS ellenőrzés és actual cleanup, genuine seed/ledgers változatlan, paid AI 0. A 031 pontos c36abdd CI verify/container és hét PG-proof sikeres; az új 032 runtime CI még ellenőrizendő. Következő P12 public fork/scenario personalization; P11 teljes privacy/retention/pozitív UI, P13 és Shared/backup/email/Contabo/Cloudflare/éles allowance megmarad. [Bizonyíték és határ](SELECTIVE_LIFE_DELETION_REPORT_HU.md).

2026-10-05 · Aktív felhasználói döntés és friss ellenőrzési státusz. [Aktív termékterv](PRODUCT_PLAN_HU.md) · [Sorrend](NEXT_STEPS.md) · [Éles telepítés](DEPLOYMENT_HU.md).

## Elfogadott irány

Az induló termék kizárólag angol: felület, onboarding, kérdőív, biztonságos hibaüzenetek, AI-események, döntések és történetfejezetek. A magyar felület és új magyar generálás elrejtve/letiltva. A regiszter, fordítások és régi magyar adatok megmaradnak a későbbi nyelvbővítéshez; nem fordítjuk át és nem töröljük őket. A felhasználó a magyar mintákban magyartalanságokat talált, ezért a magyar nyelvi munka most halasztott. A fejlesztési dokumentáció magyar maradhat.

Az angol szerkesztői döntéseket a fejlesztő AI-ra bízta. Nem kérünk tőle angol pontozást, és nem várunk indulás előtt EN/HU emberi pilotra. A felhasználó vállalja az angol béta bevezetését és a valódi használók visszajelzései alapján történő javítást. Ez elfogadott indulási stratégia, nem bizonyított történetminőség vagy retenció.

## Ellenőrzés az indulás előtt

1. Automatikus domain-, kánon-, hozzáférési és költségellenőrzés; angol narráció és megtévesztő jóslatok kerülése. Ismert, kánont módosító vagy tartós tényeket kitaláló hibás fejezet nem kerül ki.
2. Az AI szerkesztői szemmel vizsgálja a személyességet, a konkrét jeleneteket, a döntési tétet, az ismétlést és a természetes angolt. Sonnet külső auditor, Opus vitás esetek/mintavétel jelöltje; a meglévő auditorok pontjai külön gépi vélemények.
3. Valódi Supabase-belépés, első időszak, döntés, folytatás, visszatérés, fork, export és Auth/DB-törlés, majd mentés/visszaállítás próba. A magyar részek elrejtése nem törli az exportálható saját adatokat.
4. Tárhely, éles URL, Supabase Auth engedett URL-ek, HTTPS, titkos környezet és külön éles AI-keret. A két fejlesztői 5 USD keret nem ad automatikus havi tárhely- vagy nyilvános generálási keretet.
5. A kiadásban elérhető visszajelzési csatorna és hibákért felelős folyamat. A privát általános és fejezethez kötött űrlap elkészült, exportálható/törölhető visszajelzéssel és napi limittel. [Működés](BETA_FEEDBACK_AND_METRICS_HU.md).

A nyilvános életkiadás/Discovery/Save/Share/Fork a közösségi terv része marad. Ezeket a privacy, snapshot, moderáció és törlés ellenőrzése után kapcsoljuk be; a technikailag kész privát életmotor korábban is indulhat korlátozott angol bétaként. A béta nem a teljes közösségi MVP készre jelentése.

## Bevezetés és tanulás

Először kis, költséglimites angol béta; utána a kerethez igazított szélesítés. A 20–50 résztvevő mérési cél, nem indulás előtti kötelező létszám. Nem töltjük fel automatikusan az 50–100 Official Life célállományt. A magyar és további nyelvek visszakapcsolása külön későbbi döntés és nyelvi ellenőrzés.

A visszajelzés lehet: természetellenes angol, ismétlődés, hihetetlen részlet/kánonhiba, érthetetlen döntés, folytatási igény vagy technikai hiba. Önkéntes szöveg; privát teljes történet vagy profil beküldése nem kötelező. Kezdetben hetente áttekintjük a beérkezett visszajelzéseket és méréseket; ez munkaterv, ütemezett automatizálás nem készült.

Mérjük az első sikeres fejezetet, a döntést, a folytatás kattintását és tényleges sikerét, a visszatérést, a hibaarányt és a költséget elfogadott időszakonként. A szerveroldali session/olvasásvég-kohorsz és sikeres későbbi folytatás implementálva; a 30 perces inaktivitási ablak kezdeti munkadöntés, a láthatósági jel nem bizonyított olvasás vagy retenció. Kritikus adatkezelési/kánonhiba esetén a kapcsolódó funkció leállítható, a nyelvi és élménybeli megjegyzések következő verzióba kerülnek.

## Aktuális technikai döntés

`supportedLocales` a tárolt/kutatási `en`/`hu` adatok olvasását szolgálja; `enabledLocales` jelenleg csak `en`. A felület és API az engedett regisztert követi. Régi magyar cookie mellett is angol HTML/metadata/hiba jelenik meg. Új v1/v2 élet és új v2 draft csak angol kéréssel hozható létre. Régi magyar élet nem jelenik meg a listában, közvetlen olvasása/új ága/folytatása sem érhető el a termék API-ján. A visszaállított onboarding-draft az angol kiadás nyelvét kapja, a korábbi mentett életek változatlanok.

A worker Sol-modelljei maradnak; a Sonnet/Opus auditor önálló kutatási eszköz. A magyar Claude-minták archivált mérési bizonyítékok, nem induló tartalom. Az eredeti kimeneteket nem írjuk át a korábbi mérésben.

## Előzetes AI szerkesztői döntés

Az OpenAI v2 angol fő mintája érthető, természetes angol prózát, világos időrendet és arányos, kánonhoz kötött döntési téteket ad. Korlátozott béta alapjának megfelelő. A három fejezet visszatérő óvatos szerkezete, idő-/pénzkeret ismétlése és visszafogott kíváncsisága javítandó; ezt a Claude audit is jelezte. Ez szerkesztői indulási ítélet, nem anyanyelvi használók mérése. Haiku hibás próbája nem induló tartalom; a javított Sonnet angol mintában jelzett helyi részlet sem kerül automatikusan Official kiadásba.

## 2026-10-04-i előrelépés

[2026-10-04-i béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md): tényleges Supabase/Auth/DB/OpenAI HTTP-hurok és fióktörlés sikeres; új angol történet Sonnet auditja kánonhű és nyelvileg helyes. Contabo Docker/Compose/Caddy előkészítve, domain és élesítés később. Böngészős onboarding, visszatérés/export és kontrollált megszakításból admin recovery is sikeres. A teljes izolált web/API/worker/Caddy CI, Contabo Compose/proxy preflight, kulcsos SSH és jelszavas tiltás kész. [Operatív eredmény](CONTABO_PREPARATION_REPORT_HU.md). Backup/restore, valós DB-kiesésből helyreállítás, email-kézbesítés, TLS/tűzfal/karbantartás, domain és külön éles költségkeret továbbra kapu; éles deploy nincs.

## Shared Context fokozatos angol kiadása

Az új [S0–S7 terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) minden UI-, hiba- és AI-szöveget angolul ad; a magyar továbbra elrejtve. Foundation és determinisztikus engine csak kikapcsolt funkció/izolált teszt. Első friend béta S2 valódi Shared AI és S3 saját AI-folytatásba épülő impact után, teljes entitlement/consent/block/report/privacy/export/törlés kapuval. A személyes privát béta üzemeltetési útja ettől külön is haladhat; minden későbbi típus nem előfeltétele a személyes béta indulásának. Nincs új kézi EN/HU jóváhagyás; kiadás után shared élményre is valódi angol használói visszajelzést gyűjtünk. Contabo/domain/éles keret továbbra későbbi, külön kapu.


## Shared S3 rész és kiadási határ — 2026-10-05

S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes ellenőrzés](SHARED_CONTEXT_S3_REPORT_HU.md), [angol minta](examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md), [külső Claude-audit](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 AI-ellenőrzés és megvásárolt domain

[Privát AI-pre-screen](PUBLIC_AI_REVIEW_REPORT_HU.md): kizárólag az előkészített angol copy, immutable hash/revision/policy és receipt, egyszeri operatori futás és saját olvasási API, export/törlés. Egy valódi Sol-negatív kontroll öt privacy-jelzést adott; nincs publikálási/Official jóváhagyás. A 014 migráció a fejlesztői Supabase-on alkalmazva és ismételve. Az alterward.com aktív Cloudflare-domain; a DNS még üres, TLS Full, éles bekötés nem történt. Következő: fizetett scan-job és curator/Publication/Confirm, majd P10–P13; S3 retention és S4–S7 továbbra megmarad.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


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
