# alterward

OpenAI-val generált, tartósan mentett, folytatható és elágaztatható alternatív életek, tervezett kurált Official Lives és önként publikált közösségi életutak. Kizárólag angol indulás, magyar elrejtve, 18+ web; a rövid időszakokon át folytatható személyes szimuláció és az arra épülő Discovery, valamint a tervezett privát Shared Context az aktív fejlesztési cél.

A termék neve **alterward**. A GitHub-repó és a projektkönyvtár továbbra is `Muzsy/future_flow`, a meglévő belső `@future-flow/*` csomagnevek és v1 sémaazonosítók kompatibilitási okból megmaradnak.

A privát v2 mag 12 lépéses angol onboardingból hat hónapos valódi AI-történetet készít, majd aktuális választást, ugyanazon ág folytatását és külön történeti elágazást kínál. A v1 tízéves archívum megmarad. [Megvalósítás és ellenőrzött határok](docs/V2_IMPLEMENTATION_REPORT_HU.md), [valódi Auth/AI és privát béta](docs/BETA_IMPLEMENTATION_REPORT_HU.md).

Az alkalmazás valódi OpenAI API-t használ az eseményekhez, a történethez és a történet ellenőrzéséhez. A működő alkalmazásban nincs AI nélküli demo vagy mock mód. A tesztek elkülönített tesztadatokat és teszthelyettesítőket használnak.

A [külön Community Publication/Confirm](docs/PUBLICATION_CONFIRM_REPORT_HU.md), [Official eredet és kiadás](docs/OFFICIAL_PUBLICATION_REPORT_HU.md), valamint az [első valódi angol AI seed](docs/OFFICIAL_SEED_REPORT_HU.md) elkészült. A háromrészes mintát Sonnet is auditálta, és a public/unlisted kiadást valódi Auth/HTTP-próba ellenőrizte. A rendes kiadási funkciók kikapcsolva maradnak; Discovery/Save/public link alapja kész; public fork következik, Contabo-telepítés még nincs.

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

Az adatbázistesztek PGlite-ba töltik mind a huszonöt alkalmazott PostgreSQL-migrációt. Ellenőrzik a profilverziókat, tulajdonosi jogosultságokat, idempotenciát, újraindítás utáni folytatást, elágazást, közvetlen hozzáférés tiltását és a teljes fiókgráf törlését. Nem módosítják a Supabase-projektet.

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

A [dokumentációs központ](docs/README.md) a két stratégiai tervet, az új Shared Context forráscsomagot, a frissített 21 témadokumentumot, a [követelménymátrixot](docs/REQUIREMENTS_TRACEABILITY_HU.md) és a [közös megvalósítási státuszt/AI-keretet](docs/STATUS_HU.md) fogja össze. A `docs/alter_jovo_docs` az aktív 0.2 témacsomag; az eredeti v0.1 és manifest változatlan másolata a `docs/archive/alter_jovo_v0_1` mappában, a ZIP az eredeti helyén marad. V2 tárolás/API/worker, rövid élet/folytatás/memória és projekt/user költségőr integrált, a teljes publikációs copy-review/curator/eredet/Confirm és az első valódi angol seed kész. Valódi szintetikus Auth/AI HTTP- és korábbi privát böngészős próba, Auth/DB-törlés és kontrollált recovery sikeres; privát feedback/session-mérés kész. Backup/restore, valódi használói béta, Discovery/public fork és a pozitív Official böngészős UI-próba még nyitott.

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

[Előzetes trusted start és teljes AI/canon/választási receipt-engedély](docs/OFFICIAL_LIFE_PROVENANCE_REPORT_HU.md) kész. Normál személyes AI-job/worker, exact full-content curator és accounted provider proof, külön jog/minőség/source grant, visszavonás/export/cascade/recovery; default OFFICIAL_LIFE_OPERATOR_ENABLED=false, nincs grant HTTP-route vagy public olvasási jog. Helyi check 453/38, 96 séma, Supabase 001–024 és ismétlés/52 RLS; a `da9c0118` runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37503358807) verify/container sikeres. Új paid AI 0, korábbi két 5 USD keret változatlan. Következő külön Official kiadási projekció/Confirm, valódi angol seed/Claude-auditor és P10–P13. P01–P13/S0–S7 és az operatív kapuk megmaradnak.


