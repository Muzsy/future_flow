# alterward — megvalósítási állapot és kísérleti keret

2026-10-03 · Ez a közös állapotpillanatkép. A részleteket az [implementáció](IMPLEMENTATION.md), a [lokalizáció](LOCALIZATION_HU.md) és a [következő lépések](NEXT_STEPS.md) tartalmazzák.

## Ténylegesen elkészült

| Terület | Bizonyíték és határ |
|---|---|
| Technikai alap | Next.js web, NestJS API/worker, PostgreSQL/Supabase Auth, verziózott szerződések, main CI |
| V1 személyes élet | 29 kérdés, mentett/revisionös draft, immutable profilpillanatkép; tízéves, 5–10 eseményes, 2–3 fejezetes valódi AI-generálás |
| V1 elágazás | Opció kiválasztása új gyermekágat indít; közös előzmény és szülőcanon változatlan |
| Tartós job | Tranzakciós enqueue, SKIP LOCKED, lease/heartbeat, esemény/történet checkpoint és idempotencia |
| Nyelvek | Angol alap és választható magyar a teljes meglévő felületen, kérdőívben, API-hibákban és AI-tartalomban; élethez rögzített nyelv |
| Supabase | `001_foundation.sql` és `002_content_locale.sql` alkalmazva, CA/host ellenőrzésű TLS; Auth-konfiguráció elérhető |
| V2 alap | Külön 2.0.0 lifeInput/lifeState/periodCandidate/constraint szerződések és tiszta domain-validátor; 20 domain-teszt. Tárolás/API/worker még v1 |
| Adatkezelési kód | Tulajdonosi ellenőrzések, közvetlen anon/authenticated táblahozzáférés tiltása, friss hitelesítést kérő export/törlés, aktív jobok leállítása |

## Még elkészítendő vagy ellenőrizendő

P01 tárolási szelet → P02 rövid valódi AI-időszak → P03 döntés/folytatás/saját történeti fork → P04 rövid onboarding → P05 emlékezet és alkalmazásszintű keretőr → P06 valódi fiókos végigpróba → P07–P08 minőség/mérés/pilot → P09–P13 public snapshot, Official seed, Discovery, publishing, nyilvános fork és release-kapu.

Nincs kész ugyanazon ágon következő időszak, Discovery, nyilvános publikálás, Save/Share/Report vagy Official seed. A Supabase adminisztratív `service_role`/secret kulcs hiánya a valós Auth-törlés próbájának korábban jelzett függősége. Valódi email-belépéses teljes böngészős folyamat, Auth-siker utáni DB-hiba helyreállítása, backup/restore és végleges adatkezelési/üzemeltetési szabályok még ellenőrizendők. A GitHub main nem jelent nyilvános deployt.

## Ellenőrzött alap

Az utolsó kódellenőrzés: **92 automatizált teszt**, formázás, típusellenőrzés, teljes build és sémaexport sikeres. GitHub CI: [37097898246](https://github.com/Muzsy/future_flow/actions/runs/37097898246), kódcommit [c310d5b](https://github.com/Muzsy/future_flow/commit/c310d5b54f8e3089feeda933022c83435ad0ec4f). Ez a dokumentációfrissítés ehhez a kódállapothoz igazodik.

Valódi OpenAI-próbák szintetikus adatokkal: három magyar v1 alapélet és három gyermekág; külön modellkísérlet; majd angol alapélet/ág és magyar alapélet/ág. A nyelvi próbák sémája, domainje, fejezethivatkozásai és AI-fidelity ellenőrzése sikeres, a szülő változatlan. A teljes [angol AI-minta](examples/AI_ENGLISH_STORY.md) olvasható. Ezek nem v2 folytatási, emberi minőségi vagy retenciós bizonyítékok.

Böngészős ellenőrzés: angol alap, nyelvváltás/újratöltés, HTML/metadata, főoldal, login/signup és privacy feliratok; 390 px mobilon nincs vízszintes túlcsordulás. Privát fiókos végigpróba még nem történt. Az AI-próbák izolált PGlite adatbázist használtak, valódi Supabase-fiókot nem hoztak létre.

## Az 5 USD fejlesztői AI-keret

| Lezárt sorozat | Hívás | Tokenalapú becsült költség, USD |
|---|---:|---:|
| V1 magyar alapok és ágak, Sol | 18 | 0,6299505 |
| Modellvizsgálat, Luna és Sol kontroll | 14 | 0,0542136 |
| Angol/magyar alapok és ágak | 12 | 0,3352520 |
| **Összesen** | **44** | **1,0194161** |
| **5 USD-ből számított maradvány** | | **3,9805839 ≈ 3,98** |

Ez dátumozott tokenbecslés, nem lekérdezett szolgáltatói kreditegyenleg. Ismeretlen fogyasztású hívás nincs. A guard konzervatív kerekítéssel körülbelül 1,019465 USD-t tart nyilván; foglalásnál ezt és az esetleges nyitott foglalásokat használjuk. A dokumentációfrissítés nem indított fizetett OpenAI-hívást.

Az összes fejlesztői próba a közös `.local/ai-smoke/usage.json` naplóval számol, egy folyamatban. Kérés előtt számolt bemenet + maximális kimenet foglalása kell; megszakadt, ismeretlen fogyasztás esetén a teljes foglalás megmarad. Alaplimit 1 USD, explicit `SMOKE_BUDGET_USD` legfeljebb 5 USD. A korábbi 44 hívás is beleszámít: az 1 USD alaplimit most már új kísérletet megállít. Az 5 USD nem futtatásonkénti új keret.

A jelenlegi modellek minden alkalmazásszerepnél Sol; Luna eseménygenerálás csak mérendő jelölt. A régi tokenmixből számolt körülbelül 40% megtakarítás nem v2/angol-magyar minősített eredmény. [Modellvizsgálat](AI_MODEL_ROUTING_HU.md).

50–100 Official Life és 20–30 Scenario a nyilvános indulás összesített tartalomcélja. Nem indítunk ennyi generálást automatikusan: előbb kis v2 pilot és tényleges költségmérés kell. A további keret, ha szükséges, külön felhasználói döntés. Olvasás, nyelvváltás, Save és Share nem indíthat fizetett AI-hívást.
