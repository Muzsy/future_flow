---
status: active-supporting
owner: personal-simulation
---

# 049 – Választható történetirányok

A [terv áttekintése](049_story_directions_00_overview_hu.md) a termékdöntéseket és a műszaki megközelítést rögzíti. A [munkacsomagok](049_story_directions_06_work_packages_hu.md) tartalmazzák a függőségeket és az elfogadási feltételeket.

## Állapot

| Csomag    | Állapot           | Következő lépés                                                                          |
| --------- | ----------------- | ---------------------------------------------------------------------------------------- |
| TI00      | Folyamatban       | A terv rögzítése és a piszkozatkezelés, valamint a visszaállítás egységesítése.          |
| TI01–TI04 | Elkészült helyben | Szerződések, opcionális cél, v10 és szerveroldali mentés.                                |
| TI05      | Folyamatban       | A tízlépéses indítás és a vizuális javítás elkészült helyben; teljes elfogadás hátravan. |
| TI06      | Hátravan          | Adatkezelési döntés és megvalósítás.                                                     |
| TI07      | Elkészült helyben | Privát történetoldal, előnézeti ellenőrzés és publikálási korlátok.                      |
| TI08      | Folyamatban       | Kapcsolók és megőrző elkülönítés helyben. Kiadási pinek és célgépes próba hátravan.      |
| TI09      | Folyamatban       | Izolált alkalmazáspróba és tartalmi ellenőrzés.                                          |
| TI10      | Hátravan          | Kiadás, saját fiókos végigpróba és fokozatos bevezetés.                                  |

## Napló

- A hét tervdokumentum közös könyvtárba került. A repó dokumentumindexe és a fejlesztési főterv ide mutat.
- A meglévő konténeres CI és az izolált image-próba adja az újrahasználható ellenőrzés alapját. Az alkalmazáspróba a kiadásra szánt image-et futtatja eldobható adatbázissal, tesztfiókkal és szimulált AI-válaszokkal. A 049-es első esetek a régi történet folytatása, az új indítás, a piszkozat visszatöltése és a fejezet elszámolása. A próba helyi és CI-futtatását az első megvalósítási csomagokkal együtt kell kialakítani.

- TI01: az öt történetirány és az ötven kezdőhelyzet bekerült a katalógusba. Külön fájlban vannak az angol és magyar megjelenítési szövegek. A cél nélküli indítás sémája elkészült; az API még a meglévő sémát használja. A két új kérési JSON Schema elkészült, a meglévő exportok változatlanok. A contracts típusellenőrzése és a két célzott tesztfájl 25 esete sikeres.

- A tárolt életben az üres céllista irányhoz kötött. A szereplőhivatkozásoknak létezniük kell a kezdeti állapotban. A v10 külön policyval szerepel a szerződésben. A cél nélküli és a politikai irányú élet nyilvános előnézete és nyilvános elágazási vetülete típusos hibával zárul. A csomagbuild, a sémaexport és 66 célzott teszt sikeres, köztük a befagyasztott v8/v9 kérések. Az irányellenőrző külön próbája is zöld.

- A cél nélküli élet címét a felületi címkékből állítjuk össze. A v10 motor a választott irányt szerver által előállított keretként kapja, a szabad szöveg a felhasználói bemenetben marad. Az öt v10 prompt elkészült első jelöltként. A csomagbuild és 39 célzott teszt sikeres, köztük a v8/v9 rögzített kérései és a cél nélküli élet projekciója. A v10 szerveroldali kiválasztása és végigpróbája még hátravan.

- TI04: az API és az adatbázis összekötve. Az indítás egyező revízió és tartalom mellett üríti a felhasznált piszkozatot. A régi kliens vagy a kikapcsolt funkció mellett szerkesztett közös mezők mentése megőrzi az irányt. Az adatbázis- és workerpróba cél nélküli életből is mentett első fejezetet, majd kikapcsolt új indítás mellett döntést és következő fejezetet. A csomagbuild, az API típusellenőrzése és a 90 esetből álló regressziós futás sikeres volt. A kibővített v10 teszteset külön is sikeres.

