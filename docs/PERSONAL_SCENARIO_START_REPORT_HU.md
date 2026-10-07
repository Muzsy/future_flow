# alterward — saját élet indítása egy Scenario alapján

2026-10-07 · P12 következő szelet · Angol tartalom · Normál funkciókapcsolók kikapcsolva

A nyilvános, teljesen ellenőrzött Scenario most külön **privát személyes előnézettel** készíthető elő. A felhasználó teljes, jóváhagyott saját identitása, elsődleges célja, kezdőállapota és korlátai adják az új élet alapját. A Scenario témája másodlagos célként megmarad. Az indítás külön megerősítést kér a teljes előnézethez és a változatlan személyes profilhoz.

Az előnézet elkészítése adatbázis-művelet; fizetett AI-hívás nincs. A jóváhagyott indítás egy új privát életet, friss belső azonosítókat, egy gyökérágat és egy normál AI-feladatot hoz létre. A valódi történetgenerálást a meglévő OpenAI worker és közös kvóta/költségőr végzi. A forrás Official Scenario minősítése az új privát életnek nem ad Official Life eredetigazolást.

## Jóváhagyás és ismétlés

A teljes személyes profil explicit bemenet; profilazonosítóval más felhasználó adatai nem kérhetők le. A saját elsődleges cél, a teljes kezdőállapot és az összes saját korlát a korábbi [composition-szabályokat](SCENARIO_PERSONALIZATION_FOUNDATION_REPORT_HU.md) követi. Az előnézet a teljes összeállított ténygráfot, a helyettesítések listáját, a forrás/profil hashét és külön megerősítési hasht tartalmaz.

A saját előnézet 30 percig indítható. Lejáratkor az adatbázis tényleges óráját használjuk, a zárolások megszerzése és a forrás újraellenőrzése után. Ugyanazzal a kéréskulccsal történő pontos ismétlés ugyanazt a létrehozott életet adja, további job nélkül; megváltozott kérés 409. Egy előnézetből egy életindítás készülhet; másik élethez új előnézet és külön megerősítés szükséges.

A sikeres indítás pontos ismétlése a funkció kikapcsolása, a forrás visszavonása vagy törlése után is a meglévő saját életet adja vissza. Saját élettörlés után a régi indítási kulcs 410 választ ad, az élet nem jön létre újra. Az adott élethez használt személyes előnézetet is töröljük. A napi generálási keretet az élettörlés nem nullázza le.

## Élő forrásjog és önálló privát élet

Új előnézet és indítás csak aktív nyilvános másolatból, külön engedélyezett személyre szabással, élő forrásengedéllyel, aktuális teljes review/evidence/kurátori minősítéssel készül. Visszavonás, moderáció, forrásmódosítás, grant-revoke és fióktörlés megállítja az új felhasználást. A forrás és a saját felhasználó zárolása rendezett sorrendű; a forrás olvasásának UPDATE zárolását a kezdeti zárolás is követi.

A már létrejött saját élet saját kánonnal folytatható. Fizikai forrástörléskor a forráskapcsolat és a régi előnézet kapcsolata leválik; a privát élet megmarad. Az attribution saját olvasója csak még elérhető forrásra ad címet és linket, különben `source: null`. Privát forrástörténet, más felhasználó profilja, shared tagság, korábbi AI-receipt vagy nyilvános kiadási jog nem öröklődik.

## API és tárolás

| Saját, hitelesített végpont | Eredmény |
| --- | --- |
| `POST /api/v2/personal-scenarios/sources/:slug/preview` | Teljes személyes előnézet, külön `Idempotency-Key` |
| `GET /api/v2/personal-scenarios/previews/:id` | Saját, még indítható és aktuális előnézet |
| `POST /api/v2/personal-scenarios/sources/:slug/start` | Explicit megerősítés, változatlan teljes profil, saját élet/ág/job receipt |
| `GET /api/v2/personal-scenarios/lives/:lifeId/attribution` | Saját privát élet minimális, élő forrásmegjelölése |

Minden végpont verified Auth, felnőtt/AI/privacy hozzájárulás, ownership és strict body/query ellenőrzést használ. A válaszok no-store/noindex szabálya a meglévő API-határt követi. A nyilvános Scenario DTO-ba személyes adatok nem kerülnek.

