# alterward — Shared Context S2: valódi AI és tartós generálás

2026-10-04 · [Aktív terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Státusz](STATUS_HU.md) · [S1](SHARED_CONTEXT_S1_REPORT_HU.md).

S2 implementált, a Shared funkció továbbra kikapcsolva. A valódi OpenAI friend esemény a generálási sorból, validálás és lease-ellenőrzés után egyetlen canonba kerül. Következő S3: személyes memória/materializálás és AI-folytatás, Connections és a teljes privacy/moderáció/törlési kapu. Az eredeti privát és public MVP terv megmarad; nincs Contabo-élesítés.

## AI és adatmegosztás

Külön strict `SharedAiInput`: kizárólag angol, közös typed állapot/cím/dátum/revision, 2–10 opaque member ID és explicit InteractionProfile allowlist, legfeljebb nyolc közös esemény safe története. Nincs email, user/life/branch ID, személyes pénzügy/cél/állapot, privát memória, más context vagy teljes intentlista. Nevek, címek és előzménypróza untrusted adat a promptban. A szabad próza teljes PII-redakciója és retention továbbra S3 kapu.

Az általános Shared candidate schema a későbbi weighted vote miatt dinamikus mapet is tartalmaz. Ezért a provider külön zárt friend `sharedAiCandidate` Structured Outputs sémát használ: `individual_opt_in`, két opció, üres option sharedChanges és csak memory-only proposal. Az eredeti sémákat nem írtuk át. Event/decision/yes/no ID, eligible és participant listák, határidő és revision szerveri értékek; a domain-validátor pontos egyezést kér. Cohesion/elfogadott érzés nem keletkezhet AI-ból.

