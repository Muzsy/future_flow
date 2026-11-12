---
status: active-supporting
owner: personal-simulation
---

# 049 – Választható történetirányok

A [terv áttekintése](049_story_directions_00_overview_hu.md) a termékdöntéseket és a műszaki megközelítést rögzíti. A [munkacsomagok](049_story_directions_06_work_packages_hu.md) tartalmazzák a függőségeket és az elfogadási feltételeket.

## Állapot

| Csomag    | Állapot     | Következő lépés                                                                 |
| --------- | ----------- | ------------------------------------------------------------------------------- |
| TI00      | Folyamatban | A terv rögzítése és a piszkozatkezelés, valamint a visszaállítás egységesítése. |
| TI01–TI04 | Hátravan    | Szerződések, opcionális cél, v10 és szerveroldali mentés.                       |
| TI05–TI08 | Hátravan    | Indító felület, adatkezelés, publikálási szabályok és kiadás előkészítése.      |
| TI09      | Hátravan    | Izolált alkalmazáspróba és tartalmi ellenőrzés.                                 |
| TI10      | Hátravan    | Kiadás, saját fiókos végigpróba és fokozatos bevezetés.                         |

## Napló

- A hét tervdokumentum közös könyvtárba került. A repó dokumentumindexe és a fejlesztési főterv ide mutat.
- A meglévő konténeres CI és az izolált image-próba adja az újrahasználható ellenőrzés alapját. Az alkalmazáspróba a kiadásra szánt image-et futtatja eldobható adatbázissal, tesztfiókkal és szimulált AI-válaszokkal. A 049-es első esetek a régi történet folytatása, az új indítás, a piszkozat visszatöltése és a fejezet elszámolása. A próba helyi és CI-futtatását az első megvalósítási csomagokkal együtt kell kialakítani.

- TI01: az öt történetirány és az ötven kezdőhelyzet bekerült a katalógusba. Külön fájlban vannak az angol és magyar megjelenítési szövegek. A cél nélküli indítás sémája elkészült; az API még a meglévő sémát használja. A két új kérési JSON Schema elkészült, a meglévő exportok változatlanok. A contracts típusellenőrzése és a két célzott tesztfájl 25 esete sikeres.

- A tárolt életben az üres céllista irányhoz kötött. A szereplőhivatkozásoknak létezniük kell a kezdeti állapotban. A v10 külön policyval szerepel a szerződésben. A cél nélküli és a politikai irányú élet nyilvános előnézete és nyilvános elágazási vetülete típusos hibával zárul. A csomagbuild, a sémaexport és 66 célzott teszt sikeres, köztük a befagyasztott v8/v9 kérések. Az irányellenőrző külön próbája is zöld.

- A cél nélküli élet címét a felületi címkékből állítjuk össze. A v10 motor a választott irányt szerver által előállított keretként kapja, a szabad szöveg a felhasználói bemenetben marad. Az öt v10 prompt elkészült első jelöltként. A csomagbuild és 39 célzott teszt sikeres, köztük a v8/v9 rögzített kérései és a cél nélküli élet projekciója. A v10 szerveroldali kiválasztása és végigpróbája még hátravan.

- TI04: az API és az adatbázis összekötve. Az indítás egyező revízió és tartalom mellett üríti a felhasznált piszkozatot. A régi kliens vagy a kikapcsolt funkció mellett szerkesztett közös mezők mentése megőrzi az irányt. Az adatbázis- és workerpróba cél nélküli életből is mentett első fejezetet, majd kikapcsolt új indítás mellett döntést és következő fejezetet. A csomagbuild, az API típusellenőrzése és a 90 esetből álló regressziós futás sikeres volt. A kibővített v10 teszteset külön is sikeres.

## Nyitott kérdések és problémák

- A piszkozat mentési szabálya és a visszaállítás előfeltétele bekerült a szerződés- és kiadási tervbe. A szerveroldali mentés és az érintett tesztek elkészültek a TI04 csomagban.
- A kivételes visszaállítás tervében tisztázni kell az üres cél visszafordítható kezelését, a piszkozat azonosságának ellenőrzését és az archívum felülvizsgálati határidejét.
- A végleges kérdésszövegek, az érzékeny kapcsolati válaszok kezelése és a későbbi fizetős próbák kerete az áttekintés nyitott döntései között szerepel.
