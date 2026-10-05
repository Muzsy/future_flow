# Beállítás és helyi titokkezelés

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A két terv teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-05 · A meglévő fejlesztési projekt már beállítva: 001–007 alkalmazva, valódi Auth/AI/export/törlés és kontrollált recovery sikeres. Az alábbi lépések új környezet beállításához is használhatók; nem kérik újra a már megadott kulcsokat.

## Supabase

1. Hozz létre projektet egy választott EU-régióban.
2. A **Connect** ablakból másold a PostgreSQL-kapcsolati URL-t. Hosszú életű API/worker esetén a direct connection vagy session pooler megfelelő. Ha a gép nem éri el az IPv6 direct hostot, használd a session poolert; a régiófüggő hostot a Connect ablakból másold.
3. Rögzítsd a `DATABASE_URL` és `DATABASE_SSL=true` értékeket a helyi `.env` fájlban. A jelszó URL-encode-olt legyen a connection stringben.
   Ha a Node nem ismeri a Supabase tanúsítványláncát, a Database Settings SSL Configuration részéből töltsd le a CA-tanúsítványt, majd add meg abszolút fájlútvonalként a `DATABASE_SSL_CA_FILE` változóban. A kliens a tanúsítványt és a hostnevet is ellenőrzi; nincs `rejectUnauthorized:false` kerülőút.
4. A projekt URL és publishable key az `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` változókba kerül. Ezek nyilvános kliensbeállítások. A `SUPABASE_URL` ugyanaz a projekt URL a szervernek.
5. A **Settings → API Keys** részből a szerveroldali secret vagy legacy `service_role` kulcsot add meg `SUPABASE_SERVICE_ROLE_KEY` néven. Ez szükséges a fióktörléshez. Ne kerüljön `NEXT_PUBLIC_*` változóba.
6. **Authentication → URL Configuration**: Site URL `http://localhost:3000`; redirect engedélyezés `http://localhost:3000/login`.
7. Email/password belépés és e-mail megerősítés. A felület külön jelzi, amikor a megerősítő levélre kell várni.
8. `pnpm build:packages`, majd `pnpm db:migrate`. Az új migrációk egy tranzakcióban futnak; a már alkalmazott migráció utólagos módosítása hibát ad.

Az adatbázis-URL szerveroldali, privilegizált kapcsolat. A böngésző nem használja. A közvetlen anon/authenticated táblahozzáférés tiltott.

## OpenAI

1. Saját OpenAI API-projekt és API-kulcs, aktív API-hozzáféréssel.
2. `OPENAI_API_KEY` a gyökér `.env` fájlba.
3. `AI_EVENT_MODEL`, `AI_STORY_MODEL` és `AI_CHECK_MODEL`: Structured Outputs-képes, a saját projektben elérhető modellek az eseményekhez, történethez és ellenőrzéshez. Kezdő beállítás mindháromhoz: `gpt-6.1-sol`. Ha `AI_CHECK_MODEL` nincs megadva, az eseménymodell marad az ellenőrző, megőrizve a korábbi működést. Az eseménymodell cseréjénél ezért az ellenőrzőt is állítsd be külön. A Luna-jelölt vizsgálata és a feltételes modellkombináció: [költségoptimalizálás](AI_MODEL_ROUTING_HU.md).
4. A `GENERATION_DAILY_LIMIT`, `GENERATION_CONCURRENT_LIMIT`, `AI_MAX_OUTPUT_TOKENS` változók korlátozzák a terhelést. A szolgáltatói költségkeretet az OpenAI projektbeállításában is állítsd be.

Az API-kulcs hiányában a worker egyértelmű konfigurációs hibával leáll. A felület nem helyettesíti a generálást statikus személyes történettel.

