# alterward — jelenlegi implementáció, 2026-10-04

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A három forrás teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

Ez a dokumentum a működő v1 prototípust és az integrált v2 időszakos életet írja le. `docs/contracts/*.schema.json` a v1, `docs/contracts/v2` az új szerződés. A következő verzió a [pozicionálás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) és [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) szerinti [aktív terméktervre](PRODUCT_PLAN_HU.md) épül; sorrendje a [backlog](NEXT_STEPS.md). Az eredeti ZIP változatlan.

## Új, elkészült időszakos élet és márkanév

A felület fejlécében/láblécében, böngészőcímében, exportfájl-nevében és OpenAPI címében **alterward** szerepel. A repó/belső `@future-flow/*` nevek és korábbi tárolt azonosítók kompatibilitásból megmaradnak.

V2 életbemenet/tényállapot/időszak/korlátséma és determinisztikus validátor, 20 új domain-teszttel: tényleges munka/tulajdon átmenet, ismeretlen opcionális adat, cél/szereplőhivatkozás, scope/idő/döntés szerint érvényes hard/soft korlát és a döntésnél megálló időszak. [Szerződés és határok](V2_SIMULATION_CONTRACT_HU.md).

V2 tárolás/API/worker, hat hónapos valódi AI, aktuális választás, ugyanazon ág folytatása, saját történeti fork, 12 lépéses angol onboarding, memória/célzott javítás és alkalmazás-költségfoglalás elkészült. 001–007 migráció alkalmazva. [Pontos v2 viselkedés és határok](V2_IMPLEMENTATION_REPORT_HU.md). A további szakaszokban leírt v1 tízéves működés kompatibilis archívumként megmarad; valódi Auth/UI/export/törlés és kontrollált recovery sikeres. Public rendszer és éles ops még nyitott; használói minőség a béta után mérendő.

## Többnyelvű alap

Kizárólag angol felület, kérdőív és biztonságos API-hiba; a nyelvválasztó elrejtve. HTML/metadata/kliens régi magyar cookie mellett is angol. Új v1/v2 élet és v2 draft csak `en` kéréssel hozható létre; magyar listatartalom és közvetlen olvasás/folytatás/fork/retry az API-n elrejtve. Régi HU adatok saját exportban megmaradnak. Új élet `content_locale` mezője és job `locale` értéke mentett, az ág ezt örökli. A `002_content_locale.sql` korábbi életeket magyarra jelöl, az új beszúrás alapértéke angol, a mező utólag nem módosítható. A v1 profilok/canon változatlanok. Nyelvi promptok és nyelvi történethűség-ellenőrzés, további nyelvekre bővíthető regiszter/katalógus. [Részletek és ellenőrzés](LOCALIZATION_HU.md).

## Eltérés az új termékcéltól

A megőrzött v1 generálás tízéves horizontra készít 5–10 eseményt és 2–3 fejezetet. A 29 kérdéses profilból indul, és minden döntési választás új gyermekágat hoz létre. Az új v2 /life/:branchId felület külön hat hónapos folytatást kínál.

A v1 életállapot számszerű mutatókat tárol; a v2 tényszerű állapotot, szereplőt, célt és időben érvényes korlátot használ. Mindkét rendszer semleges/fiktív környezet, nem valós gazdasági előrejelzés. A folytatási metrikák technikai alapja kész, emberi retenció nincs bizonyítva.

Az alábbi adatmező-/tárolás-/elágazás-leírás a megőrzött v1 működésre vonatkozik. A v2 már integrált, saját verziózott API-val és tényállapot-szerződéssel; a korábbi profilok és canon megmaradnak.

## Elfogadott döntések

- **Felhasználói döntés:** az első használható verzióban valódi AI-generálás van. Az AI nélküli demo elvetve; csak automatizált tesztekben használunk helyettesítőt.
- **Felhasználói döntés:** OpenAI az első szolgáltató.
- **Felhasználói döntés:** Supabase-integráció és beállítási útmutató.
- **Felhasználói döntés:** `Muzsy/future_flow`, közvetlen munka a `main` ágon.
- **Felhasználói döntés:** kizárólag angol indulás, elrejtett magyar és további nyelvekre előkészített szerkezet. A jelenlegi szcenáriók földrajzi környezete Magyarország; a felület és az új történet angol is lehet. Életkor helyett 18+ korcsoport.
- Next.js web + NestJS API + külön worker ugyanazon moduláris kódbázissal. Nincs külön mikroservice-domain.

## V1 adatmezők

- Időpont: `effectiveAt`, `YYYY-MM-DD` formátumú szcenáriónap.
- Életállapot: `career`, `finance`, `social`, `internal`.
- Karriermezők: `employmentStatus`, `satisfaction`, `stability`, `growthOpportunity`.
- Uncertainty: `low | medium | high`; nem valószínűség.
- Constraint: `type`, `operator`, `strength`, `description`.
- Trait-ek: önbevallott 0–100 értékek. A kezdeti verzió nem állít pszichometriai vagy AI-confidence pontosságot.
- Minden profilpillanatképben saját másolatban szerepelnek a kapcsolatok és a célok; későbbi címkemódosítás nem változtatja meg a korábbi jövőt.
- A profilverzió tartalmazza a szerződés-, kérdőív- és scoring-verziót, valamint a bemenetet és hash-t.
- Az induló ismeretlen energia, kontrollérzet és karrierstabilitás semleges 50-es szerkesztési érték; nem becslés a személyről.

