# alterward — többnyelvű felület és AI-történetek

2026-10-03 · Angol az alapnyelv, magyar választható. A teljes meglévő v1 felület és történetgenerálás támogatja mindkettőt. A rövid időszakos v2 működés és Discovery fejlesztése ugyanilyen nyelvi feltétellel folytatódik; ezek még tervezett termékfunkciók.

## Felület és tartalom

| Terület | Megvalósítás |
|---|---|
| Nyelvek | Közös `supportedLocales`, `Locale`, `languages` regiszter; jelenleg `en`, `hu` |
| Első megnyitás | Angol, a böngésző automatikus nyelvfelismerésétől függetlenül |
| Választás | English / Magyar a fejlécben; egyéves `alterward_locale` cookie, HTTPS-en Secure, SameSite=Lax |
| Felület | Típusos angol/magyar katalógus: főoldal, belépés, profil, kérdőív, kapcsolatmezők, összegzés, generálás, életek, történet/idővonal/compare, export/törlés és adatkezelés |
| HTML és metadata | A szerver cookie alapján adja a nyelvet, címet/leírást; kliensváltás azonnal frissít |
| Dátumok | Locale szerinti Intl-formázás; szcenáriónap UTC, dátumeltolás nélkül |
| API | `Accept-Language`, alapérték angol; kérdőív és kódalapú biztonságos hibaszöveg lokalizált |
| Új élet | Explicit `locale` a létrehozás kérésében, mentett `ff_futures.content_locale`, jobpayloadban `locale` |
| Elágazás/újraindítás | A gyermekág és minden AI-lépés a mentett életnyelvet követi |
| Korábbi életek | A `002_content_locale.sql` magyarra jelöli; történet, esemény, profil és hash nem változik |
| Új v2 életbemenet | Kötelező `locale`; az adatbázis/API/worker bekötése következő feladat |

A felületnyelv és a történet nyelve külön fogalom. Új élet a választott felületnyelven készül. Egy angol élet későbbi döntése magyar felület mellett is angol folytatást/ágat ad, így a közös történet nem kever nyelveket. A mentett tartalomnyelv nem írható át. A történet eredeti nyelve látszik; eltérő felületnyelvnél külön üzenet tájékoztat. Az AI-szövegek megfelelő `lang` jelölést kapnak.

Nyelvváltás a profilválaszokat, opcióazonosítókat, pontozást és felhasználó által írt címkéket nem fordítja át. Az angol kérdőív a v1 kérdőív megjelenítési változata, ugyanazokkal a kulcsokkal/értékekkel/verziókkal; a tárolt magyar definíció hash-e változatlan. A `localizationVersion` külön megjelenítési verzió. Az aktuális kérdőív földrajzi kiindulása továbbra is Magyarország; a nemzetközi környezetsablon külön szcenáriófejlesztés.

Korábbi magyar történetekhez jelenleg nem készül automatikus angol fordítás. Ez külön, költséggel járó szövegprojekció lehetne; nem írna át canont vagy korábbi fejezetet. A már mentett magyar élet és az új angol élet egyszerre elérhető. Nyelvválasztás, történetolvasás és újratöltés nem indít AI-hívást.

## AI és minőség

Az eseménygenerátor, narrátor és történethűség-ellenőr zárt regiszterből kapja az English/Hungarian kimeneti nyelvet. Minden olvasónak szánt cím/összefoglaló/indok/döntés/opció/fejezet/ellenőrzési megjegyzés ezen a nyelven készül. JSON-kulcs, enum, UUID, profilérték és tulajdonnév változatlan. Más nyelven írt cél vagy bemeneti prompt nem változtathatja meg a választott nyelvet.

