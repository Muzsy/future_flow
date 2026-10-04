# alterward — témadokumentáció 0.2


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A [pozicionálási terv](../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), a [nyilvános életutak terve](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) és az elfogadott felhasználói döntések egységes feldolgozása. [Dokumentációs központ](../README.md) · [Állapot](../STATUS_HU.md) · [Backlog](../NEXT_STEPS.md) · [Visszakövethetőség](../REQUIREMENTS_TRACEABILITY_HU.md).

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
| [09](09_DATA_MODEL.md) | V1 tárolás, v2 és nyilvános adatmodell terve |
| [10](10_API_SPEC.md) | Tényleges v1 végpontok és tervezett műveletek |
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

A 0.2 a dokumentáció verziója. V1 kompatibilis archívum, /api/v2 időszakos élet integrált; nyilvános funkciók és valós Auth/ops még nyitott; használói minőség kiadás után mérendő. A témák ezekre külön jelöléssel hivatkoznak. Az [eredeti v0.1](../archive/README.md) és ZIP változatlanul megmarad; ez a könyvtár már az aktív csomag.

A [manifest](manifest.json) a jelenlegi 21 témadokumentum UTF-8 byte-méretét és SHA-256 hash-ét tartalmazza, valamint a két változatlan forrás hash-ét. A teljes forrástartalom nem rövidített archív példánnyal lett kiváltva.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
