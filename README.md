# alterward

OpenAI-val generált, tartósan mentett, folytatható és elágaztatható alternatív életek, tervezett kurált Official Lives és önként publikált közösségi életutak. Kizárólag angol indulás, magyar elrejtve, 18+ web; a rövid időszakokon át folytatható személyes szimuláció és az arra épülő Discovery, valamint a tervezett privát Shared Context az aktív fejlesztési cél.

A termék neve **alterward**. A GitHub-repó és a projektkönyvtár továbbra is `Muzsy/future_flow`, a meglévő belső `@future-flow/*` csomagnevek és v1 sémaazonosítók kompatibilitási okból megmaradnak.

A privát v2 mag 12 lépéses angol onboardingból hat hónapos valódi AI-történetet készít, majd aktuális választást, ugyanazon ág folytatását és külön történeti elágazást kínál. A v1 tízéves archívum megmarad. [Megvalósítás és ellenőrzött határok](docs/V2_IMPLEMENTATION_REPORT_HU.md), [valódi Auth/AI és privát béta](docs/BETA_IMPLEMENTATION_REPORT_HU.md).

Az alkalmazás valódi OpenAI API-t használ az eseményekhez, a történethez és a történet ellenőrzéséhez. A működő alkalmazásban nincs AI nélküli demo vagy mock mód. A tesztek elkülönített tesztadatokat és teszthelyettesítőket használnak.

A [külön Community Publication/Confirm](docs/PUBLICATION_CONFIRM_REPORT_HU.md) és angol public/unlisted olvasó elkészült, default-off kiadási kapuval. Official eredetengedély, valódi AI seed, Discovery és public fork következik; Contabo-telepítés még nincs.

## Indítás

Node.js 24 és pnpm 11.19.0 szükséges.