## V1 tárolás és elágazás

A profilpiszkozat válaszokat, kapcsolati adatokat és monoton revisiont tárol. Az elavult revisionnel érkező mentés 409-es hibát kap. Egy piszkozatverzió csak egyszer commitolható.

A profilverziók, világállapotok, események és életállapotok SQL-triggerrel védettek a módosítástól. A harmadik személyek címkéi a profilverzió részei. A semleges világállapot nem külső gazdasági adat.

Minden decision resolution külön rekordot kap. Ugyanaz a döntés több különböző opcióval új ágakat nyithat. A child branch a szülő fork eseményéig örökli a közös előzményeket; az új eseményeket saját ágon tárolja. Nem másolja és nem módosítja a közös előzményeket.

Az alapidővonal egy lehetséges baseline. A döntés utáni eredeti baseline nem felhasználói választás. A választott opció hatásai az új ág induló állapotában érvényesülnek.

## Tartós feladatok

Első megvalósítás: PostgreSQL jobs tábla és `FOR UPDATE SKIP LOCKED`, külön queue-infrastruktúra nélkül. A job és a future/branch azonos tranzakcióban keletkezik, ezért nincs elvesző enqueue. A PGMQ későbbi adapterként bevezethető; az API nem függ tőle. Ez eltérés a v0.1 PGMQ-javaslatától, a tranzakciós egyszerűség és a hordozható tesztelés érdekében.

Minden worker-claim egyedi lease tokent kap. A worker heartbeatet küld; lejárt lease után másik worker átveheti. Elveszett lease mellett a canon nem commitolható. Minden eredmény egyszeri tranzakcióban rögzül. Az esemény- és történetgenerálás külön checkpoint, így worker-újraindítás után a már elkészült szakasz nem hívja újra az AI-t.

Kérésoldali idempotencia kötelező future és decision resolve esetén. Azonos kulcs + eltérő bemenet 409. A kliens frissítés után a `/job/:id` címen folytatja a státusz követését.

## AI és minőség

OpenAI Responses API, JSON Schema / Structured Outputs, `store:false`, szerveroldali kulcs. Az alapmodell konfigurálható; a helyi kezdő beállítás `gpt-6.1-sol`. A három szerep külön konfigurálható, de a költségőr csak a dátumozott árlistájában szereplő modelleket/kontextust engedi.

Az eseménygenerátor (`AI_EVENT_MODEL`), narrátor (`AI_STORY_MODEL`) és ellenőrző (`AI_CHECK_MODEL`) külön konfigurálható. Ellenőrző beállításának hiányában az eseménymodell marad a v1-kompatibilis alapérték. A mintabeállítás minden szerepre Sol; a Luna-eseménygenerátor feltételes jelölt, még nem aktivált alapbeállítás. A [modellspecifikus költségvizsgálat](AI_MODEL_ROUTING_HU.md) a két feladat szétválasztását és a kísérlet határait is leírja.

Pipeline: AI-események → sémavizsgálat → szereplő/időrend/döntés ellenőrzése → determinisztikus state transition → AI-fejezetek → referenciasémák ellenőrzése → külön AI fidelity/safety ellenőrzés → tranzakciós commit.

A történetellenőrző AI sem garantál hibátlan szemantikát. Automatikus kánon/safety és AI angol szerkesztői ellenőrzés szükséges a bétához. Az előzetes kézi EN/HU minősítést a felhasználó az éles angol béta visszajelzésére cserélte; [indulási terv](ENGLISH_RELEASE_PLAN_HU.md). A raw prompt nem kerül logba; auditként model/prompt verzió, tokenhasználat, időtartam és hash tárolódik. Az alkalmazás minden hívására projekt/user foglalás és elszámolás működik; lásd a v2 riportot. A helyi `smoke:ai` próba külön, dátumozott árbeállítással és megőrzött fogyasztási naplóval korlátozza a kísérletek költségét; a helyi worker opcionálisan ugyanezt a közös kísérleti keretet is használja.

Reprodukálhatóság: a mentett canon és determinisztikus átmenetek visszajátszhatók. Azonos seed nem jelent azonos új LLM-választ. Újragenerálás új run; nem módosítja a régit.

## Adatkezelés és alfa

Az adatletöltés és törlés már az alfa alapfolyamatának része; nem prémiumjogosultság. A későbbi prémium export csak külön formázott narratív dokumentumot jelenthet. Az export/törlés és jogosultsági tesztek minden esetben release-feltételek; az eredeti 18/20-as élménygate nem enged biztonsági hibát.

Az alkalmazás a Supabase Auth szerveroldali `getUser` ellenőrzését használja. A JWT AMR-ben friss tényleges hitelesítés szükséges export és törlés előtt; tokenfrissítés önmagában nem elegendő.

