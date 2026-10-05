# alterward — témadokumentáció 0.2

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

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

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
