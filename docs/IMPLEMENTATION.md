# alterward — jelenlegi implementáció, 2026-10-03

Ez a dokumentum a működő v1 prototípust és a külön elkészült v2 könyvtári alapot írja le. `docs/contracts/*.schema.json` a v1, `docs/contracts/v2` az új szerződés. A következő verzió a [pozicionálás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) és [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) szerinti [aktív terméktervre](PRODUCT_PLAN_HU.md) épül; sorrendje a [backlog](NEXT_STEPS.md). Az eredeti ZIP változatlan.

## Új, elkészült könyvtári alap és márkanév

A felület fejlécében/láblécében, böngészőcímében, exportfájl-nevében és OpenAPI címében **alterward** szerepel. A repó/belső `@future-flow/*` nevek és korábbi tárolt azonosítók kompatibilitásból megmaradnak.

V2 életbemenet/tényállapot/időszak/korlátséma és determinisztikus validátor, 20 új domain-teszttel: tényleges munka/tulajdon átmenet, ismeretlen opcionális adat, cél/szereplőhivatkozás, scope/idő/döntés szerint érvényes hard/soft korlát és a döntésnél megálló időszak. [Szerződés és határok](V2_SIMULATION_CONTRACT_HU.md).

V2 tárolási migráció, v2 API/worker, rövid AI-időszak és folytatás még nincs bekötve. Publikálás/Discovery/Official seed/Community fork tervezett a [nyilvános megvalósítási tervben](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md). Régi szerződés és `001_foundation.sql` változatlan; ez a szelet nem használt OpenAI-kreditet.

## Többnyelvű alap

Angol alapnyelv és választható magyar a teljes meglévő felületen, kérdőívben és biztonságos API-hibákban. A nyelvválasztás cookie-ban marad meg; HTML/metadata/dátumok a választott felületnyelvet követik. Új élet `content_locale` mezője és job `locale` értéke mentett, az ág ezt örökli. A `002_content_locale.sql` korábbi életeket magyarra jelöl, az új beszúrás alapértéke angol, a mező utólag nem módosítható. A v1 profilok/canon változatlanok. Nyelvi promptok és nyelvi történethűség-ellenőrzés, további nyelvekre bővíthető regiszter/katalógus. [Részletek és ellenőrzés](LOCALIZATION_HU.md).

## Eltérés az új termékcéltól

A jelenlegi generálás tízéves horizontra készít 5–10 eseményt és 2–3 fejezetet. A 29 kérdéses profilból indul, és minden döntési választás új gyermekágat hoz létre. Elmentett életág megtekinthető, de következő rövid időszak ugyanarra az ágra még nem generálható.

A működő v1 életállapot elsősorban számszerű mutatókat tárol. A `ff_world_versions` semleges környezet, nem teljes World State. A v2 tény/szereplő/cél/korlát könyvtári alap már elkészült, de tárolás és AI bekötése, időszakos folytatás, rövid onboarding, emlékezet/folytatási mérés még fejlesztendő. A v1 constraint mezők önmagukban nem jelentenek kész domain-validátort.

A lent leírt szerződések jelenlegi állapotként érvényesek; a v2 célállapotot nem állítják késznek. Az új időszakos működés additív migrációval és verziózott API-val készül, a régi profilok és canon megőrzésével.

## Elfogadott döntések

- **Felhasználói döntés:** az első használható verzióban valódi AI-generálás van. Az AI nélküli demo elvetve; csak automatizált tesztekben használunk helyettesítőt.
- **Felhasználói döntés:** OpenAI az első szolgáltató.
- **Felhasználói döntés:** Supabase-integráció és beállítási útmutató.
- **Felhasználói döntés:** `Muzsy/future_flow`, közvetlen munka a `main` ágon.
- **Felhasználói döntés:** angol alapnyelv, választható magyar és további nyelvekre előkészített szerkezet. A jelenlegi szcenáriók földrajzi környezete Magyarország; a felület és az új történet angol is lehet. Életkor helyett 18+ korcsoport.
- Next.js web + NestJS API + külön worker ugyanazon moduláris kódbázissal. Nincs külön mikroservice-domain.

## Egységes adatmezők

- Időpont: `effectiveAt`, `YYYY-MM-DD` formátumú szcenáriónap.
- Életállapot: `career`, `finance`, `social`, `internal`.
- Karriermezők: `employmentStatus`, `satisfaction`, `stability`, `growthOpportunity`.
- Uncertainty: `low | medium | high`; nem valószínűség.
- Constraint: `type`, `operator`, `strength`, `description`.
- Trait-ek: önbevallott 0–100 értékek. A kezdeti verzió nem állít pszichometriai vagy AI-confidence pontosságot.
- Minden profilpillanatképben saját másolatban szerepelnek a kapcsolatok és a célok; későbbi címkemódosítás nem változtatja meg a korábbi jövőt.
- A profilverzió tartalmazza a szerződés-, kérdőív- és scoring-verziót, valamint a bemenetet és hash-t.
- Az induló ismeretlen energia, kontrollérzet és karrierstabilitás semleges 50-es szerkesztési érték; nem becslés a személyről.

