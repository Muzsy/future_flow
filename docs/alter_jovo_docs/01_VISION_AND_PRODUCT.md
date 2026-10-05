# alterward — vízió és termék

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

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

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.