## 2026-10-06: Official LIFE main CI-lezárás

Az új izolált PostgreSQL/HTTPS main [CI](https://github.com/Muzsy/future_flow/actions/runs/37503358807) sikeres a `da9c0118` runtime commiton: 453 teszt/38 fájl, 96 séma drift nélkül, 001–024 és ismétlés; párhuzamos előzetes Official start/grant, teljes kétidőszakos lánc/javítás, technical-receipt és cross-owner deny, terminal revocation/deletion/recovery/export/cascade/RLS; minden korábbi P09/S0–S3 proof, verified TLS/HTTPS és tiszta worker-leállás; paid CI AI 0. A dokumentáció ellenőrzése: 128 Markdown/125 docs, 21 aktív + 21 archivált téma, 96 séma/183 változatlan immutable forrás-, példa-, séma- és migrációfájl; a végleges kiadás előtt minden relatív link és anchor újra ellenőrizve. A 80 stratégiai fejezet, 14 public MVP-elem, 15 Shared téma és 17 forrásellenőrzőösszeg megmarad. OpenAI/Claude guard 2,479813375 / 2,338015 USD, maradék 2,520186625 / 2,661985 USD; új paid AI 0. Következő Official kiadási projekció/preview/Confirm, majd kis valódi angol seed és Claude-auditor/P10–P13. Ez nem Contabo-deploy vagy kész Official seed.


## 2026-10-06: külön Official kiadási másolat

[Exact Official preview/Confirm és immutable publikáció](docs/OFFICIAL_PUBLICATION_REPORT_HU.md) kész; a source grant külön kapu marad. Default OFFICIAL_PUBLICATIONS_ENABLED=false; védett PUBLICATION_LINK_SECRET, külön HMAC-névtér. Public/unlisted olvasó, saját listázás/linkcsere/withdraw, trusted moderáció; source-revoke és fióktörlés tranzakciós hozzáférésmegszüntetése, export/cascade/recovery. 025 alkalmazva/ismételve, 55 RLS, 105 séma; a korábbi 96/001–024 változatlan. Új paid AI 0, valódi seed/Auth/böngészős pozitív próba még feladat. Runtime `9850a6ae` [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres; nem Contabo-deploy. A teljes P01–P13/S0–S7 és ops kapuk megmaradnak.


## 2026-10-06: Official publikáció CI-lezárás

Az új main [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres a `9850a6ae` runtime commiton: 464 teszt/39 fájl, 105 séma drift nélkül, format/types/API/worker/Next production build; izolált PostgreSQL/CA TLS 001–025 és ismétlés, párhuzamos Official preview/Confirm/linkcsere/source-revoke és deletion-reader/recovery/export/cascade/RLS. Minden 71 korábbi P09/Shared proof megmarad, web/API verified HTTPS és worker tiszta leállás, egress tiltva, paid CI AI 0. Dokumentáció: 129 Markdown/126 docs, 21 aktív +21 archivált téma, 105 séma és 193 változatlan immutable forrás/példa/séma/migráció; relatív linkek és anchorok ismét ellenőrizve. OpenAI/Claude guard-maradék 2,520186625 / 2,661985 USD, új paid hívás 0. Következő kis valódi angol többidőszakos seed, Claude-auditor/szerkesztői és Auth/kiadási ellenőrzés, majd P10–P13; a teljes P01–P13/S0–S7 és ops/retention kapuk megmaradnak.


## 2026-10-06: első valódi Official seed

Elkészült az első valódi angol Official seed: 3 hat hónapos AI-időszak, 2 választás, 3 ellenőrzött döntési checkpoint, új Scenario/full-copy review, külön curator/Official eredet és valódi Supabase Auth/HTTP preview/Confirm/public/unlisted olvasó/linkcsere/withdraw/export/próbafiók-cleanup. Sonnet-audit: kánonhű/természetes angol, 0 story finding; 4/4/5/4/4 gépi pontszám. A teljes checker 3 automatikus korlátleírás-hibát talált; a core angol mondatot ad, az új másolat no_findings, a régi blokkolt csomag immutable. 1 fiktív staging seed megmarad P10-hez, rendes feature-ek false. Helyi teljes check 464/39 és production build sikeres; 105 séma/001–025 változatlan; az a5daf8e runtime verify/container [CI](https://github.com/Muzsy/future_flow/actions/runs/37534973955) sikeres. Új 13 OpenAI +1 Claude hívás; guard-maradék 2.254014125 / 2.62877 USD, naplók megőrizve. Pozitív böngészős Official UI és teljes P10–P13/S3-retention/S4–S7/ops/backup/email/éles Contabo kapuk megmaradnak. Következő P10 Discovery és nyilvános moderáció. [Részletes bizonyíték](docs/OFFICIAL_SEED_REPORT_HU.md).


## 2026-10-06: P10 read-only Discovery első szelet

Angol /discover kereső, kategória és Official/Community szűrő, newest lapozás. A rendes Discovery gate false, a felület még nem aktivált béta. 471/40 teljes helyi check; valódi háromfejezetes seed HTTP-keresése, exact reader és unchanged private state/AI naplók sikeres. [Részletes bizonyíték és következő kapuk](docs/DISCOVERY_FOUNDATION_REPORT_HU.md).


## 2026-10-07: Discovery runtime CI-kapu lezárva

A P10 első angol Discovery-szelet runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37537224387), `d5fa97ca460bb042e3b9b6d3c7034887913808bf`, verify/container sikeres: 471/40, formázás/típusok/API/worker/Next build, 108 séma drift nélkül. Valódi izolált PostgreSQL/CA TLS és HTTPS: Official+Community kártyák, literal search/filter, bounded newest lapok, lookup közbeni withdraw, revocation/deleting kapu és privát provenance kizárás; 6 új proof, mind a 71 korábbi Shared/P09 és a teljes Official proof megmarad. 001–025 és ismétlés, default-off HTTP és tiszta worker-leállás, egress tiltva, paid CI AI 0. Valódi seed/Auth/HTTP próba külön szintén sikeres; pozitív böngészős/UI ellenőrzés és Save/Share/OG/Report/moderációs queue/metrikák még feladat. P11–P13/S3-retention/S4–S7 és teljes ops/backup/email/Contabo kapuk megmaradnak.

133 Markdown/130 docs, 21 aktív +21 archív téma, 108 séma és 198 változatlan immutable forrás/példa/séma/migráció; 1500 helyi link, 0 hibás link/anchor. 80 stratégiai fejezet, 14 public MVP-elem, 15 Shared téma, 17 checksum és eredeti ZIP hash változatlan. Új providerhívás 0.


## 2026-10-07: hitelesített Save és public link

Az angol Discovery után a P10 hitelesített, idempotens Save és egyszerű public linkmegosztás elkészült. /saved saját angol lista, 500/fiók korlát, teljes aktuális Official/Community readerkapu; unlisted/private kizárt, withdraw/hide/revoke/deletion után nincs történet a mentésben. 026 FK/RLS, minimális saját export/cascade, két valódi disposable Supabase Auth-fiók és a változatlan háromfejezetes genuine seed HTTP-próbája sikeres. Helyi teljes check 481/41 és production build; 112 séma, régi 108 és 001–025 változatlan; fejlesztői DB 001–026 alkalmazva/ismételve, 56 aw_/56 RLS. Új runtime main CI még ellenőrizendő. Rendes SAVED_LIVES/DISCOVERY/kiadási/Shared flag-ek false; új paid AI 0, OpenAI/Claude guard-maradék 2.254014125 / 2.62877 USD. Következő Report/moderációs queue/warning/abuse guard, OG/index opt-in/cache, kollekció/metrika és pozitív UI-próba; P10 nem teljes. P11–P13/S3-retention/S4–S7/ops/backup/email/Contabo kapuk megmaradnak. [Részletes bizonyíték](docs/SAVED_LIVES_AND_SHARE_REPORT_HU.md).


## 2026-10-07: Report és trusted moderáció

A P10 angol Discovery/Save/public link után hitelesített Report, tartós privát moderációs sor és trusted CLI dismiss/warn/hide/remove elkészült. Kilenc eredeti kategória, user+copy+reason dedup/első details megőrzése, 10 új case/24h, külön saját Settings-notice és explicit publikálási restriction/restoration; bejelentésszám nem rejt automatikusan. 027 RLS/immutable döntés/minimális export/reporter-warning detach/publisher cascade kész. Két valódi Supabase Auth-fiók, genuine seed Report és külön ideiglenes technikai Community CLI-moderáció/export/tényleges cleanup sikeres; valódi seed és AI-naplók változatlanok. Helyi teljes check 491/42 és production build; 117 séma, régi 112 és 001–026 változatlan; fejlesztői DB 001–027 ismételve, 60 aw_/60 RLS. Save/Share 3d49bef verify/container CI sikeres; új Report runtime CI még ellenőrizendő. Normál public/Report/Shared flag-ek false; új paid AI 0, OpenAI/Claude guard-maradék 2.254014125 / 2.62877 USD. Következő metrikák/kollekciók/explicit OG-index-cache és pozitív UI-próba; teljes P10/P11–P13/S3-retention/S4–S7/ops/backup/email/Contabo kapuk megmaradnak. [Részletes bizonyíték](docs/PUBLIC_REPORTS_AND_MODERATION_REPORT_HU.md).


## 2026-10-07: nyilvános aktivitás összesített mérése

P10 Discovery/Save/Share/Report és trusted moderáció után a tartalom nélküli public read/depth/end/share és sikeres Save/Unsave/Report/Publish/owner-withdraw/hide/remove metrika elkészült. Rövid, csak memóriában élő reading UUID, egyszeri signal, UTC napi aggregate, DNT/GPC, 20 perc TTL, flagfüggetlen worker-cleanup, saját export/privát platform-riport; nincs tartós readerprofil vagy automatikus ranking. 028 RLS/cascade és default PUBLIC_METRICS_ENABLED=false. Helyi check 503/43 és production build; 121 séma, régi 117/001–027 változatlan; dev DB 001–028 ismételve, 62 aw_/62 RLS. 31 valódi Supabase Auth/HTTP/PG ellenőrzés és teljes cleanup sikeres, genuine seed és AI-naplók változatlanok. Report 726f7f4 CI verify/container sikeres; új metrics runtime CI még ellenőrizendő. Új paid AI 0, guard-maradék 2.254014125 / 2.62877 USD. Következő kurált kollekciók/explicit OG-index-cache/pozitív UI; teljes P10/P11–P13/S3-retention/S4–S7/ops/backup/email/Contabo kapuk megmaradnak. [Részletes bizonyíték](docs/PUBLIC_ACTIVITY_METRICS_REPORT_HU.md).


## 2026-10-07: kurált nyilvános gyűjtemények

P10 szerkesztett Featured/Community Picks/Turning Points és meglévő Official-lista navigáció elkészült. Exact snapshot/publication/collection revision, idempotens trusted CLI teljes csere, legfeljebb 24 pointer és curated sorrend; minden card teljes live EN/public/Official readerből jön. 029 három RLS-tábla, immutable platform-audit és publisher cascade, PUBLIC_COLLECTIONS_ENABLED=false. Genuine háromfejezetes angol seed egyetlen életként Featured/Turning Points staging-válogatásban; Community Picks üres. Helyi check 513/44/build, 124 séma, régi 121/001–028 változatlan; dev DB 001–029 repeat, 65 aw_/65 RLS. 28 valódi Auth/HTTP/PG/CLI ellenőrzés és actual cleanup sikeres, genuine private export/AI-naplók változatlanok. Metrics ea517bc verify/container CI sikeres; 8ca6231 collection verify/container CI sikeres: 513/44/124, 001–029/repeat és mind a 6 új PG-proof. Új paid AI 0; guard-maradék 2.254014125 / 2.62877 USD. Következő explicit OG-index-permission-cache és pozitív UI, majd P11–P13; Trending/Most Forked/fork/cohort külön kapu. P01–P13/S0–S7/retention/ops/Contabo scope megmarad. [Részletes bizonyíték](docs/CURATED_PUBLIC_COLLECTIONS_REPORT_HU.md).


## 2026-10-07: külön külső engedély, OG és indexelés

P10 explicit külső engedély elkészült: default none, preview/noindex és index+preview; Community own opt-in, Official trusted curator és own revoke. Exact publication hash/revision + permission CAS/immutable audit, teljes live EN/Official reader minden metaadat/kép/sitemap kérésnél. 030 két RLS-tábla, saját export és cascade; PUBLIC_EXTERNAL_EXPOSURE_ENABLED=false. Angol panel, dynamic OG/canonical/robots, 1200×630 code-native PNG és bounded live sitemap, browser/API/CDN no-store. Helyi teljes check 525/45/build, 130 séma; régi 124/001–029 változatlan, dev DB 001–030 repeat, 67 aw_/67 RLS. 33 valódi Auth/production HTTP/PG/CLI ellenőrzés és actual cleanup sikeres; PNG vizuálisan átnézve. Genuine private export és provider ledgers változatlanok, új paid AI 0. 8ca6231 collection verify/container CI sikeres; új 030 runtime CI még ellenőrizendő. Következő P11 snapshot refresh/owner privacy workflow, P12 public fork/scenario personalization, P13 kínálat/quality/usage/release; pozitív interaktív UI és Trending/Most Forked külön kapu. P01–P13/S0–S7/retention/backup/email/Contabo/Cloudflare/éles allowance teljes scope megmarad; folyamatos haladás az élesítésig. [Részletes bizonyíték](docs/EXTERNAL_PUBLIC_EXPOSURE_REPORT_HU.md).


## 2026-10-07: explicit snapshotfrissítés

P11 explicit snapshot refresh elkészült: új teljes AI/curator által ellenőrzött copy + régi aktív példány withdraw egy tranzakcióban, eltérő új slug/token; nincs snapshot-átírás, redirect vagy külső grant-öröklés. Same-owner/same-private-branch és exact old revision/hash/new preview binding, consent, default PUBLICATION_REFRESH_ENABLED=false. Official új exact origin grantet kér. Immutable 031/RLS/own export/cascade, angol külön replacement választás és Confirm. Teljes check 535/46/build, 133 séma, régi 130/001–030 változatlan; dev DB 001–031 repeat, 68 aw_/68 RLS. 25 sikeres valódi kétfiókos Supabase Auth/HTTP/TLS ellenőrzés és actual cleanup, seed export/ledgers változatlan, új paid AI 0. A 030 pontos 63d49f4 CI verify/container sikeres; az új 031 runtime CI még ellenőrizendő. Következő P11 egyetlen élet törlése/owner privacy, P12 public fork/scenario personalization, P13 release; pozitív interaktív UI és retention/backup/email/Contabo/Cloudflare/éles allowance teljes scope megmarad. [Bizonyíték](docs/PUBLICATION_SNAPSHOT_REFRESH_REPORT_HU.md).


## 2026-10-07: külön saját élet törlése

P11 külön egész-élet törlés elkészült: saját life + aktuális branch/revision, gépelt DELETE LIFE, friss verified Auth, pontos idempotens retry. Minden saját ág/fejezet/választás/job/preview/review/kiadás/refresh/token/save/external jog cascade; másik élet és account aktív marad. Az adott élet Shared-tagsága leválik; érintett próza rejtett, dátum/eredmény/canon változatlan, unsafe personal/shared input és lease érvénytelen. A törlés nem nulláz napi kvótát: 032 csak kind/admitted_at, legfeljebb 24h + worker 15m; RLS/immutable/minimal export/account-cascade. Teljes check 544/47/build, 135 séma; régi 133/001–031 változatlan. Dev DB 001–032 repeat, 69 aw_/69 RLS. 26 valódi kétfiókos Auth/HTTP/TLS ellenőrzés és actual cleanup, genuine seed/ledgers változatlan, paid AI 0. A 031 pontos c36abdd CI verify/container és hét PG-proof sikeres; az új 032 runtime CI még ellenőrizendő. Következő P12 public fork/scenario personalization; P11 teljes privacy/retention/pozitív UI, P13 és Shared/backup/email/Contabo/Cloudflare/éles allowance megmarad. [Bizonyíték](docs/SELECTIVE_LIFE_DELETION_REPORT_HU.md).


## 2026-10-07: külön nyilvános fork-hozzájárulás

P12 külön fork-hozzájárulás elkészült: Community tulajdonosi opt-in, Official kurátori engedély és tulajdonosi visszavonás. Az engedély a konkrét ellenőrzött kiadáshoz és revízióhoz kötött; a régi snapshot változatlan, frissítéskor nem öröklődik. Az anonim végpont csak ellenőrzött döntési feliratokat ad, privát azonosítókat nem. A tényleges új privát élet indítása még zárt, ez a következő feladat. Teljes helyi check: 552 teszt/48 fájl/build, 139 séma; dev 001–033 + ismétlés, 71 aw_/71 RLS, 37 valódi Auth/HTTP/CLI/TLS ellenőrzés és fióktakarítás, új paid AI 0. A javított 032 runtime 9a7ecf7 CI verify/container sikeres, hét élet-törlési PG-proof lezárult; az új 033 pontos CI még ellenőrizendő. A teljes P11 privacy/retention, P12 start/personalization/attribution, P13, Shared és üzemeltetési terv megmarad; Contabo élesítés még nem történt. [Bizonyíték](docs/PUBLIC_FORK_PERMISSION_REPORT_HU.md).


## 2026-10-07: saját élet nyilvános döntési pontból

P12 nyilvános, teljesen ellenőrzött döntési pontból külön saját privát élet indítása elkészült. A választás egyszer alkalmazódik, friss saját azonosítók és normál AI-job/kvóta készül; három technikai időszakban megmarad a döntés emlékezete. Az eredeti élet változatlan, Official eredetengedély és élő Shared-tagság nem öröklődik. Visszavonás leállítja az új indításokat; fizikai forrástörlés csak a hivatkozást választja le. Saját élet törlése után a régi kérés nem hozhatja újra létre. Teljes helyi check 560 teszt/49 fájl/build, 143 séma; dev 001–034 és ismétlés, 73 aw_/73 RLS; 50 valódi Auth/HTTP/TLS ellenőrzés és fióktakarítás, új paid AI 0. A 033 33bcd8a verify/container CI sikeres; az új 034 pontos CI és valódi generatív fork-minőség még ellenőrizendő. Scenario személyre szabás, P13, P11 privacy/retention, Shared és üzemeltetési kapuk megmaradnak; Contabo élesítés még nem történt. [Bizonyíték](docs/PUBLIC_FORK_START_REPORT_HU.md).


## 2026-10-07: public-fork valódi AI és belépési útvonal

P12 public-fork engine, három valódi angol AI-időszak és külső Claude-audit kész: nyelv/kánon helyes, 0 finding, 4/5/5/5/4 szerkesztői pontszám. Az eredeti private canon és public reader változatlan; az új élet privát, nem Official. Az olvasás utáni login/signup csak ellenőrzött public útvonalra tér vissza, új fiók külön felnőtt/AI-privacy és költség-hozzájárulást ad; fiókváltás nem küld indítást más felhasználó nevében. Teljes helyi check 563 teszt/50 fájl/build és 144 séma; végső kliensjavítás további két új célzott teszttel/típus/build ellenőrzéssel, 17 valódi Auth/HTTP check és tényleges cleanup. A d38b0e3 034 verify/container CI és nyolc PG-proof sikeres; az új onboarding pontos CI még ellenőrizendő. Új genuine próba 9 OpenAI + 1 Claude hívás: 0,1814238 / 0,031204 USD becslés. Kumulatív guard OpenAI 2,939418375 USD, Claude 2,409600 USD; külön 5–5 USD keretből 2,060581625 / 2,590400 USD marad. Következő Scenario személyre szabás és P13; privacy/retention/Shared/ops, eredeti célállomány és éles név/kontakt/AI-keret/kínálat döntése megmarad. Contabo élesítés még nem történt. [Bizonyíték](docs/PUBLIC_FORK_QUALITY_ONBOARDING_REPORT_HU.md).


## 2026-10-07: jóváhagyott első éles AI-időszak

Az első éles 30 napra jóváhagyott keret 10 USD OpenAI + 5 USD Claude, összesen 15 USD; a felhasználói 0,50 USD közös a két szolgáltató között. A tényleges induláskor kezdődik, nincs automatikus megújítás. Külön időszakos provider-projekt és közös saját számla, tranzakciós előfoglalás, lock utáni DB-óra/lejárat, késői egyszeri elszámolás és megmaradó projektköltés kész; Claude transport technikai DB-guard próbája is sikeres. A régi kutatási naplók és 5–5 USD keretek változatlanok; új paid AI 0, éles aktiválás nincs. Teljes helyi check 578 teszt/52 fájl/types/script-types/build és 144 változatlan schema; az új budget runtime CI még ellenőrizendő. A public-fork minőség/login/consent pontos 4cb911c verify/container CI sikeres: 565/51, 001–034/repeat, nyolc fork-start PG-proof, minden korábbi proof, verified HTTPS/DB TLS és 0 AI. Következő Scenario personalization/P13, továbbra P11/Shared/retention/ops, operator/kontakt és induló kínálat; Contabo-deploy még nem történt. [Részletek](docs/AI_PRODUCTION_BUDGET_HU.md).


## 2026-10-07: Scenario személyre szabás privát alapja

Az éles 30 nap 10 USD OpenAI + 5 USD Claude kerete és a közös user 0,50 USD jóváhagyott; csak tényleges indulástól, nincs automatikus megújítás. A 05e6014 pontos verify/container CI sikeres: 578/52/144, nyolc új valós PG budget-window proof, 001–034/repeat, korábbi proofok és verified HTTPS/DB TLS, 0 AI; éles aktiválás/Contabo-deploy nincs. P12 Scenario személyre szabás privát könyvtári alap kész: saját teljes állapot/cél/korlát, külön forrástéma, exact preview/approval és friss referenciák; három normál technikai időszak/export/törlés ellenőrzött. Public Scenario snapshot/consent, own tartós előnézet, API/UI/start még következik, ezért P12 nem teljes. Teljes helyi check 588 teszt/53 fájl/types/script-types/build, 148 séma (144 korábbi változatlan), új paid AI 0; a foundation commit pontos CI még ellenőrizendő. P13, P11/Shared/retention/ops, operator/kontakt és teljes 50–100 élet/20–30 Scenario cél megmarad. A régi 5–5 USD kutatási keretek és naplók változatlanok. [Részletek](docs/SCENARIO_PERSONALIZATION_FOUNDATION_REPORT_HU.md).


## 2026-10-07: külön public Scenario kiadási API

Az első éles 30 nap 10 USD OpenAI + 5 USD Claude és közös user 0,50 USD jóváhagyott, csak valódi indulástól; nincs automatikus megújítás vagy éles aktiválás. Budget 05e6014 és private Scenario-composition 89a7cf5 pontos verify/container CI sikeres (578/52/144, majd 588/53/148), PG/HTTPS/TLS és 0 AI. P12 külön public Scenario kiadási preview/Confirm, explicit personalization consent, immutable snapshot és anonymous minimális olvasó API, élő teljes source/review/evidence, revoke/withdraw/moderation, export/cascade/RLS implementált. Fejlesztői DB 001–035/repeat, három új üres privát RLS-tábla, normál feature/operator false. Teljes helyi check 600 teszt/54 fájl/types/script-types/build, 154 séma (148 korábbi változatlan); az új public Scenario pontos CI/PG-proof még ellenőrizendő. Saját tartós személyes preview, cross-owner start/attribution, angol UI és actual Auth/AI proof még P12 feladat. P13/P11/Shared/retention/ops és teljes 50–100 élet/20–30 Scenario cél megmarad. Új paid AI 0, a régi kutatási naplók/5–5 USD keret változatlan; Contabo-deploy nincs. [Részletek](docs/PUBLIC_SCENARIO_PUBLICATION_REPORT_HU.md).


## 2026-10-07: saját személyes Scenario-előnézet és életindítás

Saját, lejáró teljes Scenario-előnézet és külön indítási megerősítés, privát élet/egy normál AI-job, source-detach és törlési újraélesztés tiltása implementált. 036/repeat/610/55/159 helyi ellenőrzés; normál flags false, új CI/Auth/AI és angol UI még következik. [Részletek](docs/PERSONAL_SCENARIO_START_REPORT_HU.md).


## 2026-10-07: angol Scenario-felület és jóváhagyott zárt béta

Angol Scenario-reader, külön publikálási Confirm és teljes saját profil/privát preview/start/attribution elkészült. Teljes helyi check 618/56/162, korábbi 159 séma és 001–036 immutable; új exact CI és pozitív interaktív UI még kapu. [Részletek](docs/SCENARIO_ENGLISH_UI_REPORT_HU.md). Legfrissebb döntés: 10 USD összesen (8 OpenAI + 2 Claude), 15 élet/5 Scenario és 10 fős zárt béta, seed 6 + 1 USD és külön fenntartott teszthasználat 2 + 1 USD. Ez helyettesíti a korábbi 10 + 5 USD induló használati keretet. Teljes kínálat későbbi bővítés, teljes nyilvános indulás külön lépés. Új paid AI 0, runtime-keret inaktív, Contabo-deploy nincs. [Keret](docs/AI_PRODUCTION_BUDGET_HU.md).


## 2026-10-07: tízfős béta AI-hozzáférése

Legfeljebb tíz hitelesített meghívott indíthat fizetett generálást; API és worker ellenőrzés, 2 USD OpenAI + 1 USD Claude tesztkeret, közös személyes 0,50 USD és rögzített 30 nap. Saját adatolvasás/export/törlés továbbra elérhető. Teljes helyi check 624/57/162 sikeres; új saját CI még ellenőrizendő. A megelőző angol Scenario UI pontos 3c9a6edc CI-je sikeres. A 10 USD közös induló keretből előállításra külön 6 + 1 USD marad; 15 élet/5 Scenario előállítása, tíz tesztelő kiválasztása és a teljes webhely zárása még következik. Nincs éles aktiválás, új paid AI vagy Contabo-deploy. [Részletek](docs/CLOSED_BETA_ADMISSION_REPORT_HU.md).
