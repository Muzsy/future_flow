# Valódi AI-generálási ellenőrzés — 2026-10-02

Történeti, lezárt v1 mérés. A 2026-10-03-i dokumentációfrissítés a próba adatait és történettörzseit megőrzi. [Friss megvalósítási státusz/összes keret](STATUS_HU.md) · [Angol/magyar újabb próba](LOCALIZATION_HU.md) · [Dokumentáció](README.md).

Három kitalált magyar profilból három alaptörténet és három döntési életág készült valódi OpenAI Responses API-hívásokkal, a `gpt-6.1-sol` modellel. Mind a hat generálás átment a sémavizsgálaton, az esemény- és fejezethivatkozások ellenőrzésén és a külön AI történetellenőrzésen.

Ez a lezárt próba a v1 tízéves generálását és új ágba elágazását ellenőrizte. Az [aktív termékterv](PRODUCT_PLAN_HU.md) rövid időszakokra és ugyanazon életág folytatására tér át. A fenti siker nem igazolja ezt a még fejlesztendő hurkot, a felhasználói folytatási szándékot vagy a későbbi visszatérést; ehhez külön ellenőrzés és emberi pilot szükséges.

| Profil                                                                              | Alapesemény | Új ágesemény | Örökölt esemény | Fejezet összesen | AI-hívás | Becsült költség |
| ----------------------------------------------------------------------------------- | ----------: | -----------: | --------------: | ---------------: | -------: | --------------: |
| Családos műszaki alkalmazott, érdekesebb munkát keres                               |           9 |            8 |               3 |                6 |        6 |      0,2041 USD |
| Grafikai tervezést tanuló, közeli kapcsolatok nélkül, portfóliócéllal               |           9 |            8 |               3 |                6 |        6 |      0,2059 USD |
| 55–64 éves adminisztratív alkalmazott, helyben maradással és nagy biztonságigénnyel |           9 |            9 |               3 |                6 |        6 |      0,2199 USD |
| **Összesen**                                                                        |      **27** |       **25** |           **9** |           **18** |   **18** |  **0,6300 USD** |

A költség a szolgáltatói válaszok tényleges tokenhasználatából és az ellenőrzés napján érvényes standard árakból számolt becslés. A cache-olvasás és cache-írás külön szerepel, a gondolkodási token a kimenet része. Nincs ismeretlen fogyasztású kérés, hibás válasz vagy automatikus generálási újrapróbálás ebben a sorozatban. A belső próbalimit 1 USD volt a felhasználó által biztosított 5 USD-ből; közvetlenül a sorozat után körülbelül 4,37 USD számított maradvány volt. A későbbi próbákkal frissített keret a közös státuszban van.

## Ellenőrzött viselkedés

- Mindhárom új ág pontosan a szülő közös eseményeit örökli a döntési pontig; az új események későbbi időpontban kezdődnek.
- A második és harmadik próbában a szülő teljes visszaolvasott nézetének hash-e is változatlan az új ág elkészülte után. A canonical események SQL-módosításvédelme és az ágelágazási tesztek is sikeresek.
- A fejezetek a mentett canonra hivatkoznak. Mind a hat külön történetellenőrző válasz `valid=true`, üres issue-listával.
- A közeli kapcsolatok nélküli profil története nem feltételez korábban megadott partnert vagy barátot. Rövid szakmai beszélgetések megjelennek, új tartós szereplő nélkül.
- A helyben maradó profil választott új ága megtartja a költözés kizárását, az álláskeresés halasztását és a fizetős képzési kötelezettség kerülését a szövegekben.
- A fejezetek 249–316 szó közöttiek. A 250–600 szavas cél alsó határához közel vannak; egy fejezet egy szóval rövidebb, ami nem sérti az adatszerződést.
- A szövegek magyarul, második személyben készültek. Következő szerkesztési feladat az ismétlődő magyarázó fordulatok mérséklése és a jelenetek változatosságának növelése.

## Olvasható minták

- [Családos műszaki profil — alaptörténet és új életág](examples/ai-family.md)
- [Tanulási és portfóliócél — alaptörténet és új életág](examples/ai-creative.md)
- [Helyben maradó munkakeresési cél — alaptörténet és új életág](examples/ai-career-change.md)

A minták a tényleges AI-válaszokból exportált fejezetek; a törzsük nem kézzel írt helyettesítő tartalom. Minden profil, cél és kapcsolat mesterséges tesztadat.

## Az ellenőrzés akkori határai (2026-10-02)

A tartós feladatfolyamat és a PostgreSQL-tranzakciók helyi, izolált PGlite adatbázisban futottak. A valódi Supabase-kapcsolat és migráció külön ellenőrizve, de ezek a próbák nem érintettek valódi Auth-fiókot vagy Supabase-ban tárolt személyes profilt. Az email-belépés és a teljes Auth/DB/OpenAI böngészős folyamat még külön tesztelendő; a fióktörlés szerveroldali Supabase-kulcsa még hiányzik.

Három profil és az AI történetellenőrzője nem teljesíti a dokumentáció 20 profilos, emberi értékelést igénylő alfakapuját. A helyi próba költségőre sem a teljes alkalmazás szolgáltatói keretkezelése.

A mérés akkori kódellenőrzése: 59 automatizált teszt sikeres; formázás, típusellenőrzés és a teljes build sikeres. A szerveres segédszkriptek típusellenőrzése is bekerült a kötelező ellenőrzések közé. Az eredeti 21 dokumentum a változatlan archív manifest hash-eivel egyező [archívumban](archive/README.md) marad; az aktív témacsomag frissült.

## Későbbi állapot — 2026-10-04

A v2 rövid időszak/folytatás, alkalmazáskeret, valódi Auth/AI HTTP- és böngészős próba, export/törlés és kontrollált recovery azóta elkészült; az admin kulcs rendelkezésre áll. Az indulás kizárólag angol, előzetes kézi EN/HU gate helyett kiadás utáni használói mérés. [Aktuális béta-bizonyíték és határok](BETA_IMPLEMENTATION_REPORT_HU.md), [közös státusz/keret](STATUS_HU.md). A fenti 18 hívás, költség és történetek változatlan történeti eredmények.

## Narratív sémák és minőségi kapu N02

A narrative 1.0.0 structured tervezési/editor szerződések mellett a core kánon-, chronology-, actor-, choice-, thread- és artifact receipt kötéseket vizsgál. Az editor verdict önmagában nem jóváhagyás: öt kritikus dimenzió legalább 4, overall legalább 4.00 és major issue nélkül kell pass. A 650–950 szó puha írói cél; új narrative domainkapu 250–950, legacy 250–600. A mock score teszt nem valódi irodalmi minőségbizonyíték; a paid/humán benchmark és full pipeline még későbbi gate.