Az anon/authenticated adatbázis-szerepkör nem kap közvetlen táblahozzáférést. A canonical táblákon RLS engedélyezett, böngészőoldali policy nélkül; minden adat a NestJS API-n át érhető el.

Fióktörlés: a belső fiók deleting állapotba kerül, folyamatban lévő jobjai elvesztik a lease-t, majd törlődik az Auth-fiók és a teljes belső adatgráf. Auth-hiba után csak admin ellenőrzéssel bizonyítottan meglévő Auth-fiók áll vissza aktívra; bizonytalan állapotban deleting marad. Auth-siker/DB-hiba esetén durable markerből admin recovery folytatja a kért törlést. Valódi kontrollált megszakításból recovery sikeres; tényleges DB-kiesés és backup/restore külön nyitott ops-kapu. [Runbook](ACCOUNT_DELETION_RUNBOOK_HU.md).

## Hivatalos implementációs források

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Supabase JWT-mezők](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [PostgreSQL SELECT / SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html)

## Claude értékelő, elkülönített integráció

Szerveroldali Claude REST/Structured Outputs/count_tokens, saját legfeljebb 5 USD napló és lock; CLI: pnpm evaluate:claude. Nem a termék workerének provider-routingja. 231 teszt a jelenlegi készletben; [Claude mérés és külső audit](CLAUDE_MODEL_EVALUATION_HU.md). A fizetett sorozat kizárólag verziózott szintetikus fixture-öket használt, a személyes Supabase-gráfot nem küldte Claude-nak.

## 2026-10-04: privát béta és Contabo-előkészítés

007 migráció: privát immutable feedback, szerveroldali aktivitási session és period/job-attribúció. Auth-védett `POST /api/v2/feedback`, maximum 5 új kérés/24h, idempotencia és ownership; teljes export/törlés. Angol általános és fejezethez kötött űrlap, tartalom nélküli CLI-összesítés. [Pontos működés és metrikák](BETA_FEEDBACK_AND_METRICS_HU.md), [valódi próbák](BETA_IMPLEMENTATION_REPORT_HU.md).

Narrátor v3: konkrét jelenet, elfogadott döntés megélt következménye, kevesebb ismételt állapot-/pénzfelsorolás; kánonkapuk változatlanok, produkciós modellek továbbra Sol. Docker/Compose/Caddy a későbbi Contabo-telepítéshez; az API csak 0 vagy 1 proxyhopot fogad konfigurációként. Windows alatt helyi Docker-runtime nincs; a [teljes Linux CI](https://github.com/Muzsy/future_flow/actions/runs/37236552164) izolált web/API/worker/Caddy futáspróbája sikeres. Contabo Compose/proxy preflight, kulcsos SSH/jelszavas tiltás és védett konfigurációmentés kész; éles alkalmazás még nem fut. [Előkészítés](CONTABO_PREPARATION_REPORT_HU.md).

## Shared S0 — implementált, kikapcsolt alap

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). Külön Shared 1.0.0 contract/core és 11 új JSON-séma; 008/009 tizenhárom RLS-tábla; SharedContextRepository és auth-védett social/context/invite/lifecycle API. A saját személyes élet/ág egytulajdonosú marad. Szerver-tier/cap, minimális profil, hash-only meghívó, globális user/context lock, revision/idempotencia és deletion-recovery/handover integrált.

A feature összes flagje false; nincs Connections, Shared AI, harmadik worker queue vagy saját period memória/impact bekötés. Ezek S1–S3 feladatok, első friend kiadás csak S2 valódi AI + S3 biztonság után. S0 pontos napegyezést kér, nem teljes compatible-month/latest-anchor implementáció. Más típusok formation/governance S4–S6. Billing és retained prose/privacy kapuk megmaradnak.

Fejlesztői DB-n 008/009 Session pooler kapcsolaton alkalmazva, megismételt runner/checksum és valódi háromfiókos HTTP/export/törlés sikeres; 001–007 és a régi 18 séma változatlan. 36 új regresszióval 195 teszt a készlet; az aktuális local/CI bizonyíték a riportban. A worker továbbra v1/v2 queue-t kezel, paid hívás és Contabo-változás nincs.

## Shared S1 — implementált friend canon és saját választás

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). Új SharedEventRepository és shared-engine contract/core a meglévő S0 alapján: belső event commit, strict own intent, opt-in subset/határidő, immutable resolution/pending memory; safe eseménylista/own impact API és saját history/export. Nincs HTTP-generátor vagy közvetlen személyes ágírás. Hat új JSON-séma, régi 29 és alkalmazott 001–009 változatlan. S2 provider/queue és S3 személyes materializálás/AI-memória/Connections későbbi; a négy flag false.

## Shared Context S2 — AI és tartós generálás

[S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md): OpenAI sharedEvent és külön friend Structured Outputs, SharedJobRepository/processSharedJob, strict continue/job-progress API és fair personal-v2/Shared/legacy worker implementált. 260 teszt, teljes check; két valódi izolált Sol-minta. Completed AI-input törlődik, deleting marker failed inputot is scrubol; meglévő SQL változatlan. S3 personal/Connections/privacy hiányzik, feature false.