## Tárolás és elágazás

A profilpiszkozat válaszokat, kapcsolati adatokat és monoton revisiont tárol. Az elavult revisionnel érkező mentés 409-es hibát kap. Egy piszkozatverzió csak egyszer commitolható.

A profilverziók, világállapotok, események és életállapotok SQL-triggerrel védettek a módosítástól. A harmadik személyek címkéi a profilverzió részei. A semleges világállapot nem külső gazdasági adat.

Minden decision resolution külön rekordot kap. Ugyanaz a döntés több különböző opcióval új ágakat nyithat. A child branch a szülő fork eseményéig örökli a közös előzményeket; az új eseményeket saját ágon tárolja. Nem másolja és nem módosítja a közös előzményeket.

Az alapidővonal egy lehetséges baseline. A döntés utáni eredeti baseline nem felhasználói választás. A választott opció hatásai az új ág induló állapotában érvényesülnek.

## Tartós feladatok

Első megvalósítás: PostgreSQL jobs tábla és `FOR UPDATE SKIP LOCKED`, külön queue-infrastruktúra nélkül. A job és a future/branch azonos tranzakcióban keletkezik, ezért nincs elvesző enqueue. A PGMQ későbbi adapterként bevezethető; az API nem függ tőle. Ez eltérés a v0.1 PGMQ-javaslatától, a tranzakciós egyszerűség és a hordozható tesztelés érdekében.

Minden worker-claim egyedi lease tokent kap. A worker heartbeatet küld; lejárt lease után másik worker átveheti. Elveszett lease mellett a canon nem commitolható. Minden eredmény egyszeri tranzakcióban rögzül. Az esemény- és történetgenerálás külön checkpoint, így worker-újraindítás után a már elkészült szakasz nem hívja újra az AI-t.

Kérésoldali idempotencia kötelező future és decision resolve esetén. Azonos kulcs + eltérő bemenet 409. A kliens frissítés után a `/job/:id` címen folytatja a státusz követését.

## AI és minőség

OpenAI Responses API, JSON Schema / Structured Outputs, `store:false`, szerveroldali kulcs. Az alapmodell konfigurálható; a helyi kezdő beállítás `gpt-6.1-sol`. A kód nem függ a konkrét modell nevétől.

Az eseménygenerátor (`AI_EVENT_MODEL`), narrátor (`AI_STORY_MODEL`) és ellenőrző (`AI_CHECK_MODEL`) külön konfigurálható. Ellenőrző beállításának hiányában az eseménymodell marad a v1-kompatibilis alapérték. A mintabeállítás minden szerepre Sol; a Luna-eseménygenerátor feltételes jelölt, még nem aktivált alapbeállítás. A [modellspecifikus költségvizsgálat](AI_MODEL_ROUTING_HU.md) a két feladat szétválasztását és a kísérlet határait is leírja.

Pipeline: AI-események → sémavizsgálat → szereplő/időrend/döntés ellenőrzése → determinisztikus state transition → AI-fejezetek → referenciasémák ellenőrzése → külön AI fidelity/safety ellenőrzés → tranzakciós commit.

A történetellenőrző AI sem garantál hibátlan szemantikát. Emberi magyar minőségértékelés és safety-eval szükséges az alfához. A raw prompt nem kerül logba; auditként model/prompt verzió, tokenhasználat, időtartam és hash tárolódik. Az alkalmazás pénzbeli költségösszesítése még későbbi feladat. A helyi `smoke:ai` próba külön, dátumozott árbeállítással és megőrzött fogyasztási naplóval korlátozza a kísérletek költségét; ez nem helyettesíti a teljes alkalmazás költségőrét.

Reprodukálhatóság: a mentett canon és determinisztikus átmenetek visszajátszhatók. Azonos seed nem jelent azonos új LLM-választ. Újragenerálás új run; nem módosítja a régit.

## Adatkezelés és alfa

Az adatletöltés és törlés már az alfa alapfolyamatának része; nem prémiumjogosultság. A későbbi prémium export csak külön formázott narratív dokumentumot jelenthet. Az export/törlés és jogosultsági tesztek minden esetben release-feltételek; az eredeti 18/20-as élménygate nem enged biztonsági hibát.

Az alkalmazás a Supabase Auth szerveroldali `getUser` ellenőrzését használja. A JWT AMR-ben friss tényleges hitelesítés szükséges export és törlés előtt; tokenfrissítés önmagában nem elegendő.

Az anon/authenticated adatbázis-szerepkör nem kap közvetlen táblahozzáférést. A canonical táblákon RLS engedélyezett, böngészőoldali policy nélkül; minden adat a NestJS API-n át érhető el.

Fióktörlés: a belső fiók deleting állapotba kerül, folyamatban lévő jobjai elvesztik a lease-t, majd törlődik az Auth-fiók és a teljes belső adatgráf. Auth-hiba esetén a belső fiók aktívra áll vissza. Auth-siker és későbbi DB-hiba esetén admin helyreállítás szükséges; ezt az indulás előtti ops-feladatok között kezeljük.

## Hivatalos implementációs források

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Supabase JWT-mezők](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [PostgreSQL SELECT / SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html)