`OpenAiProvider.sharedEvent` a meglévő Sol eseménymodellt és guardot használja, legfeljebb 4500 outputtoken, `store:false`. Egy közös invitation/opportunity készül, nincs tagonként külön azonnali fejezet. Legfeljebb egy célzott, előre foglalt repair, csak validációs kóddal; nincs automatikus másik modell. A legújabb prompt `shared_event.v2.en`: természetes angol, feltételes részvétel, alacsony tétű offline tevékenység; nem ígér chat/scheduling/collaboration termékfunkciót. A bekötés az [OpenAI Docs Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) és [Responses útmutatóját](https://developers.openai.com/api/docs/guides/migrate-to-responses) követi. A `store:false` nem jelent önmagában teljes szolgáltatói nulla retenciót.

## Job, lease, újraindulás és költség

`SharedJobRepository`: idempotens enqueue, egy aktív job/context, új context revision, rendezett user → context → job zárak. A userhez külön Shared napi és egyidejű cap tartozik (alap 3/24h, 1 aktív); sikertelen próbák is számítanak. Ez nem spending allowance és nem a meglévő privát napi limit átírása.

Claim/verify/complete újra ellenőrzi az összes érintett fiókot, consentet, aktív tagságot, entitlementet, blokkot, saját angol ág pontos dátumát és a state/profile/revision hash-t. Egy join vagy személyes előrehaladás stale hibával zár, nem késői user-lockkal. Claim `SKIP LOCKED`, maximum öt lease-attempt. Heartbeat/checkpoint és a végső UPDATE valódi `clock_timestamp()` alapján ellenőriz lease-t; elveszett/lejárt lease mellett nincs canon vagy impact commit.

Provider előtt tartós `REQUEST_STARTED` marker, utána output és bizonylat. Mentett valid outputból újrainduláskor nincs új AI-hívás. Ha a fizetett hívás elkezdődött, de nincs mentett eredmény, a job `SHARED_REQUEST_INTERRUPTED` hibával leáll: az ismeretlen szolgáltatói kimenetet nem ismétli meg csendben. Repair marker is tartós; ugyanaz a job restart után sem kap második javítást. Kvóta/auth/lease hibából nem lesz semantic repair.

Minden sikeresen visszatért structured output receiptje külön `aw_shared_ai_runs` rekord, validációs hiba esetén is. Költség a kezdeményező `requested_by_user_id` és a közös projekt terhére, a meglévő DB budget/foglalással; a többi tag nincs megterhelve. Helyi smoke és worker az eredeti közös 5 USD naplót/lockot használhatja; éles allowance továbbra nulla. Szolgáltatói hiba vagy nem menthető output költsége a budget reservationben megmarad, canon nélkül is. Kérés közbeni törlés/lease-vesztés nem vonja vissza a már elküldött szolgáltatói hívást, de a commitot megakadályozza.

Worker fair kör: personal-v2 → Shared → legacy, az üres queue-k átugrásával. Shared csak a context/friend flag együttállásakor claimelhető. SIGTERM után az aktuális jobot befejezi és nem vesz fel újat; a receipt/lease/cap a három queue között is megmarad. Helyi oldalon és a deployment mintákban mind a négy flag false.

## API és adat-életciklus

- `POST /api/v2/shared-contexts/:id/continue`: kizárólag `contextRevision` és Idempotency-Key; Auth/consent/membership/entitlement, nincs candidate vagy paid/tier/participant DTO.
- `GET /api/v2/shared-jobs/:id`: aktuális csoporttag számára safe status/stage/error/event ID; nincs payload, checkpoint, lease, más user vagy privát ág. `no-store`.
- `SHARED_DECISION_DEADLINE_SECONDS` üresen minden eligible válaszára vár; explicit 60–604800 másodperc konfigurálható. A 48 óra továbbra javaslat/tesztpélda, nem lezárt felhasználói döntés.

Canon/intent/resolution és a személyes állapot kezelése S1 szerint marad; a tényleges egyéni jelentkezés után pending memory keletkezik, materializálás S3. Completed jobból a teljes AI-input törlődik. Deleting marker a failed/cancelled inputot és output-checkpointot is megtisztítja, a korábbi left membershipet is figyelembe véve; receipt hash/tokenmeta megmarad. A meglévő 009 fizikai delete trigger konzervatívan megszakíthat egy régi tag contextjében futó jobot is; canon/új személyes adat nem éled újra. Ennek finomítása és a teljes valódi Auth/AI/törlési próba S3-ban ellenőrzendő.

## Ellenőrzés és valódi minták

29 új regresszióval **260 teszt, 23 tesztfájl**, teljes `pnpm check` sikeres; a végső prompt/domain pontosítás célzott AI-tesztjei is sikeresek. Két új kódból exportált séma, összesen 37; a korábbi 35 és mind a kilenc alkalmazott SQL byte szerint változatlan. Nincs új migráció. A kibővített CI valódi PostgreSQL-en párhuzamos enqueue/claimet, elvesztett/reclaimelt lease-t és egyszeri canon-commitot ellenőriz; a main CI eredménye még folyamatban.

Két kis valódi Sol-minta ugyanazon tesztfolyamatban: közös job → provider → domain → immutable canon → egy scripted saját opt-in és egy opt-out → egy, illetve nulla pending memória; személyes ág/state/revision nem változik. PGlite és szintetikus profilok; nem valódi Supabase Auth, személyes AI-folytatás vagy friend release bizonyítéka. A privát ág előkészítése kontrollált fixture, nem felhasználói AI nélküli mód. A [kezdeti minta](examples/AI_SHARED_FRIEND_ENGLISH_SAMPLE.md) változatlan; a chatre félreérthető utalás miatt a [finomított angol minta](examples/AI_SHARED_FRIEND_ENGLISH_REFINED_SAMPLE.md) külön valódi AI-output. Emberi használói minőség később mérendő.

Az egyes smoke-ok maximum 0,20 USD foglalásúak és meglévő mintafájlt nem írnak felül. Pontos token-/költségösszesítés a [státuszban](STATUS_HU.md); Claude- és Contabo-változás nincs. A személyes AI-alap Sol marad, ingyenes olvasás/intent nem indít új AI-hívást.
