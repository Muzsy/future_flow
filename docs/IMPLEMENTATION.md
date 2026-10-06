# alterward — jelenlegi implementáció, 2026-10-06


## Aktuális: hitelesített mentés és public link

Az angol Discovery után a P10 hitelesített, idempotens Save és egyszerű public linkmegosztás elkészült. /saved saját angol lista, 500/fiók korlát, teljes aktuális Official/Community readerkapu; unlisted/private kizárt, withdraw/hide/revoke/deletion után nincs történet a mentésben. 026 FK/RLS, minimális saját export/cascade, két valódi disposable Supabase Auth-fiók és a változatlan háromfejezetes genuine seed HTTP-próbája sikeres. Helyi teljes check 481/41 és production build; 112 séma, régi 108 és 001–025 változatlan; fejlesztői DB 001–026 alkalmazva/ismételve, 56 aw_/56 RLS. Új runtime main CI még ellenőrizendő. Rendes SAVED_LIVES/DISCOVERY/kiadási/Shared flag-ek false; új paid AI 0, OpenAI/Claude guard-maradék 2.254014125 / 2.62877 USD. Következő Report/moderációs queue/warning/abuse guard, OG/index opt-in/cache, kollekció/metrika és pozitív UI-próba; P10 nem teljes. P11–P13/S3-retention/S4–S7/ops/backup/email/Contabo kapuk megmaradnak. [Bizonyíték és határ](SAVED_LIVES_AND_SHARE_REPORT_HU.md).

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


## S3 személyes memória és időkezelés — 2026-10-05

S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes ellenőrzés](SHARED_CONTEXT_S3_REPORT_HU.md), [angol minta](examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md), [külső Claude-audit](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md).


[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37262177593) (`4a74daa`) verify és container sikeres: 279 teszt/24 fájl, formázás/típusok/API/worker/Next build és 39 séma-drift. Izolált valós PostgreSQL/TLS: késői Shared resolution, konkurens saját choice mellett egyszeri memória, choice/account-deletion verseny, own cleanup és más tag canon/memória megtartása. A korábbi S0/S1/S2 slot/tag/ötcontextes törlés/tíz intent/lease-reclaim bizonyíték is megmarad. 001–010 és ismételt migráció, web/API/Caddy HTTPS, API401, üres queue és worker-leállítás sikeres, paid AI és valódi credential nélkül. Nem Contabo-élesítés vagy teljes friend Auth-release.


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: angol AI-pre-screen elkészült

Az eddig hiányzó AI-elővizsgálat operatori szelete elkészült: a külön angol copy mezőnként ellenőrizhető, a 014 RLS-táblában hash/revision/policy/receipt kötésű privát eredmény tárolódik, saját olvasási API és export/törlés integrált. Egy valódi Sol-próba öt privacy-problémát talált az eredeti angol mintában. Ez nem teljes PII-garancia, nem curator/Official/Publication/Confirm és nem fizetős felhasználói job. A szerkeszthető privát Privacy/Content Preview elkészült; a fizetett scan-job és a további public kapuk hátravannak. [Megvalósítás és elfogadás](PUBLIC_AI_REVIEW_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: sanitized döntési checkpoint foundation

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és pontos korlátok](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: döntési előnézet és leírásszerkesztő

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális bizonyíték](PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: teljes előnézeti tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: teljes tartalom AI-job és költségőr

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.


## 2026-10-06: konkrét Official LIFE eredetengedély

[Előzetes trusted start és teljes AI/canon/választási receipt-engedély](OFFICIAL_LIFE_PROVENANCE_REPORT_HU.md) kész. Normál személyes AI-job/worker, exact full-content curator és accounted provider proof, külön jog/minőség/source grant, visszavonás/export/cascade/recovery; default OFFICIAL_LIFE_OPERATOR_ENABLED=false, nincs grant HTTP-route vagy public olvasási jog. Helyi check 453/38, 96 séma, Supabase 001–024 és ismétlés/52 RLS; a `da9c0118` runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37503358807) verify/container sikeres. Új paid AI 0, korábbi két 5 USD keret változatlan. Következő külön Official kiadási projekció/Confirm, valódi angol seed/Claude-auditor és P10–P13. P01–P13/S0–S7 és az operatív kapuk megmaradnak.


## 2026-10-06: külön Official kiadási másolat

[Exact Official preview/Confirm és immutable publikáció](OFFICIAL_PUBLICATION_REPORT_HU.md) kész; a source grant külön kapu marad. Default OFFICIAL_PUBLICATIONS_ENABLED=false; védett PUBLICATION_LINK_SECRET, külön HMAC-névtér. Public/unlisted olvasó, saját listázás/linkcsere/withdraw, trusted moderáció; source-revoke és fióktörlés tranzakciós hozzáférésmegszüntetése, export/cascade/recovery. 025 alkalmazva/ismételve, 55 RLS, 105 séma; a korábbi 96/001–024 változatlan. Új paid AI 0, valódi seed/Auth/böngészős pozitív próba még feladat. Runtime `9850a6ae` [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres; nem Contabo-deploy. A teljes P01–P13/S0–S7 és ops kapuk megmaradnak.


## 2026-10-06: P10 read-only Discovery első szelet

GET /api/public/discovery és /discover angol API/UI; zárt discovery-1 DTO, parametrikus literal search, fix kategóriák/newest és teljes aktív public readerkapu. Default DISCOVERY_ENABLED=false. SQL read-only a meglévő kiadási táblákon; 0 AI/új tábla/migráció. [Részletes bizonyíték és következő kapuk](DISCOVERY_FOUNDATION_REPORT_HU.md).


## 2026-10-07: mentési és megosztási szelet

SavedLivesRepository, zárt saved-lives-1 kontraktus, 026 RLS/FK/unique és private metadata export. Owner-first full reader után atomikus Save, globális két-user locksorrend és 500-as kvóta; saját no-store API és /saved, default-off. Két valódi fiókos Auth/export/delete/cascade és változatlan seed/AI-naplók ellenőrizve.