- TI05: az engedélyezett fiókoknál az új indítás irányt, altípust és kezdőhelyzetet kér, majd a meglévő űrlapra épít. A cél kihagyható. A szereplők kapcsolata megadható, az új piszkozat alapból fiktív szereplővel indul. A felület az indításkor elküldi a mentett piszkozat revízióját; a böngészős másolatot csak visszaigazolt szerveroldali kiürítésnél távolítja el. Kikapcsolt funkciónál a régi indítás látszik. A régi és új indító mezők egy oszlopban jelennek meg. A webes build és a 33 szerződéses és API-regressziós eset sikeres. Helyi Playwright-próba szimulált API-val: az engedélyezett vállalkozói irány kiválasztható, a letiltott politikai irány nem látszik, az egyéni kezdőhelyzet oldalfrissítés után megmarad, cél nélkül `goal: null` és a mentett revízió megy a szervernek, az igazolt kiürítés után eltűnik a böngészős másolat, kikapcsolt kapcsolóval a régi indítás látszik. Az első változat után az alábbi kör vitte tovább a lépéssorrendet és a felületet.

- TI05, vizuális felülvizsgálat: az eredeti feladatlista a régi 12 lépéses űrlap levágott opcióit rögzítette. A régi út teljes szélességű mezőket kapott, a kérdései és lépéssorrendje megmaradtak. Az új út tíz lépésre állt át. Rövid listáknál natív, billentyűzettel kezelhető rádiógombok és jelölőnégyzetek kerültek tördelhető kártyákra; a hosszú országlista helyi országneveket mutat és ugyanúgy országkódot ment. A körülmények átugorhatók, a meglátogatott lépések és az összegzés mezőcsoportjai visszanyithatók. A mentés megőrzi a korábbi elrendezésben készült piszkozat tartalmát.
- Helyi Playwright, szimulált API, angol felület: 360×740, 390×844, 768×1024 és 1280×800. Mind a négy méreten végigment a tíz új lépés és az összes régi lépés. Nem volt vízszintes túlcsordulás az új űrlapon vagy a vizsgált kártyákon; a vizsgált kártyák legalább 44 px magasak, és a régi legördülők opciószövege elfért. A próba ellenőrizte a nyílbillentyűs irányváltást, a piszkozat visszaolvasását, az összegzésből szerkesztést, a cél validációját és a cél nélküli kérés indítását. Külön kapcsolati próba igazolta a több választ engedő opcionális preferenciát, az üres becenév jelzését (a továbblépés tiltásával) és a partner szerep elküldését. A build és 33 célzott regressziós teszt zöld. Ez nem a teljes W/V elfogadási sor: a magyar szöveg van a forrásban, de az alkalmazás jelenlegi nyelvi kapcsolója csak az angolt engedi; akkor még külön próba kellett a fennmaradó irányokhoz, a magyar nézethez és a teljes elszigetelt alkalmazásfolyamathoz.

- TI05, folytatás: az összegzés megmutatja a választott altípust, az irányválaszokat és a szereplők kapcsolatát, és megkülönbözteti a fikcióra bízott megszólítást a meg nem adottól. A már nem elérhető választásnál az űrlap a megfelelő kérdésre visz és magyarázatot ad. A korábbi válasz csak akkor cserélődik le, amikor a felhasználó új választ ad; kikapcsolt funkciónál a felület jelzi, hogy a szerver megőrzi az irányválaszokat. A régi böngészős kulcs törlését nem tekintjük igazoltnak, mert a csak helyben meglévő piszkozat megőrzését még ellenőrizni kell.
- TI05, helyi Playwright szimulált API-val: a fennmaradó három irányból is átment egy teljes indítási út (alkotó, utazó, fiktív közéleti). Az alkotói út üres vagy csak szóközös egyedi területtel nem engedett tovább; az utazó út altípusváltás után elhagyta a már nem alkalmazható munkaadatot, és egy elavult kezdőhelyzetnél új választást kért; a közéleti út a kitalált neveket a várt mezőben küldte el. Nincs fizetős generálás vagy éles változtatás.
- TI07: a privát listán és történetoldalon látszik az irány címkéje. A cél nélküli és a közéleti történetnél a másolatkészítés helyén magyarázat látszik; ugyanaz a szerveroldali szabály tiltja a nyilvános előkészítést. A privát másolat ellenőrzése az új szabad szöveges irányadatokra is figyel, és a hibajelzés csak a nyilvános mező útvonalát és a hibakódot adja vissza. A csomagbuild és 81 célzott teszt sikeres; a Playwright-próba igazolta a két korlátozó állapotot és a gomb megmaradását az engedélyezett történetnél.