```powershell
pnpm install --frozen-lockfile
# A .env.example alapján töltsd ki a helyi .env fájlt.
# A NEXT_PUBLIC_* beállítások az apps/web/.env.local fájlba is kerüljenek.
pnpm build:packages
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3000 · API: http://localhost:4000 · OpenAPI: http://localhost:4000/api/openapi.json

A Supabase-projekt, az OpenAI-kulcs és a kiválasztott modellek beállítása az éles generálás feltétele. Részletesen: [helyi beállítás](docs/SETUP.md).

## Ellenőrzés

```powershell
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
pnpm verify:infra
```

Az adatbázistesztek PGlite-ba töltik mind a tizennyolc alkalmazott PostgreSQL-migrációt. Ellenőrzik a profilverziókat, tulajdonosi jogosultságokat, idempotenciát, újraindítás utáni folytatást, elágazást, közvetlen hozzáférés tiltását és a teljes fiókgráf törlését. Nem módosítják a Supabase-projektet.

A `verify:infra` a helyi környezet valódi adatbáziskapcsolatát ellenőrzi, és a hiányzó szolgáltatói kulcsokat értékük kiírása nélkül jelzi.

A `pnpm smoke:ai` valódi OpenAI-kérésekkel ellenőrzi az alapforgatókönyv, a történetellenőrzés és egy új életág generálását. Kitalált profilt és elkülönített PGlite-adatbázist használ, Supabase Auth-fiókot nem hoz létre. A próba API-kreditet használ; eredménye a Gitből kizárt `.local/ai-smoke` mappába kerül.

## Szerkezet

- `apps/web`: Next.js angol felület; profil, életágak, történet, idővonal, összehasonlítás, adatkezelés és privát visszajelzés. A nyelvregiszter/katalógus későbbi bővítéshez megmarad.
- `apps/api`: NestJS REST API; Supabase-hitelesítés és minden erőforrásnál tulajdonosi ellenőrzés.
- `apps/worker`: tartós háttérfeladatok feldolgozása, valódi AI-generálás és ellenőrzés.
- `packages/contracts`: az egységes Zod-sémák, TypeScript-típusok és angol/magyar kérdőív, nyelvregiszter, lokalizált API-hibák.
- `packages/core`: determinisztikus állapotváltozások, időrend és domain-validátorok.
- `packages/ai`: OpenAI Responses API és verziózott promptok; külön szerveroldali Claude-értékelő.
- `packages/database`: PostgreSQL-elérés, tranzakciók, profilverziók, idempotencia és feladatok.
- `database/migrations`: ellenőrzőösszeggel követett SQL-migrációk.

## Dokumentáció

A [dokumentációs központ](docs/README.md) a két stratégiai tervet, az új Shared Context forráscsomagot, a frissített 21 témadokumentumot, a [követelménymátrixot](docs/REQUIREMENTS_TRACEABILITY_HU.md) és a [közös megvalósítási státuszt/AI-keretet](docs/STATUS_HU.md) fogja össze. A `docs/alter_jovo_docs` az aktív 0.2 témacsomag; az eredeti v0.1 és manifest változatlan másolata a `docs/archive/alter_jovo_v0_1` mappában, a ZIP az eredeti helyén marad. V2 tárolás/API/worker, rövid élet/folytatás/memória és projekt/user költségőr integrált, privát public-előnézeti alap, szerkeszthető külön copy, ingyenes mezőszintű ellenőrzés és AI-review megjelenítése kész. Valódi szintetikus Auth/AI HTTP- és böngészős próba, Auth/DB-törlés és kontrollált recovery sikeres; privát feedback/session-mérés kész. Backup/restore, valódi használói béta és Discovery/publishing/public fork még nyitott.

- [V2 megvalósítás, valós AI-mérés és határok](docs/V2_IMPLEMENTATION_REPORT_HU.md)
- [Privát másolat szerkesztése és Privacy/Content Preview](docs/PUBLIC_PREVIEW_EDITOR_REPORT_HU.md)
- [Publikálás privát előnézeti alapja](docs/PUBLIC_DRAFT_FOUNDATION_HU.md)
- [Emberi értékelés és pilot](docs/HUMAN_EVALUATION_AND_PILOT_HU.md)
- [Pozicionálás és célmeghatározás — stratégiai alap](docs/PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md)
- [Nyilvános életutak, Discovery és közösségi specifikáció](docs/PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md)
- [Publikálás és Discovery — megvalósítási terv](docs/PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md)
- [V2 időszak- és tényállapot-szerződés](docs/V2_SIMULATION_CONTRACT_HU.md)
- [Shared Context — közös AI-események, személyes hatások és S0–S7 terv](docs/SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md)
- [Változatlan Shared Context ZIP és kibontott specifikáció](docs/plans/README.md)
- [Aktív termék- és megvalósítási terv](docs/PRODUCT_PLAN_HU.md)
- [Következő fejlesztési lépések — végrehajtási sorrend](docs/NEXT_STEPS.md)
- [Jelenlegi implementáció és elfogadott döntések](docs/IMPLEMENTATION.md)
- [Beállítás és kulcskezelés](docs/SETUP.md)
- [Többnyelvű felület és AI-történetek](docs/LOCALIZATION_HU.md)
- [Korábbi valódi AI-próba és annak határai](docs/AI_VALIDATION.md)
- [Feladatonkénti modellválasztás és mért költségvizsgálat](docs/AI_MODEL_ROUTING_HU.md)

Az API-kulcsok, `.env` fájlok és az `env` mappa nem kerülnek a Gitbe. Kliensoldalra kizárólag a `NEXT_PUBLIC_*` változók kerülhetnek.

Külön Claude-kutatás és külső történetaudit elkészült: [modellek, token/cache/effort/limit és ár/érték](docs/CLAUDE_MODEL_EVALUATION_HU.md), [EN/HU auditori észrevételek](docs/examples/CLAUDE_EXTERNAL_AUDIT_HU.md). ANTHROPIC_API_KEY kizárólag védett szerveroldali .env-ben. pnpm evaluate:claude count ingyenes; paid módok a külön Claude 5 USD naplóját folytatják. A termék workerének OpenAI alapmodellje változatlan. Aktuális automatikus tesztkészlet: 311, fizetett API nélkül.

Az induló kiadás kizárólag angol felületet és angol történeteket ad; magyar elrejtve. AI szerkesztői ellenőrzés és korlátozott béta, majd használói visszajelzés alapján javítunk. [Indulási terv](docs/ENGLISH_RELEASE_PLAN_HU.md), [Contabo előkészítése](docs/CONTABO_PREPARATION_REPORT_HU.md); éles deploy nincs. A [teljes Linux CI](https://github.com/Muzsy/future_flow/actions/runs/37262177593) 279 teszttel, 39 séma-drifttel, image-builddel és izolált web/API/worker/Caddy futással sikeres: 001–010 és ismétlés, verified TLS/HTTPS, korábbi Shared-versenyek és új késői resolution/own memória/konkurens choice/törlés proof. A [S3 riport](docs/SHARED_CONTEXT_S3_REPORT_HU.md) a pontos kiadási határt rögzíti.

`pnpm smoke:auth --run`: valódi szintetikus Supabase-fiókok, OpenAI, export és törlés; fizetett, a meglévő 5 USD naplóból. `pnpm feedback:report` és `pnpm metrics:private`: AI-hívás nélküli privát összesítések. [Új angol történet és audit](docs/examples/AI_BETA_ENGLISH_STORY.md).

[Teljes dokumentáció-felülvizsgálat](docs/DOCUMENTATION_REVIEW_HU.md): friss státuszok, terv és API-leírás, változatlan források/archívum/minták, ellenőrzött hivatkozások és manifest.

2026-10-04: Shared Context S0 contract/core, 008/009 tárolás és social/entitlement/invite API elkészült, 36 új fizetés nélküli regresszióval; feature kikapcsolva. Fejlesztői Supabase 001–009 alkalmazva, három valódi szintetikus Auth-fiókos foundation HTTP/export/törlés és takarítás sikeres. [S0 megvalósítás és korlátok](docs/SHARED_CONTEXT_S0_REPORT_HU.md). S1 canon/intent/pending memória és S2 Shared OpenAI/job/fair worker implementált; [S2 riport](docs/SHARED_CONTEXT_S2_REPORT_HU.md) és [angol Shared minta](docs/examples/AI_SHARED_FRIEND_ENGLISH_REFINED_SAMPLE.md). Következő helyi szelet S3; valódi Shared AI S2, személyes integráció/Connections és biztonság S3, első friend release ezután. Public P09–P13 megmarad; Contabo és a két megőrzött AI-keret változatlan.

2026-10-04: [Shared S1 friend motor](docs/SHARED_CONTEXT_S1_REPORT_HU.md) implementált kikapcsolt feature mögött: valódi saját választás, egyszeri lezárás/pending memória, safe history/own export és lifecycle cancellation. 36 új regresszió, összesen 231 teszt; a teljes check/main CI bizonyítéka a riportban. AI nélküli termékmód továbbra nincs.


2026-10-05: [S3 személyes integráció és időkezelés](docs/SHARED_CONTEXT_S3_REPORT_HU.md) implementált: későn lezárt közös esemény a következő saját AI-fejezet előzménye, korábbi fejezet/job változatlan; own memória, fork/export/törlés és kompatibilis havi anchor. 010 alkalmazva, 279 teszt/39 séma. [Új angol minta](docs/examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md) és [Claude-audit](docs/examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md). S3 UI/privacy/Auth kapu még nyitott, Shared kikapcsolva.


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](docs/SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## S3 Connections/safety lezárási bizonyíték — 2026-10-05

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37303841122) (`9e3c9c5`) verify és container sikeres: 297 teszt/26 fájl, teljes formázás/típusellenőrzés/API/worker/Next build, 42 séma-drift. Izolált valódi PostgreSQL/TLS mellett 001–012 migráció és ismétlés, korábbi S0–S3 proof, former-member queued/running payload-megtartás, konkurens kétoldali block, lease-cancellation, restart utáni moderation hold és privát report cascade/audit detach ellenőrzött. Web/API/Caddy HTTPS és üres worker-leállítás sikeres; nincs paid AI vagy valódi CI-credential. Ez nem Contabo-élesítés vagy teljes friend Auth-release.


## S3 privacy/Auth és P09 adatvédelmi kapu — 2026-10-05

2026-10-05 · Runtime `fcdd1416fe014567a366a7112ea941140a91dbdd`: [CI](https://github.com/Muzsy/future_flow/actions/runs/37318643044) verify és container sikeres. 304 teszt/27 fájl, formázás, típusellenőrzés, API/worker/Next production build és 42 változatlan séma. Izolált PostgreSQL/TLS mellett 001–013 és ismétlés, Shared privacy projection, régi személyes input cancellation, friss retry fizikai törlésen át megőrzése, korábbi S0–S3 slot/intent/lease/block/moderáció/cleanup versenyek sikeresek. Web/API/Caddy verified HTTPS/DB TLS, üres queue és közvetlen Node worker tiszta 0-s leállás, nulla paid AI és valódi CI-kulcs. Nincs Contabo-deploy; aktív AI-job drain, backup/restore és terhelésmérés még nincs igazolva. [Részletes megvalósítás és kiadási korlátok](docs/SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md), [új valódi angol AI-minta](docs/examples/AI_SHARED_AUTHENTICATED_ENGLISH_SAMPLE.md). Normál Shared flag-ek false; helyi fejlesztés, Contabo később.


## 2026-10-05: P09 AI-ellenőrzés és megvásárolt domain

Aktuális runtime `14caf62`: [main CI](https://github.com/Muzsy/future_flow/actions/runs/37328921024) verify és container sikeres, 311 teszt/27 fájl, teljes build és 44 séma drift nélkül. Izolált PostgreSQL/TLS-en egyszeri review-start/reuse, forrásváltozás/deleting marker, account cascade és RLS/client tiltás; 001–014 és ismétlés, a korábbi S0–S3 próbák és verified HTTPS/üres worker-stop rendben. Az alterward.com Caddy-minta hálózat nélkül parszolva; nincs élő DNS/TLS/Contabo-változás vagy paid CI-AI. [Részletes bizonyíték és következő kapu](docs/PUBLIC_AI_REVIEW_REPORT_HU.md).

[Privát AI-pre-screen](docs/PUBLIC_AI_REVIEW_REPORT_HU.md): kizárólag az előkészített angol copy, immutable hash/revision/policy és receipt, egyszeri operatori futás és saját olvasási API, export/törlés. Egy valódi Sol-negatív kontroll öt privacy-jelzést adott; nincs publikálási/Official jóváhagyás. A 014 migráció a fejlesztői Supabase-on alkalmazva és ismételve. Az alterward.com aktív Cloudflare-domain; a DNS még üres, TLS Full, éles bekötés nem történt. Következő: Privacy/Content Preview és curator/Publication/Confirm, majd P10–P13; S3 retention és S4–S7 továbbra megmarad.

P09: [AI-review queue](docs/PUBLIC_REVIEW_JOB_REPORT_HU.md) és [kurátori text-only ellenőrzés](docs/PUBLIC_TEXT_CURATION_REPORT_HU.md) implementált. Publication/Confirm/Official seed és Discovery még fejlesztendő.

P09: [ScenarioVersion foundation](docs/SCENARIO_VERSION_REPORT_HU.md) elkészült; a sanitized döntési checkpoint és teljes kiadási review következik.

P09: [Sanitized döntési checkpoint foundation](docs/PUBLIC_FORK_CHECKPOINT_REPORT_HU.md) kész. Következő a teljes strukturált előnézet és annak külön ellenőrzése.

P09: [Angol döntési állapot előnézet és leírásszerkesztő](docs/PUBLIC_FORK_PREVIEW_REPORT_HU.md) kész, 375 helyi teszt/32 fájl és valós Auth-böngésző/DB cleanup sikeres. Következő a szöveg és kiválasztott checkpointok immutable közös tartalomcsomagja, teljes-scope ellenőrzés és kiadási kapuk.

P09: [Teljes angol tartalomcsomag és explicit döntésipont-lista](docs/PUBLIC_CONTENT_BUNDLE_REPORT_HU.md) kész. Következő a teljes-scope AI/curator, majd kiadási kapuk.

P09: [Teljes tartalom AI-job, angol eredménypanel és egyszeri költségvédett vizsgálat](docs/PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md) kész. A külön teljes-scope curator is elkészült; következő Publication/Confirm.

P09: [Teljes történet és kiválasztott checkpointok külön kurátori ellenőrzése](docs/PUBLIC_CONTENT_CURATION_REPORT_HU.md) kész; privát eredmény, új AI-költség nélkül.


## 2026-10-06: Community Publication és külön Confirm

[Angol kiadási előnézet és explicit tulajdonosi megerősítés](docs/PUBLICATION_CONFIRM_REPORT_HU.md) elkészült: csak a teljes AI+curator által ellenőrzött aktuális példány; immutable public/unlisted olvasás, anonymous/handle credit, visszavonás/linkcsere és trusted moderáció, export/cascade. Kiadás alapból kikapcsolva, indexelés/fork még tiltott; Official eredetengedély/ScenarioVersion teljes kiadási review/valódi AI seed következik. A korábbi dátumozott riportok bizonyítékát az aktuális státusz egészíti ki; a teljes P/S-terv és ops kapuk megmaradnak.

Publication runtime `bad1b816`: [main CI](https://github.com/Muzsy/future_flow/actions/runs/37457083884) verify/container sikeres, 428 teszt/36 fájl, teljes build, 81 séma drift nélkül; izolált PostgreSQL/HTTPS 001–022 és ismétlés, párhuzamos Confirm, linkcsere, immutable snapshot, moderáció/törlés/export/RLS. Új paid AI 0; nincs éles Contabo-aktiválás.


## 2026-10-06: teljes ScenarioVersion review és külön sablon-eredetengedély

[Teljes sablonvizsgálat és trusted Official SCENARIO source](docs/SCENARIO_RELEASE_REVIEW_REPORT_HU.md) elkészült: aktuális angol template/input/report/receipt kötés, külön kurátor és explicit fictional-source/rights grant, terminal revoke, export/cascade/deletion recovery. Helyi teljes check 441/37, 89 séma, 001–023 alkalmazva/ismételve, 50 aw_/50 RLS; két valódi Sol-review 0,0093245 USD becslés, tényleges Auth/DB cleanup sikeres. A `0d6fe351` runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37498444429) verify/container egyaránt sikeres, 001–023 és ismétlés/teljes scenario-review/curator/source concurrency/export/cascade/RLS/TLS/HTTPS, paid CI-AI 0. Ez nem Official LIFE/publication/fork/Discovery engedély; a régi Community Publication kész. Következő a tényleges generálási lánc eredetengedélye és külön Official kiadási projekció, majd kis valódi angol seed. A teljes P/S-terv és operatív kapuk megmaradnak.


## 2026-10-06: konkrét Official LIFE eredetengedély

[Előzetes trusted start és teljes AI/canon/választási receipt-engedély](docs/OFFICIAL_LIFE_PROVENANCE_REPORT_HU.md) kész. Normál személyes AI-job/worker, exact full-content curator és accounted provider proof, külön jog/minőség/source grant, visszavonás/export/cascade/recovery; default OFFICIAL_LIFE_OPERATOR_ENABLED=false, nincs grant HTTP-route vagy public olvasási jog. Helyi check 453/38, 96 séma, Supabase 001–024 és ismétlés/52 RLS; új runtime CI még ellenőrizendő. Új paid AI 0, korábbi két 5 USD keret változatlan. Következő külön Official kiadási projekció/Confirm, valódi angol seed/Claude-auditor és P10–P13. P01–P13/S0–S7 és az operatív kapuk megmaradnak.