A 036 additív migráció két privát RLS táblát ad: `aw_personal_scenario_previews` és `aw_personal_scenario_starts`. A személyes előnézet immutable; a kezdési eredet csak a törölt forrás/előnézet pointerét engedi nullázni. Összetett FK ellenőrzi az előnézet és a létrehozott élet/ág saját tulajdonosát. Saját export és fióktörlési cascade integrált; közvetlen anon/authenticated táblaengedély nincs.

A worker a lejáratot legalább 24 órával követően, legfeljebb 1000 rekordos SKIP LOCKED adagokban törli az előnézetek személyes payloadját. Normál ütemezése 15 perc; megtelt adag után két másodpercen belül folytatja. Az idempotencia-előzmény csak előnézetazonosítót tárol, személyes profil másolatát nem. Régi, törölt előnézetből ismételt kérés nem rekonstruálja a személyes adatokat.

## Ellenőrzési bizonyíték és hátralévő kapuk

Tíz új izolált PGlite/HTTP-próba sikeres: saját tények és célok, teljes profil/hash/ack, alapértelmezett tiltás és forrásengedély, ownership/Auth, változatlan source, idempotencia, valódi DB-óra szerinti lejárat, normál kvóta-rollback, szelektív törlés/tombstone, retention, saját export/RLS/cascade és három technikai időszak a forrás törlése után. Ezek a technikai AI-fixture-próbák különböznek a valódi szolgáltatói történetminőségi próbától.

Nyolc új valós PostgreSQL-proof kódja elkészült: párhuzamos előnézet és start, ellentétes irányú tulajdonosi zárolások/attribution, három privát időszak forrástörlés után, withdraw/törlés verseny, tényleges contended-lock lejárat, kvóta/törlési újraélesztés tiltása, export/immutabilitás/RLS/cascade. A pontos új commit CI-eredménye külön lezárási bejegyzést kap; a kód puszta meglétét nem tekintjük lefutott bizonyítéknak.

A fejlesztői Supabase 001–036 migrációja alkalmazva és megismételve, a két új tábla üres és privát RLS-védelem alatt van. `PUBLIC_SCENARIOS_ENABLED=false`, `SCENARIO_PERSONALIZATION_ENABLED=false`, operator false. Éles keret nem aktivált, új fizetett AI-hívás nincs, Contabo-telepítés nem történt.

A [nyilvános Scenario backend javított pontos CI-je](https://github.com/Muzsy/future_flow/actions/runs/37669583762) az `ede2499` commiton sikeres: verify/container, 600 teszt/54 fájl/154 séma, 001–035/repeat, nyolc új Scenario PG-proof, korábbi PG/HTTPS/TLS és 0 paid AI. Az eredeti `370370b` container-futás fix 34 migrációt várt; az ellenőrzés most a tényleges migrációs fájlokból számol. Meglévő migrációt nem módosítottunk.

A következő P12 feladat az angol Scenario-olvasó, kiadási Confirm, saját profil és teljes előnézet/indítás UI, tényleges Supabase Auth és valódi AI/Claude minőségi ellenőrzés. Ezután P13 mérések és az indulási kapuk következnek. A teljes P01–P13, Shared S0–S7, retention/backup/ops és az eredeti 50–100 élet/20–30 Scenario tartalmi cél megmarad.

[Teljes következőlépés-terv](NEXT_STEPS.md) · [Forráskiadás](PUBLIC_SCENARIO_PUBLICATION_REPORT_HU.md) · [Jóváhagyott 10 + 5 USD éles keret](AI_PRODUCTION_BUDGET_HU.md)


## 2026-10-07: teljes helyi ellenőrzés

`pnpm check` sikeres: 610 teszt/55 fájl, format, minden package/web/API/worker és scripts typecheck, éles Next/API/worker build. Összesen 159 JSON-séma, a korábbi 154 változatlan. A fejlesztői DB 001–036 alkalmazva/megismételve, két új üres private RLS tábla és normál flags false; 0 paid AI. Az új pontos CI/valós PG/Auth/AI proof még ellenőrizendő.