Az érvényes kulcs és a modell elérhetősége önmagában nem igazolja az aktív API-kreditegyenleget. `credit_balance_exhausted`, `insufficient_quota` és számlázási kerethibák esetén az alkalmazás `AI_QUOTA_EXHAUSTED` hibát ad, és nem ismétli automatikusan a kérést. Az átmeneti hálózati, 429-es rate limit és 5xx hibák legfeljebb két újrapróbálást kapnak; hosszú `Retry-After` esetén korai ismétlés helyett a hiba visszatér. Forrás: [OpenAI hibakódok](https://developers.openai.com/api/docs/guides/error-codes).

## Web környezet

A gyökér `.env` szerver- és workerbeállítás. Az `apps/web/.env.local` fájl kizárólag az alábbi sorokat tartalmazza:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

A Next.js ezeket beépíti a kliensbe. Szerverkulcsot vagy adatbázis-jelszót soha ne írj ide.

## Nyelvválasztás

A termék kizárólag angol felületet és angol történeteket ad; a nyelvválasztó és a régi magyar életek elrejtve. HU-cookie/Accept-Language mellett is angol a felület és az API-üzenet. Új v1/v2 élet és v2 draft kérésben kizárólag `locale: en` engedett. A meglévő magyar adatok exportálhatók, tartalmuk és immutable nyelvük változatlan. A nyelvi regiszter/katalógus megmarad későbbi bővítéshez. [Aktív nyelvi policy](LOCALIZATION_HU.md), [angol béta és visszajelzés](ENGLISH_RELEASE_PLAN_HU.md), [éles telepítés előkészítése](DEPLOYMENT_HU.md).

## A felhasználó által megadott kulcsfájl

A korábbi `env/supabase_keys.txt` és `env/openai_key.txt` fájlokat a fejlesztés során a projektkönyvtáron kívülre, `%LOCALAPPDATA%\FutureFlow\secrets` mappába mozgattuk. A fájlok és a titkos gyökér `.env` öröklött Windows ACL-je tiltott, hozzáférésük az aktuális felhasználóra korlátozott. A kulcsfájlok tartalma nem kerül a repóba vagy az alkalmazásnaplóba.

A `.gitignore` minden `.env*` fájlt és az `env/` mappát kizárja, az érték nélküli `.env.example` kivételével. A kulcsfájl nem volt Git-commitban. Új titkot a védett titokmappában vagy a helyi `.env` fájlban adj meg; chatbe ne másold.

## Ellenőrzött határok

A tiszta telepítés, típusellenőrzés, build és lokális PostgreSQL-kompatibilis tesztek kulcs nélkül is futtathatók. A valódi Supabase Auth, DB-hálózat és OpenAI-generálás csak a szükséges beállítások után ellenőrizhető.

2026-10-03-i állapot: a megadott projektben a 001 foundation és 002 content_locale migráció is lefutott. A közvetlen PostgreSQL-kapcsolat az official Supabase CA-val, teljes TLS-ellenőrzéssel működik; a publikus Auth-konfiguráció elérhető. Személyes profilt vagy valódi Auth-fiókot az ellenőrzés nem hozott létre. Az OpenAI-kulcs biztonságosan beállítva, a hitelesítés és a konfigurált modell elérhetősége ellenőrizve. Az API-kredit feltöltése után valódi AI-események, történetfejezetek és alternatív életág készültek. Ez a korábbi ellenőrzés állapota. 2026-10-04-re a szerveroldali admin kulcs védett helyen beállítva; 001–007 alkalmazva, valódi szintetikus jelszavas Supabase-belépés és Auth/DB-törlés sikeres. Email-kézbesítés nem volt része a próbának.

## Valódi AI-próba, korlátozott költséggel

`pnpm smoke:ai` kitalált profilból valódi OpenAI-válaszokkal futtatja az esemény → történet → ellenőrzés folyamatot, majd egy döntésből új életágat készít. A PostgreSQL-adatbázis helyi PGlite példány; a próba nem készít Supabase Auth-fiókot és nem ír személyes adatot a Supabase-ba.

További profilok: `pnpm smoke:ai creative` és `pnpm smoke:ai career-change`. Ezek a közeli kapcsolatok nélküli tanulási cél, illetve a költözést kerülő, nagy biztonságigényű pályaváltás esetei. A nyelv második argumentum: `pnpm smoke:ai family en` angol, `pnpm smoke:ai family hu` magyar. Argumentum nélkül a történeti teszt magyar marad; az aktuális termék angol kiadásához explicit `en` szükséges. A HU CLI csak külön kutatási kompatibilitás, nem visszakapcsolt magyar termék. Az angol riport külön `cases/family-en` mappába kerül. Egy időben egy próbát futtass.

A közös `.local/ai-smoke/usage.json` napló minden futtatás fogyasztását megőrzi. A próba alapértelmezett teljes kerete 1 USD; a `SMOKE_BUDGET_USD` változóval legfeljebb 5 USD engedhető. A határ a napló korábbi hívásait is tartalmazza; az [aktuális összes fogyasztás](STATUS_HU.md) már meghaladja az 1 USD alaplimitet. Új engedett próbához az 5 USD összkereten belüli explicit limit kell, nem futtatásonként új keret. A következő generálás előtt az API bemeneti tokenszámlálója és a maximális kimenet alapján foglal keretet. Ismeretlen fogyasztású, megszakadt kérésnél a teljes foglalás megmarad.

Az árbecslés 2026-10-02-án ellenőrzött standard díjakat használ: Sol esetén 2 USD/M bemenet, 0,10 USD/M cache-olvasás, 2,50 USD/M cache-írás, 10 USD/M kimenet; Luna esetén rendre 0,10 / 0,01 / 0,125 / 0,50 USD/M. Minden hívás saját modelljének árával számol; a gondolkodási token a kimenet része, nem kerül kétszer elszámolásra. Más modell vagy hosszú kontextus esetén a próba megáll, amíg nincs hozzá megfelelő árbeállítás. Az összeg tokenszám alapján számolt becslés, nem számlázási egyenleglekérdezés. Források: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [bemeneti tokenszámlálás](https://developers.openai.com/api/docs/guides/token-counting).

A történetek és részletes riportok a `.local/ai-smoke` mappában vannak. A diagnosztikai válaszok kizárólag szintetikus tesztadatok; az API-kulcs és a kérés fejlécei nem kerülnek a naplóba. Hibaválaszból csak a kód és típus tárolódik. Ezek a helyi fájlok Gitből kizártak. A generálási hiba nem indít automatikus teljes újragenerálást.

Az alkalmazás AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD pozitív keretet igényel; a .env.example értékei 0, ezért új generálás alapból letiltott, meglévő pozitív DB-limit mellett is. AI_PROJECT_INITIAL_SPENT_USD a kezdeti fejlesztői fogyasztást viszi át az első DB-számlába. Létrejött számla limitjét/spent értékét env-változás nem írja át: külön ops-feladat. Helyben AI_EXPERIMENT_LEDGER_PATH a közös .local/ai-smoke/usage.json abszolút útvonala, SMOKE_BUDGET_USD=5 mellett a worker és smoke ugyanazt az összkeretet védi. Produkcióban nincs helyi experiment path.

V2 fizetett próba: pnpm smoke:life en 3 gpt-6.1-sol vagy hu / gpt-6-luna, mindig a meglévő naplót folytatva. Összesített metrika: pnpm metrics:private. Fióktörlési helyreállítás: pnpm privacy:recover, majd csak kért törlés UUID-jával; [runbook](ACCOUNT_DELETION_RUNBOOK_HU.md). 001–007 migráció már alkalmazva; új környezetben pnpm db:migrate az összes additív migrációt végrehajtja.

## Üzemeltetés

A `main` ágra történő push nem jelent nyilvános deployt. Az API alapértelmezetten localhostra köt. Más hoston az API_PORT, WEB_ORIGIN és a publikus API-URL változókat állítsd be; reverse proxy előtt az IP-alapú rate-limit proxybeállításait külön ellenőrizd.

Nyilvános indulás előtt végleges adatkezelési tájékoztató, retention/backup szabályok, incidenskapcsolat, Supabase/OpenAI adatáramlás és AI angol szerkesztői ellenőrzés szükséges. A használói minőségmérés a korlátozott béta után történik; az előzetes kézi EN/HU kapu felülírva.

## Claude audit és külön költségkeret

ANTHROPIC_API_KEY csak a védett gyökér .env fájlban, soha NEXT_PUBLIC_* mezőben. Az eredeti Claude_API_KEY.txt a védett %LOCALAPPDATA%\FutureFlow\secrets mappába került. A .env.example csak üres kulcsmezőt tartalmaz.

CLAUDE_EXPERIMENT_BUDGET_USD=5 legfeljebb 5 USD összesített kutatási keret, saját .local/claude-audit/usage.json és paid-run.lock mellett. A korábbi fogyasztás megmarad, új checkout/futás nem ad új keretet. Ettől külön OpenAI-napló/DB-limit érvényes; a Claude értékelő nem módosítja a működő worker modelljeit.

pnpm build:packages után pnpm evaluate:claude count ingyenes counter. A többi mód ténylegesen költhet, csak a megmaradt guard-keretből; meglévő azonos esetet új fizetés nélkül olvas. [Pontos módok, függőségek, token/cache/limit mérés és költség](CLAUDE_MODEL_EVALUATION_HU.md). A tests/fixtures/claude-v2 kizárólag szintetikus canont/történetet tartalmaz; saját felhasználói exportot ne helyettesíts be.

## Privát béta ellenőrzése

`pnpm smoke:auth --run` valódi szintetikus, előre megerősített tesztfiókokat hoz létre, OpenAI-időszakot/folytatást/forkot generál, exportál, majd törli őket. Emailt nem küld. Fizetett próba: az eredeti `.local/ai-smoke/usage.json` 5 USD keretét és DB-projekt/user őrét használja; ne nullázd a naplót. A `--run` elhagyása nem indít próbát. Privát bizonyíték `.local/auth-smoke`, Gitből kizárva.

`pnpm feedback:report` privát kategória/szándék darabszámokat, `pnpm metrics:private` a [session-metrikákat](BETA_FEEDBACK_AND_METRICS_HU.md) mutatja; egyik sem generál AI-tartalmat. [Későbbi Contabo-beállítás](DEPLOYMENT_HU.md).

A Contabo üzemeltetői kulcsa és hostpinje checkouton kívüli védett titokmappában van; jelszavas SSH már tiltva. [Belépési parancs és előkészítési állapot](CONTABO_PREPARATION_REPORT_HU.md). A fejlesztői `.env` nem másolható fel éles konfigurációként; a későbbi `/etc/alterward/runtime.env` külön cél-Supabase és éles keret mellett készül.

## Shared S0 — alapból kikapcsolva

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). SHARED_CONTEXTS_ENABLED/SHARED_FRIEND_ENABLED/SHARED_CONNECTED_ENABLED/SHARED_WORLD_ENABLED mind false, a szerver csak true/false értéket fogad el. A normál helyi felület nem mutat AI nélküli Shared demót. S3 release gate előtt nem aktiváljuk. Az elkülönített API-tesztek saját, nem produkciós kulcsot és megbízható szerveroldali tier-fixture-t használnak; kliens fizetős override nincs.

Új környezetben pnpm db:migrate 001–010-et alkalmaz, checksumos tranzakcióval. A fejlesztői DB-n 001–010 alkalmazva/ismétléssel ellenőrizve; az IPv6 direct kapcsolatot a felhasználó megadott Session poolerével váltottuk ki. IPv4 helyi hálózatnál Supabase Connect → Session pooler kapcsolatot másolj; hostname/index és postgres.PROJECT-REF username a dashboardból, password percent-encode, DATABASE_SSL=true és verified CA ellenőrzés megmarad. Credential csak védett .env, sem chat/Git/log. [Supabase kapcsolódási útmutató](https://supabase.com/docs/guides/database/connecting-to-postgres). A későbbi Contabo-konfiguráció ettől külön.

## Shared S1 technikai ellenőrzés

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). Nem szükséges új migráció vagy kulcs; a feature false marad. `pnpm test` az új domain/persistence/API teszteket is futtatja. Canon-candidate csak trusted server/test boundary, nincs HTTP-s fixture vagy történetgenerátor. Új read/intent/resolve endpointok kizárólag bekapcsolt izolált tesztkonfigurációban; határidő és participation-option ID szerverparaméter. Valódi provider/job/lease beépítés S2.

## S2 Shared beállítás — továbbra kikapcsolva

A négy Shared flag false marad; nincs Connections/UI release. API és worker ugyanazt a context/friend kapcsolót kapja a Compose-ban, az invite signing secret kizárólag API. `SHARED_GENERATION_DAILY_LIMIT=3`, `SHARED_GENERATION_CONCURRENT_LIMIT=1` initiating-user Shared quota; pozitív entitlement nem ad AI-allowance-t. `SHARED_DECISION_DEADLINE_SECONDS` üres/null → minden eligible válasz szükséges; explicit 60–604800, 48h még javaslat. A sample CLI az eredeti 5 USD naplóhoz kapcsolódik, futásonként max0.20 USD foglalással és létező minta felülírásának tiltásával. A minták már elkészültek, beállításhoz nem kell új paid smoke. [S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes/time szelet és őrzött AI-próba

010 alkalmazva/ismételve, 39 schema és 279 helyi teszt. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. A pnpm smoke:shared:personal timeline és pnpm audit:shared:claude külön fizetett, egyszeri szintetikus eset; meglévő minta/attempt blokkolja az új hívást. Nem nullázunk ledger/lock fájlt. Külön OpenAI és Claude 5 USD keret, éles allowance nulla; [eredmények és parancskorlátok](SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## Kétfiókos Shared integráció ellenőrzése

`pnpm smoke:shared:auth --preflight`: valódi saját szintetikus Auth/DB, explicit technikai fixture-output, nulla fizetett AI. A `--run` és `--refined` egyszeri fizetett eset már lezárult; meglévő attempt/minta blokkolja a megismétlést. Napló/attempt nem törölhető új paid próba indításához. `--cleanup`, `--cleanup-refined`, `--cleanup-preflight` kizárólag saját provenance-ellenőrzött szintetikus manifestet takarít. A normál feature flag-ek false maradnak. [Parancskorlátok, eredmény és költség](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).

A review-job aktiválásához API és worker ugyanazt a `PUBLIC_REVIEW_JOBS_ENABLED=true`, pozitív közös `AI_PROJECT_BUDGET_USD`/`AI_USER_BUDGET_USD` konfigurációt kapja. A projekt/user DB-limitek korábbi működése változatlan; konfigurációemelés nem növeli automatikusan a már tárolt allowance-t. Helyi fizetett kísérlet csak a közös abszolút `AI_EXPERIMENT_LEDGER_PATH` és az összesített, legfeljebb 5 USD guard mellett indulhat. Alap `PUBLIC_REVIEW_DAILY_LIMIT=5`, egy pending review/user. Normál és deploy példa tiltott marad; API-flag önmagában nem futtat worker-hívást.


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).

A kurátori beküldés az API `PUBLIC_CURATION_ENABLED=true` flagjével külön aktiválható, amikor van trusted kezelő. Nem aktivál AI-t vagy publikálást. Operatori parancs/ACL/explicit döntésfájl: [útmutató](PUBLIC_TEXT_CURATION_REPORT_HU.md#kezelői-használat). Alap false; az operatori opt-in csak a parancs környezetében szükséges.


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).

A saját szcenárió-előkészítő API külön `SCENARIO_VERSIONS_ENABLED=true` beállítással próbálható. Az indítás normál, fizetett AI-generálást kér: csak kijelölt projekt/user allowance és worker mellett használható. Sablonmentés/olvasás nem indít AI-t. Alap false; [strict kérések és kapuk](SCENARIO_VERSION_REPORT_HU.md#api-verzió-és-adatkezelés).
