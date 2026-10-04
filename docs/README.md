# alterward — dokumentáció

2026-10-04 · A teljes témadokumentáció frissítve a két átadott terv és a későbbi felhasználói döntések szerint. A dokumentáció nyelve magyar; a termék induló felülete és történetei kizárólag angolok, magyar halasztva. [Legújabb indulási döntés](ENGLISH_RELEASE_PLAN_HU.md).

## Olvasási sorrend

| Dokumentum | Mire ad választ? |
|---|---|
| [Termékterv](PRODUCT_PLAN_HU.md) | Mit építünk, milyen élménnyel és MVP-határral? |
| [Állapot és kísérleti keret](STATUS_HU.md) | Mi működik, mi tervezett, milyen bizonyíték és pénzügyi keret áll rendelkezésre? |
| [Következő lépések](NEXT_STEPS.md) | L01 és P01–P13 végrehajtási sorrend, függőségek, elfogadás |
| [21 részes témadokumentáció](alter_jovo_docs/00_README.md) | Termék, UX, profil, motor, AI, közösség, architektúra, adat/API, biztonság, minőség és üzemeltetés |
| [Követelmények visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md) | Hol érvényesül a két terv mind a 80 fő fejezete és a közösségi MVP 14 eleme? |
| [V2 megvalósítás](V2_IMPLEMENTATION_REPORT_HU.md), [routing](AI_V2_ROUTING_REPORT_HU.md), [törlési runbook](ACCOUNT_DELETION_RUNBOOK_HU.md) | Új privát élet, mérések és helyreállítás |
| [Privát béta megvalósítás](BETA_IMPLEMENTATION_REPORT_HU.md), [feedback és metrikák](BETA_FEEDBACK_AND_METRICS_HU.md) | Valódi Auth/AI/törlés, angol minta auditja, privát űrlap és session-mérés |
| [Implementáció](IMPLEMENTATION.md) | A meglévő kód tényleges működése és korlátai |
| [Beállítás](SETUP.md) | Helyi indítás, Supabase/OpenAI és titokkezelés |
| [Lokalizáció](LOCALIZATION_HU.md) | Angol kiadás, elrejtett magyar és bővíthető nyelvregiszter |
| [Angol indulás](ENGLISH_RELEASE_PLAN_HU.md), [telepítés](DEPLOYMENT_HU.md) | AI szerkesztői ellenőrzés, éles béta és használói visszajelzés; későbbi Contabo-telepítés |
| [Contabo szerveraudit](CONTABO_SERVER_AUDIT_HU.md) | Ellenőrzött hálózati elérhetőség, meglévő Caddy, SSH-hozzáférési akadály és még szükséges belső vizsgálatok |
| [V2 szerződés](V2_SIMULATION_CONTRACT_HU.md) | Az elkészült időszakos tárolás/API/worker és pontos szerződés |
| [Privát public-előnézeti alap](PUBLIC_DRAFT_FOUNDATION_HU.md), [emberi értékelés/pilot](HUMAN_EVALUATION_AND_PILOT_HU.md) | P09 előkészítő kód és kiadás utáni használói értékelés |
| [Nyilvános rendszer terve](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) | Snapshot, Discovery, publishing, moderáció és saját privát fork |
| [Claude modellek és külső audit](CLAUDE_MODEL_EVALUATION_HU.md) | EN/HU audit, hibakontrollok, token/cache/effort/limit és külön Claude 5 USD |
| [AI-ellenőrzés](AI_VALIDATION.md), [modellvizsgálat](AI_MODEL_ROUTING_HU.md), [minták](examples/README.md) | Dátumozott mérések; a sikerek gyakorlati határai |

## Elsőbbség és státusz

Termékdöntések sorrendje: felhasználói döntések → a két stratégiai forrás → aktív termékterv → részletes témák és backlog. A meglévő működésről a kód, a migrációk, a kódból exportált sémák és az implementációs állapot adnak bizonyítékot. Egy terv leírása nem jelent elkészült funkciót.

- **Működik:** v2 rövid onboarding, hat hónapos valódi AI, választás/ugyanazon ág folytatása/történeti fork, memória/javítás és alkalmazáskeret; v1 archívum megmarad.
- **Ellenőrizendő:** backup/restore, valós hibás törlés helyreállítása, email-kézbesítés és későbbi Contabo-indulás; a valódi Auth/AI HTTP-hurok és Auth/DB-törlés már sikeres, az új angol minta auditálva. Emberi minőség a béta után mérendő.
- **Tervezett:** publishing, Discovery, Official seed és nyilvános fork.
- **Mérendő:** emberi történetminőség, folytatási igény, visszatérés, konverzió és v2 költség.

Közös rögzített irány: **alterward**, valódi OpenAI-tartalom, külön Claude-kutatás/külső audit, Supabase, 18+ web, kizárólag angol indulás, magyar elrejtve, privát alapállapot, ingyenes adathozzáférés/törlés, `Muzsy/future_flow` → `main`. Az induló termék három rétege a Private Personal Simulation, Official Lives/Scenarios és Community Lives. A személyes hurok készül először; a nyilvános réteg az induló teljes MVP része. Pontos fizetős árak és domain még nincsenek eldöntve.

## Források és archívum

A felhasználó két dokumentuma teljes terjedelemben, változatlanul megmarad:

1. [Pozicionálás és célmeghatározás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) — 38 fő fejezet.
2. [Nyilvános életutak, Discovery és közösség](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) — 42 fő fejezet; kiegészíti és a közösségi MVP sorrendjében pontosítja az első tervet.

A források régebbi munkanévre, nyelvre és prémium privacyra vonatkozó részeit a [döntési napló](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md) felülírja. Piaci/versenytársi háttérállításaik nem friss, külön ellenőrzött piackutatási eredmények.

A korábbi 21 dokumentum és eredeti manifest byte szerinti másolata az [archívumban](archive/README.md) található; az [eredeti ZIP](alter_jovo_project_documentation_v0.1.zip) is változatlan. A `docs/alter_jovo_docs` útvonal a frissített, aktív **0.2 dokumentációt** tartalmazza. A mappanév kompatibilitás miatt marad. Ez dokumentációverzió, nem API-, adatbázis-, termékcsomag- vagy kontraktusverzió.

## Karbantartás

Funkció elkészültekor először a bizonyítékot és státuszt kell frissíteni, majd a backlogot és a megfelelő témadokumentumot. Modellárak/mérések dátummal szerepelnek; új árat újra ellenőrizni kell, régi mérés nem írható át. Az AI-minták tényleges generált törzse és a forrásdokumentumok nem szerkesztett termékígéretek. A JSON-sémák a kódból készülnek `pnpm schemas` paranccsal. Az aktív témacsomag manifestje tartalomváltozás után újragenerálandó.