- TI08 – A meglévő Contabo operátori kliens és a szerveroldali eszköz elfogadja a három történetirány-beállítást. A kohorsz legfeljebb 100 különböző UUID. Az aktiválás v9 konfigurációt igényel, és a változó beállításnak egyeznie kell az API és a worker renderelt konfigurációjában. A hiányzó, alapértékű kapcsoló megadása önmagában nem okoz újraindítást. A terv és a napló a megváltozott értékek lenyomatait rögzíti. A teljes célgépes próba még nyitott.

- TI08 – A kivételes elkülönítő eszköz `plan`, `park` és `restore` parancsa elkészült. A függő v10 feladat blokkolja az elkülönítést. A titkosított archívum az adatbázis-commit előtt lemezre kerül, a visszaillesztéshez pedig a commit után írt bizonylat kell. A helyi PostgreSQL-kompatibilis próba igazolta a sikertelen archiválás utáni változatlanságot, a közben módosított közös mezők megőrzését és az ismételt visszaillesztés hatástalanságát. A valódi `age` és TLS próba izolált helyi PostgreSQL 16-on sikeres. A Contabo-célgépes próba külön lépés. Az archívum törlésére vonatkozó döntés és parancs nyitott.

- TI05 – Playwrighttal ellenőrizve a régi helyi piszkozat átvétele üres és azonos revíziójú szerverpiszkozatnál. A frissebb szerverpiszkozat megmaradt, és az elutasított mentés után a régi helyi másolat is megmaradt. A magyar böngészős ellenőrzés külön helyi munkapéldányban futott, ahol a próba idejére elérhető volt a magyar nyelv.
- TI08 – Külön helyi PostgreSQL 16 példányon, saját tanúsítvánnyal és ideiglenes `age` kulccsal végigment a számlálás, titkosított elkülönítés, visszaillesztés és az ismételt visszaillesztés. Az adatbázisban a várt harmadik revízió és az eredeti irány szerepelt.

- TI05 – A magyar vállalkozói indítás mind a tíz lépése végigment Playwrighttal, szimulált API-val, 360×740, 390×844, 768×1024 és 1280×800 méreten. Az űrlap és a vizsgált kártyák vízszintesen elfértek. Az összegzés magyarul mutatta a cél nélküli állapotot, az indítási kérésben pedig `locale: hu`, `goal: null` és a vállalkozói altípus szerepelt. Ez egy teljes magyar indítási út böngészős ellenőrzése. A többi irány magyar változata és a valódi API-val futó teljes alkalmazáspróba külön ellenőrzés.

- TI09 – Helyi integrációs próba a valódi Nest API-val, migrált PGlite adatbázissal és a valódi workerrel. A hitelesítés és a modellválaszok tesztadatokból jöttek. A cél nélküli v10 történet mentett piszkozatból indult, a megismételt indítás ugyanazt az azonosítót adta, a döntés megmaradt, a folytatás második fejezete elmentődött. A két fejezethez pontosan két fizetett fejezetfoglalás tartozott a tesztfőkönyvben, mindkettő elszámolva. Fejezetenként öt szimulált modellválasz érkezett. A konténeres és böngészős teljes út külön lépés.

- TI09 – A terv mind a 12 profilját felvettük a worker integrációs tesztjébe. Mindegyik mentett piszkozatból indul, a saját irányválaszait viszi tovább, és öt szimulált modellválasz után v10 artefaktummal elment egy fejezetet. A közéleti ellenpróba rögzített modellválasszal futott. A valódi modell reakcióját a bemeneti névre, az irodalmi minőséget és a hosszú távú következményeket a fizetős tartalmi szakasz vizsgálja.

## Nyitott kérdések és problémák

- A piszkozat mentési szabálya és a visszaállítás előfeltétele bekerült a szerződés- és kiadási tervbe. A szerveroldali mentés és az érintett tesztek elkészültek a TI04 csomagban.
- A kivételes visszaállítás tervében tisztázni kell az üres cél visszafordítható kezelését, a piszkozat azonosságának ellenőrzését és az archívum felülvizsgálati határidejét.
- A végleges kérdésszövegek, az érzékeny kapcsolati válaszok kezelése és a későbbi fizetős próbák kerete az áttekintés nyitott döntései között szerepel.
