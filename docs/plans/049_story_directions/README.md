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

## Nyitott kérdések és problémák

- A piszkozat mentési szabálya és a visszaállítás előfeltétele bekerült a szerződés- és kiadási tervbe. A szerveroldali megvalósítás és teszt a TI04 csomag feladata.
- A kivételes visszaállítás tervében tisztázni kell az üres cél visszafordítható kezelését, a piszkozat azonosságának ellenőrzését és az archívum felülvizsgálati határidejét.
- A végleges kérdésszövegek, az érzékeny kapcsolati válaszok kezelése és a későbbi fizetős próbák kerete az áttekintés nyitott döntései között szerepel.
