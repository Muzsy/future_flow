# alterward — vízió és termék

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-05 · Aktív irány. [Termékterv](../PRODUCT_PLAN_HU.md) · [Megvalósítási státusz](../STATUS_HU.md).

## Termékígéret és pozicionálás

Az alterward AI által generált, tartósan mentett, folytatható és elágaztatható alternatív élet. A felhasználó egy saját vagy alternatív identitással és céllal indul, eseményeket él meg, döntéseket hoz, majd később ugyanabban az életben tapasztalja meg a következményeket. Korábbi döntésből másik ágat is kipróbálhat.

Elsődleges érték: kíváncsiság, élvezhető történet és életutak felfedezése; másodlagos érték az ebből adódó önreflexió és döntési lehetőségek megvizsgálása. A történet lehetséges szcenárió, a cél irányt ad, teljesülését nem ígérjük. Nincs megtörténési százalék vagy emberi érték/életminőség rangsor.

Angol rövid bemutatás: **Explore an alternate life shaped by your choices.** Magyar: **Fedezz fel egy alternatív életet, amelyet a döntéseid alakítanak.** A termék neve alterward; domain és védjegyellenőrzés külön nyitott feladat. A korábbi munkanevek nem jelenlegi márkajavaslatok.

## Hat pillér

| Pillér | Szerepe |
|---|---|
| Identity | Saját/alternatív identitás és induló helyzet, verziózott pillanatkép |
| Goal | Egy fő irány, prioritás, időtáv és vállalható/kizárt áldozatok |
| World State | Idő, környezet, munka, pénzügy, szereplők, tulajdon, készségek és lehetőségek |
| Events | AI-javaslatból validált, strukturált történések |
| Choice | A felhasználó választ, nincs előre rögzített utóélet a függő döntés után |
| Consequence | Tartós tényváltozások és későbbi következmények, ugyanazon ágon |

## Három termékréteg

**Private Personal Simulation:** minden saját élet privát alapállapotban. **Official Lives / Scenarios:** szintetikus adatokból valódi AI-val generált, ember által kurált példák és külön verziózott szcenáriósablonok. **Community Lives:** a felhasználó explicit preview/megerősítés után publikált snapshotjai. Discovery olvasásból érdeklődés, majd új saját privát AI-élet lehet; olvasáskor nincs új generálás.

A közösség élet, ág, döntés és szcenárió köré épül. A személyes folytatási hurok az első mérnöki cél, a Discovery/publishing/fork a teljes induló MVP része. Teljes social network, DM és komment nem az első kiadás része.

## Célközönség és JTBD

Első célcsoport a kíváncsi felnőtt felfedező. Másodlagos irány a változtatási lehetőséget kereső, történetkedvelő és közösségi életutakat olvasó felhasználó. Tesztelendő igények: másik jövő/identitás kipróbálása; választások következménye; ugyanazon történet folytatása; mások dilemmáinak olvasása; saját ág létrehozása és önkéntes megosztás. A 18+ cél nem helyettesít kész életkor-ellenőrzést.

## Alapelvek és hipotézisek

Hihető és érdekes események; hétköznapi folytonosság; strukturált állapot a próza előtt; tartós user agency; privát alap; rövid AI-jelölés és érthető szcenáriókommunikáció; manipuláló streak/félelem alapú upsell nélkül. Az alterward nem klinikai teszt, jósló, coaching-, habit- vagy egészségplatform; jelentős valós jogosultsági döntést nem hoz.

A stratégia A–G hipotézisei nyitottak: saját/fiktív identitás; onboarding értéke; folytatás/új élet; fork-retenció; megosztási igény; mások életének fogyasztása; történet/analitikus riport. Elsődleges mérés a Continuation Rate és Continued Life Sessions, mellettük D1/D7/D30 és költség/sikeres folytatás. Egy technikai AI-minta nem validált termék vagy bizonyított piaci kereslet.

A v1 archívum mellett a privát v2 mag működik. P06 valódi Auth/UI/törlés és kontrollált recovery sikeres, az ops-kapuk részben nyitottak. P07 angol AI-audit és P08 műszerezés kész; éles béta és valódi használói értékelés még nincs. A piaci háttér a forrásdokumentum szerzői állítása, nem új versenytárselemzés.

## Privát, összekapcsolt alternatív életek

A Shared Context valós felhasználók saját életágait közös AI-eseményekkel kapcsolja össze. A saját élet tulajdonosa nem változik, a csoport privát és külön canonja van. Friend/romantic/work/hobby/sport fokozatosan készül, első szelet friend 2–10. Ez új tervezett termékképesség; a Private/Official/Community és public MVP cél megmarad, DM/realtime továbbra későbbi.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
