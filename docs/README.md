# alterward — dokumentáció

2026-10-04 · A teljes témadokumentáció frissítve a két stratégiai terv, az új Shared Context specifikáció és a későbbi felhasználói döntések szerint. A dokumentáció nyelve magyar; a termék induló felülete és történetei kizárólag angolok, magyar halasztva. [Legújabb indulási döntés](ENGLISH_RELEASE_PLAN_HU.md).

## Olvasási sorrend

| Dokumentum | Mire ad választ? |
|---|---|
| [Teljes dokumentáció-felülvizsgálat](DOCUMENTATION_REVIEW_HU.md) | Mit javítottunk, milyen kód/CI/operatív bizonyíték alapján és milyen ellenőrzéssel? |
| [Termékterv](PRODUCT_PLAN_HU.md) | Mit építünk, milyen élménnyel és MVP-határral? |
| [Állapot és kísérleti keret](STATUS_HU.md) | Mi működik, mi tervezett, milyen bizonyíték és pénzügyi keret áll rendelkezésre? |
| [Következő lépések](NEXT_STEPS.md) | L01, P01–P13 és S0–S7; következő helyi szelet S0 |
| [Shared Context integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | Több valódi felhasználó privát életágának közös AI-eseményei, consent, entitlement, személyes hatások és kiadási kapuk |
| [Új forráscsomag](plans/README.md) | Változatlan ZIP, 15 témadokumentum, master és ellenőrzőösszegek |
| [21 részes témadokumentáció](alter_jovo_docs/00_README.md) | Termék, UX, profil, motor, AI, közösség, architektúra, adat/API, biztonság, minőség és üzemeltetés |
| [Követelmények visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md) | Hol érvényesül a 80 stratégiai fejezet, a 14 public MVP-elem és az új csomag mind a 15 témadokumentuma? |
| [V2 megvalósítás](V2_IMPLEMENTATION_REPORT_HU.md), [routing](AI_V2_ROUTING_REPORT_HU.md), [törlési runbook](ACCOUNT_DELETION_RUNBOOK_HU.md) | Új privát élet, mérések és helyreállítás |
| [Privát béta megvalósítás](BETA_IMPLEMENTATION_REPORT_HU.md), [feedback és metrikák](BETA_FEEDBACK_AND_METRICS_HU.md) | Valódi Auth/AI/törlés, angol minta auditja, privát űrlap és session-mérés |
| [Implementáció](IMPLEMENTATION.md) | A meglévő kód tényleges működése és korlátai |
| [Beállítás](SETUP.md) | Helyi indítás, Supabase/OpenAI és titokkezelés |
| [Lokalizáció](LOCALIZATION_HU.md) | Angol kiadás, elrejtett magyar és bővíthető nyelvregiszter |
| [Angol indulás](ENGLISH_RELEASE_PLAN_HU.md), [telepítés](DEPLOYMENT_HU.md) | AI szerkesztői ellenőrzés, éles béta és használói visszajelzés; későbbi Contabo-telepítés |
| [Contabo szerveraudit](CONTABO_SERVER_AUDIT_HU.md) | Sikeres belső audit: 4 vCPU/8 GB RAM, közös Caddy, TLS/hálózat, indulás előtti SSH/tűzfal/mentés/karbantartás |
| [Contabo előkészítés](CONTABO_PREPARATION_REPORT_HU.md) | Működő külön SSH-kulcs, jelszavas SSH tiltása, konfigurációmentés és ellenőrzött elkülönített telepítési fájlok |
| [V2 szerződés](V2_SIMULATION_CONTRACT_HU.md) | Az elkészült időszakos tárolás/API/worker és pontos szerződés |
| [Privát public-előnézeti alap](PUBLIC_DRAFT_FOUNDATION_HU.md), [emberi értékelés/pilot](HUMAN_EVALUATION_AND_PILOT_HU.md) | P09 előkészítő kód és kiadás utáni használói értékelés |
| [Nyilvános rendszer terve](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) | Snapshot, Discovery, publishing, moderáció és saját privát fork |
| [Claude modellek és külső audit](CLAUDE_MODEL_EVALUATION_HU.md) | EN/HU audit, hibakontrollok, token/cache/effort/limit és külön Claude 5 USD |
| [AI-ellenőrzés](AI_VALIDATION.md), [modellvizsgálat](AI_MODEL_ROUTING_HU.md), [minták](examples/README.md) | Dátumozott mérések; a sikerek gyakorlati határai |

## Elsőbbség és státusz

Termékdöntések sorrendje: felhasználói döntések → a két stratégiai forrás és az új Shared Context specifikáció → aktív termékterv → részletes témák és backlog. A meglévő működésről a kód, a migrációk, a kódból exportált sémák és az implementációs állapot adnak bizonyítékot. Egy terv leírása nem jelent elkészült funkciót.

- **Működik:** v2 rövid onboarding, hat hónapos valódi AI, választás/ugyanazon ág folytatása/történeti fork, memória/javítás és alkalmazáskeret; v1 archívum megmarad.
- **Ellenőrizendő:** backup/restore, valós DB-kiesésből helyreállítás, email-kézbesítés és későbbi Contabo-indulás; a valódi Auth/AI HTTP-hurok és Auth/DB-törlés már sikeres, kontrollált megszakításból valódi recovery és a teljes izolált konténeres CI sikeres, az új angol minta auditálva. Emberi minőség a béta után mérendő.
- **Shared alap:** S0 szerződés/tárolás/social/entitlement/meghívási API elkészült kikapcsolt feature mögött; fejlesztői DB-alkalmazás még függő. [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md).
- **Tervezett:** Shared S1–S7 engine/AI/személyes integráció/UI; publishing, Discovery, Official seed és nyilvános fork. A foundation nem felhasználói friend release.
- **Mérendő:** emberi történetminőség, folytatási igény, visszatérés, konverzió és v2 költség.

Közös rögzített irány: **alterward**, valódi OpenAI-tartalom, külön Claude-kutatás/külső audit, Supabase, 18+ web, kizárólag angol indulás, magyar elrejtve, privát alapállapot, ingyenes adathozzáférés/törlés, `Muzsy/future_flow` → `main`. Az induló termék három rétege a Private Personal Simulation, Official Lives/Scenarios és Community Lives. A személyes hurok készül először; a nyilvános réteg az induló teljes MVP része. A Shared Context tervezett Free/Explorer/Connected/World jogosultsági modellje bekerült; pontos ár, billing és domain még nincs eldöntve.

## Források és archívum

A felhasználó három forrása teljes terjedelemben, változatlanul megmarad:

1. [Pozicionálás és célmeghatározás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) — 38 fő fejezet.
2. [Nyilvános életutak, Discovery és közösség](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) — 42 fő fejezet; kiegészíti és a közösségi MVP sorrendjében pontosítja az első tervet.
3. [Shared Context implementációs csomag](plans/README.md) — 15 témadokumentum, teljes master, manifest/checksum és eredeti ZIP; a személyes életmotor privát többfelhasználós bővítése.

A források régebbi munkanévre, nyelvre és prémium privacyra vonatkozó részeit a [döntési napló](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md) felülírja. Piaci/versenytársi háttérállításaik nem friss, külön ellenőrzött piackutatási eredmények.

A korábbi 21 dokumentum és eredeti manifest byte szerinti másolata az [archívumban](archive/README.md) található; az [eredeti ZIP](alter_jovo_project_documentation_v0.1.zip) is változatlan. A `docs/alter_jovo_docs` útvonal a frissített, aktív **0.2 dokumentációt** tartalmazza. A mappanév kompatibilitás miatt marad. Ez dokumentációverzió, nem API-, adatbázis-, termékcsomag- vagy kontraktusverzió.

## Karbantartás

Funkció elkészültekor először a bizonyítékot és státuszt kell frissíteni, majd a backlogot és a megfelelő témadokumentumot. Modellárak/mérések dátummal szerepelnek; új árat újra ellenőrizni kell, régi mérés nem írható át. Az AI-minták tényleges generált törzse és a forrásdokumentumok nem szerkesztett termékígéretek. A JSON-sémák a kódból készülnek `pnpm schemas` paranccsal. Az aktív témacsomag manifestje tartalomváltozás után újragenerálandó.

## Shared Context beépítése — 2026-10-04

Az új terv S0–S3 alap/AI/személyes integráció után adhat 2–10 fős angol friend bétát; S4 romantikus, S5 projekt/hobbi, S6 húszfős sport, S7 későbbi bővítés. Az AI nélküli forráslépések csak kikapcsolt foundation és izolált teszt; nincs AI nélküli termékkiadás. A személyes mag és a public MVP megmarad, a csoport maga privát. Az aktív terv rendezi a mintakód lock-sorrendjét, törlési és időkezelési kapuit, és az angol/main/helyi fejlesztési döntéseket. Új alkalmazáskód, migráció, paid hívás vagy Contabo-módosítás ebben az integrációban nem készült.

## Shared S0 megvalósítás — 2026-10-04

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). Külön Shared 1.0.0, 008/009 additív migráció, 13 privát RLS-tábla, minimális profil, szerver-entitlement és revisionös/idempotens meghívási API. A 36 új regresszióval a készlet 195 teszt. A mostani IPv4 hálózaton a Supabase direct IPv6 címe nem elérhető, ezért a tényleges DB-alkalmazás Session pooler címre vár. Következő S1; S2 valódi AI és S3 személyes integráció/consent/export/törlés/moderáció előtt nincs friend béta.
