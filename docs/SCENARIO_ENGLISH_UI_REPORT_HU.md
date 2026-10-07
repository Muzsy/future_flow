# alterward — angol Scenario-olvasó, kiadás és személyes indulás

2026-10-07 · P12 UI-integráció · Normál kapcsolók kikapcsolva

## Megvalósítás

Az angol `/scenarios/:slug` olvasó teljes, ellenőrzött sablont mutat: identitás, környezet, valamennyi cél és tradeoff, kezdő munka/lakóhely/pénzügy/energia/idő, szereplő, tulajdon, készség, lehetőség és típusos feltétel. A zárt reader-sémát és a teljes sablon hash-ét ellenőrzi. A névtelen capability külön élő forrásellenőrzéssel és a runtime/forrás két engedélyével jelzi, elérhető-e a személyre szabott indítás; személyes profil nincs a projekcióban.

A `/scenarios/publish/:versionId` saját kiadási felület a teljes, aktuális review/curation/source-grant alapján kapja meg a saját kiadható sablont. Külön választható a személyre szabás engedélye, majd ingyenes teljes immutable publikálási előnézet, az exact copy jóváhagyása és — ha engedélyezett — külön személyre szabási megerősítés következik. Kiadási történet és aktív saját példány visszavonása a publikálási kapcsoló leállítása után is elérhető. Official Scenario és Official Life eredetjog külön marad.

A személyes indítás angol űrlapja teljes saját profilt ad: saját/alternatív identitás és korcsoport, saját elsődleges cél/motiváció/tradeoff/horizont, munka/hely/pénzügy/energia/idő, készségek, saját álnevű szereplők/tulajdon/lehetőségek, mind a négy típusos feltétel erősség/scope/dátum szerint, és opcionális kontextus. A saját form egy elsődleges célt készít; a Scenario elsődleges témája az előnézetben külön másodlagos cél. A forrás kezdő tényállapota és korlátai nem kerülnek automatikusan a személyes profilba. Ismeretlen mezők üresek maradnak. A teljes server preview-t, saját profil-egyezést és a beágyazott composition/outer hash-t is ellenőrizzük.

Felnőtt/privacy beleegyezés, saját tények előnézeti jóváhagyása és a teljes mentett előnézet utáni életindítás külön lépések. A start az előnézetben visszakapott teljes változatlan profilt küldi; siker után a normál privát `/life/:branchId` nézetre vezet. A [backend](PERSONAL_SCENARIO_START_REPORT_HU.md) új kánont és egy normál AI-jobot hoz létre tranzakciósan. Olvasás/előnézet nem indít fizetett AI-t. A saját életben élő, saját attribution látható, visszavont/törölt forrásnál a link eltűnik, az önálló élet megmarad.

## Biztonsági és működési határ

A privát API minden kérése a kezdeményező Supabase-fiók azonosítójához kötött. A fiókváltás új saját komponenst és üres saját jóváhagyásokat/előnézetet/request-key állapotot ad; késői válasz nem írhat másik fiók felületére. Bizonytalan start/Confirm válasz ugyanazzal a kulccsal oldható fel, nem automatikus új request/paid retry. Bizonytalan állapotban a szerkesztési visszalépés tiltott, amíg az eredeti kérés nem tisztázott. Lejárt előnézet új indításra nem használható; korábbi start pontos újraolvasását a backend külön idempotenciával védi.

A nyilvános reader 30 másodpercenként, fókusz/visszatérés/láthatóság után újraellenőrzi a forrást; sikertelen ellenőrzés vagy rejtett tab esetén az aktuális másolat elrejtődik. Az owner Confirm/start a szerveren minden friss műveletnél ismét élő source/consent/hash/expiry ellenőrzést kap. Saját API no-store, nyilvános fetch no-store/credentials omit/no-referrer; új Scenario-oldalak noindex/nofollow/noarchive. Login-return csak a pontos publikus Scenario-reader útvonalra bővült, owner/publish/query/credential és külső redirect továbbra tiltott. A szövegeket React escape-eli, JSON/nyers HTML szerkesztő nincs a termékfolyamatban.

Új support API: saját GET `api/v2/scenario-publications/versions/:versionId/source` és `/publications`; névtelen GET `api/public/scenario-personalization/:slug`. Három additív `scenario-ui-1` DTO/JSON-séma. A korábbi 159 séma és 001–036 migráció változatlan; új adatbázistábla vagy SQL-módosítás nincs.

## Ellenőrzés

Három új PGlite/HTTP-próba: mindkét engedély/runtime, withdrawal/fail-closed; saját teljes source/foreign 404 és feature-off withdrawal history; verified Auth/strict query/no-store/minimális projekció. Öt új böngészővel kompatibilis hash-binding próba: teljes reader/source/permission/profile/composition, idegen source/verzió, megváltozott pénzügyi tény, nested hash és többlet authority elutasítása. A célzott sorozat 20 teszt/3 fájl sikeres, új paid AI 0. A teljes új check/build és a pontos új CI eredménye külön kerül lezárásra.

A megelőző a72c939 runtime [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37674410965) verify/container sikeres, 610/55/159, 001–036/repeat és a nyolc personal Scenario real-PG proof. A [38 tényleges Auth/HTTP-próba](PERSONAL_SCENARIO_START_REPORT_HU.md) is sikeres, két szintetikus fiók teljes cleanupjával, 0 paid AI-val. Ezek backend/HTTP bizonyítékok. Pozitív interaktív új UI-próbát a korábban rögzített helyi böngészőeszköz-korlát miatt nem állítunk; nem kerültük meg. A valódi személyre szabott AI-történet minőségi próba és a béta kínálat még következik.

## Aktuális indulási terv

A felhasználó **10 USD közös induló keretet** választott: 8 USD OpenAI + 2 USD Claude, **15 angol élet / 5 Scenario és 10 fős zárt béta**. Seed maximum 6 + 1 USD; a teszthasználatra elkülönített 2 + 1 USD nem költhető seedre. A korábbi 10 + 5 USD használati keretet ez felülírja. A 50–100 élet/20–30 Scenario cél a béta után marad, teljes nyilvános indulás külön lépés. [Becslés és döntés](INITIAL_CATALOG_COST_ESTIMATE_HU.md) · [Költségkorlátok](AI_PRODUCTION_BUDGET_HU.md).

A kész UI nem jelent aktiválást vagy Contabo-telepítést. Szükséges a védett, folytatható seed/audit előállítás, a 10 tesztelőre korlátozott belépés, éles email/Auth/backup/restore/DB-recovery és Contabo/DNS/TLS, lezárt adatkezelési tájékoztató és kapcsolattartási email. Müller Ákos üzemeltetői neve rögzítve és a privacy felületen megjelenik; emailt nem találtunk ki. P13, P11 retention és Shared S3–S7 teljes scope megmarad: [következő lépések](NEXT_STEPS.md).


## Teljes helyi check lezárva

`pnpm check`: 618 teszt/56 fájl, format, minden package/API/worker/web és script types, production build sikeres; 162 séma, korábbi 159 változatlan. A végső form/lejárati/fiók-epoch finomítás után a külön teljes format és web types/production build is sikeres. A szerkesztés visszatölti az előző saját profilt, új jóváhagyással; gyors A→B→A fiókváltás is új saját session-verziót kap. Új migration nincs. Pontos új CI még külön ellenőrizendő, új paid AI 0.