Promptverzió: `simulation_events.v2.en|hu`, `story_chapters.v2.en|hu`, `story_fidelity.v2.en|hu`; auditban külön `locale`. A régi, nyelv nélküli jobok magyarul folytatódnak, checkpointjuk megmarad. A szolgáltató közvetlen új hívásának alapértéke angol. Modellbeállítás és fizetési/retry védelem változatlan, Responses `store:false`. A nyelvi ellenőr is AI, ezért a technikai ellenőrzés mellett emberi angol/magyar értékelés kell. A [Responses nyelvi utasításai](https://developers.openai.com/api/docs/guides/text) rendszerüzenetbe kerülnek, a felhasználói adatok külön üzenetbe.

`pnpm smoke:ai family en` valódi angol eseményeket/fejezeteket/ellenőrzést és döntési ágat készít. `pnpm smoke:ai family hu` magyar változat. Egy közös, korábbi fogyasztást is tartalmazó költségnapló és kérés előtti tokenfoglalás védi az 5 USD kísérleti keretet. A nyelvi munka nem jelent olcsóbb modell automatikus bekapcsolását.

## Új nyelv hozzáadása

1. Regisztrálni kell a kódot, natív nevet, Intl taget és AI-nyelvnevet a `packages/contracts/src/locales.ts` fájlban.
2. Teljes, angol kulcsokkal és azonos interpolációs paraméterekkel rendelkező katalógus szükséges az `apps/web/lib/i18n/messages.ts` mellett, bekötve a `messages` mapbe. Nincs fordítatlan nyelv a választóban.
3. Az összes kérdőívfelirat/help/section/opció fordítása és az API/auth/domain hibák megfelelő változata szükséges. Kulcsok, opcióértékek és pontozás változatlanok maradnak.
4. A nyelvi egyezést biztosító tesztek, valódi AI-esemény/narratíva/fidelity próba és emberi értékelés után engedhető a választóban. A SQL nyelvkódellenőrzése további nyelvekre alkalmas, nem kell nyelvenként új oszlop.
5. RTL nyelvnél `dir` kezelés és felületi próba; más földrajzi világ/pénznem nem következik automatikusan a nyelvből. Publikus SEO-nyelvútvonal/hreflang a Discovery bevezetésekor külön feladat.

A jelenlegi angol/magyar regiszter a támogatott nyelvek egyetlen forrása. A kód típusellenőrzése hiányzó katalogizált kulcsot jelez; a tesztek a paraméteregyezést és a kérdőív adatkompatibilitását is ellenőrzik. Az új nyelv fordítási katalógusokkal bővítendő, nem karakterláncok cseréjével a komponensekben.

## Nyilvános tartalom terve

ScenarioVersion/PublicSnapshot tartalomnyelve, Discovery nyelvi szűrés és fordított kategóriák kötelezők. Official seed teljes angol élményt és magyar mintákat ad; a 50–100 élet/20–30 szcenárió összesített cél, nem nyelvenkénti új generálás. Olvasáskor nincs fizetett fordítás. Publikus fordítás külön moderált/verziózott projekció lehet; sanitized checkpoint eredeti állapota és az új privát élet nyelve explicit. [A nyilvános terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) ezt tartalmazza.

## Ellenőrzés

92 automatizált teszt: teljes katalogizált szöveg/paraméteregyezés, minden kérdőívmező/érték kompatibilitása, angol alapérték, fejlécprioritás, lokalizált API-hiba, nyelvhez kötött idempotencia, immutable életnyelv, gyermekág öröklése, workercheckpoint és régi job magyar nyelve, változatlan migrált történet. A v1 domain- és jogosultsági tesztek megmaradtak. A valódi AI- és böngészős próba alább dokumentált.


### Valódi AI- és böngészős próba

Angol család/karriercél és magyar kreatív/tanulási cél, mindkettőnél alaptörténet + alternatív ág: 9 alap-esemény, 3 alapfejezet és 11 gyermekági esemény (örökölt előzménnyel), 3 új fejezet. Mindkét nyelven sikeres séma/domain/narratívahivatkozás/fidelity-ellenőrzés; szülőág változatlan, tartalomnyelv és audit helyes. Az angol bemenet magyar profilcélokat/címkéket tartalmazott, az eredmény angol. [Teljes angol AI-minta](examples/AI_ENGLISH_STORY.md).

A nyelvi próba 12 új valódi OpenAI-hívást használt (6 angol, 6 magyar), további 0.3352520 USD becsült költséggel. A teljes 44 hívás összesített tokenbecslése 1.0194161 USD; az 5 USD keretből számított maradvány körülbelül 3.98 USD. Ez nem lekérdezett szolgáltatói egyenleg. Ismeretlen fogyasztású hívás nincs.

Böngészőben ellenőrizve: angol alap, English/Magyar váltás, megmaradó nyelv újratöltéskor, HTML/metadata, kezdőlap, belépés/regisztráció feliratai, adatkezelés, valamint 390 px mobilnézet vízszintes túlcsordulás nélkül. A privát bejelentkezéses végigpróba továbbra P06 függőség; ez a próba nem hozott létre valódi Supabase Auth-fiókot. A 002_content_locale.sql a Supabase-on lefutott, TLS-kapcsolat ellenőrizve.
