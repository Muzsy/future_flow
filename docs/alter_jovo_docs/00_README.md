# alterward — témadokumentáció 0.2

**Aktuális állapot (2026-10-05):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap és [privát AI-pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md) és [privát szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; az aktív alterward.com bekötése, éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · A [pozicionálási terv](../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), a [nyilvános életutak terve](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) és az elfogadott felhasználói döntések egységes feldolgozása. [Dokumentációs központ](../README.md) · [Állapot](../STATUS_HU.md) · [Backlog](../NEXT_STEPS.md) · [Visszakövethetőség](../REQUIREMENTS_TRACEABILITY_HU.md).

## A csomag

| Fájl | Téma |
|---|---|
| [01](01_VISION_AND_PRODUCT.md) | Vízió, pozicionálás, hat pillér és célközönség |
| [02](02_USER_EXPERIENCE_AND_FLOWS.md) | Első élmény, folytatás, saját és nyilvános fork, publishing |
| [03](03_PROFILE_MODEL_AND_QUESTIONNAIRE.md) | Rövid profil, identitás, cél és korlát |
| [04](04_SIMULATION_ENGINE.md) | Strukturált canon, tényállapot és rövid időszak |
| [05](05_AI_AND_PROMPT_ARCHITECTURE.md) | OpenAI-szerepek, nyelv, költség és minőség |
| [06](06_STORY_ENGINE_AND_CONTENT.md) | AI-történet, emlékezet, Official tartalom |
| [07](07_COMMUNITY_AND_SOCIAL.md) | Public/Official/Community és Discovery |
| [08](08_SYSTEM_ARCHITECTURE.md) | Meglévő rendszer és új modulhatárok |
| [09](09_DATA_MODEL.md) | V1/v2 tárolás, privát előnézet és tervezett nyilvános adatmodell |
| [10](10_API_SPEC.md) | Tényleges v1/v2 végpontok és tervezett public műveletek |
| [11](11_SECURITY_PRIVACY_COMPLIANCE.md) | Jogosultság, PII, export/törlés, release-függőségek |
| [12](12_MVP_SCOPE_AND_ROADMAP.md) | Privát pilot és teljes nyilvános MVP |
| [13](13_ENGINEERING_SETUP.md) | Indítás, CI, migráció és titokkezelés |
| [14](14_TESTING_AND_QUALITY.md) | Technikai, nyelvi, AI és public minőségi kapuk |
| [15](15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Folytatási mérés, public konverzió, monetizáció/ops |
| [16](16_DECISIONS_AND_OPEN_QUESTIONS.md) | Elfogadott döntések, felülírások, nyitott döntések |
| [17](17_INITIAL_BACKLOG.md) | Aktuális backlog-index és régi feladatok utódlása |
| [18](18_AGENT_HANDOFF.md) | Következő konkrét fejlesztési szelet átadása |
| [19](19_SAMPLE_CONTRACTS.md) | Érvényes kontraktusok és API-minták |
| [20](20_REFERENCES.md) | Belső források és hivatalos referenciák |

## Verzió és státusz

A 0.2 a dokumentáció verziója. V1 kompatibilis archívum, /api/v2 időszakos élet integrált; valódi Auth-próba sikeres, nyilvános funkciók és éles ops még nyitott; használói minőség kiadás után mérendő. A témák ezekre külön jelöléssel hivatkoznak. Az [eredeti v0.1](../archive/README.md) és ZIP változatlanul megmarad; ez a könyvtár már az aktív csomag.

A [manifest](manifest.json) a jelenlegi 21 témadokumentum UTF-8 byte-méretét és SHA-256 hash-ét tartalmazza, valamint a két változatlan forrás hash-ét. A teljes forrástartalom nem rövidített archív példánnyal lett kiváltva.

## Shared Context mint harmadik forrás

Az új [forráscsomag](../plans/README.md) változatlan; az [aktív Shared terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) S0–S7 külön szál. A 21 téma most a privát közös AI-események követelményeit is tartalmazza; az eredeti 80 stratégiai fejezet és public 14 elem megmarad. S0 implementált, DB-alkalmazás és ismétlés sikeres; S1 implementált, következő helyi munka S3, friend release csak S2+S3 és biztonsági kapu után.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


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
