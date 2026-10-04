# alterward — témadokumentáció 0.2

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0 implementáció elkészült és izoláltan ellenőrzött; fejlesztői DB-alkalmazás függő, feature kikapcsolva. S1–S7 tervezett. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · A [pozicionálási terv](../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), a [nyilvános életutak terve](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) és az elfogadott felhasználói döntések egységes feldolgozása. [Dokumentációs központ](../README.md) · [Állapot](../STATUS_HU.md) · [Backlog](../NEXT_STEPS.md) · [Visszakövethetőség](../REQUIREMENTS_TRACEABILITY_HU.md).

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

Az új [forráscsomag](../plans/README.md) változatlan; az [aktív Shared terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) S0–S7 külön szál. A 21 téma most a privát közös AI-események követelményeit is tartalmazza; az eredeti 80 stratégiai fejezet és public 14 elem megmarad. S0 implementált, DB-alkalmazás függő; következő helyi munka S1, friend release csak S2+S3 és biztonsági kapu után.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).
