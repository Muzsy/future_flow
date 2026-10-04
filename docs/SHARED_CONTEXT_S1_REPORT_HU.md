# alterward — Shared Context S1: esemény, saját válasz, lezárás

2026-10-04 · [Aktív terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Státusz](STATUS_HU.md) · [S0 alap](SHARED_CONTEXT_S0_REPORT_HU.md).

Az S1 friend motor implementált, kikapcsolt feature mögött. A szerver egyetlen immutable közös eseményt rögzít, külön kezeli a tagok tényleges válaszait, és egyszer képez pending személyes memóriahatásokat. A tesztesemény kizárólag izolált fixture: nincs HTTP-s tesztgenerátor, ügyfélnek szánt AI nélküli történet vagy bekapcsolt Shared felület. Következő S2 valódi Shared OpenAI, majd S3 személyes materializálás/AI-memória és Connections/biztonság. L01/P01–P13 és a teljes public MVP megmarad.

## Megvalósított folyamat

- `SharedEventRepository` a meglévő foundation aktív fiók/consent/entitlement és idempotencia védelmét használja. Rendezett user UUID-zárak → context → event; a személyes ágat nem módosítja. Ha az előzetes user-lista óta új tag csatlakozott, friss revisionnel ismétlendő 409 következik; nem veszünk fel késői user-lockot a context mögött.
- A belső candidate-commit ellenőrzi a contextet, revisiont, pontos napot, 2–10 aktív friend tagot, résztvevőrészhalmazt, opció-/tagazonosítókat, governance-t, zárt állapotváltozásokat, entitlementet, saját angol ágat és blokkot. Pending decision vagy aktív job mellett új esemény tiltott. Az event/candidate, state before/after és a szerveri döntésboríték hash-sel rögzül, immutable táblában, sorozatszámmal.
- A kliens csak saját `optionId`-t és aktuális `contextRevision`-t küldhet. Nem küldhet `userId`, `memberId`, intent-payload, hatás, erőltetett eredmény vagy pénzügyi utasítás mezőt. Egy tag/esemény egy végleges válasz; ugyanazzal az idempotenciakulccsal ugyanaz az eredmény, eltérő bemenet konfliktus. A válasz revisiont növel; a lezárás külön növeli.
- Friend governance kizárólag `individual_opt_in`. A szerver előre megadja, mely opcióazonosítók jelentenek részvételt; ezt nem a címkéből találjuk ki, és nem az AI dönt róla. Van legalább egy kimaradási lehetőség. Különböző egyéni opciók nem írhatják felül egymással a csoport állapotát: friend option `sharedChanges` üres. Más típus/governance S4–S6.
- A wall-clock boríték `openedAt/closesAt` különbözik a szimulációs naptól. Az AI-outputnak pontosan meg kell ismételnie a szerver határidejét. Minden tényleges válasz beérkezésekor korábban is lezárható; a határidőnél csak a valódi jelentkezők kapnak hatást, a hallgatók és explicit kimaradók nem. Határidő nélkül minden eligible válasz szükséges. A 48 óra tesztpélda/javasolt kiadási alap, nem a forrás 48h/5-vote példájából átvett globális quorum; a felhasználói alapérték tisztázása folyamatban. Mindkét mód implementált.
- A lejárat ellenőrzése submit/resolve kéréskor történik; háttérütemezett human deadline-kezelés még nincs. `resolve` hiányzó választ nem gyárt és idő előtt nem kényszerít eredményt. A pure majority/unanimous resolver előkészített és tesztelt: tényleges quorum, szigorú többség, tie/no-majority és hiányzó/eltérő unanimous válasz explicit unresolved. Ezek nem aktivált friend/csomagfunkciók; role/weighted végrehajtás elutasított, későbbi.

## Memória és hatáskör

S1 kizárólag `memory_only` pending rekordot készít, a résztvevő saját ágára. Decision esetén kizárólag ténylegesen részvételt választó tagnak; decision nélküli külső tény a meghatározott participant subsethez kerül. Egyszeri event/member/kind/hash védelem és egy eventhez egy immutable resolution akadályozza a duplázást.

A személyes memóriában a közös esemény és az érintett **rögzített saját válasza** szerepel. Az AI impact-proposal prózája nem válik elfogadott cselekvéssé/érzéssé: például az „everybody agreed” fixture-mondat nem kerül az impactba. Nincs más tag helyetti válasz, automatikus actor-másolás, kapcsolat/pénzügy/munkakör/költözés módosítás. A relationship projection és lazy, exactly-once személyes materializálás S3; a Life v2 állapota, revisionje, memóriaszerződése és AI-provider ebben a szeletben változatlan.

Időkezelés továbbra S0 konzervatív pontos napegyezése; a már előrehaladt ág nem kap visszadátumozott hatást. Az azonos hónap eltérő napjainak compatible-month/latest-anchor és későn érkező impact szabálya S3 előtt részletezendő. Egy személyes ágat sem írunk át csak a közös lezárás miatt.

## API és privacy

Mind a négy feature flag változatlanul false. Az új endpointok ugyanúgy AuthGuard, membership, saját ág, strict DTO/OpenAPI, angol hiba és `no-store` mögött vannak.

| Útvonal | Művelet |
|---|---|
| `GET /api/v2/shared-contexts/:id/events` | Legutóbbi 100 közös esemény safe projekciója, saját válasz és válaszszám |
| `POST /api/v2/shared-contexts/:id/events/:eventId/intents` | Saját végleges opció, aktuális revision és Idempotency-Key |
| `POST /api/v2/shared-contexts/:id/events/:eventId/resolve` | Tényleges válaszok és aktuális határidő újraértékelése, erőltetési mező nélkül |
| `GET /api/v2/branches/:id/shared-impacts` | Kizárólag saját ág pending hatásai |

Event DTO nem ad másik ág/user/life referenciát, raw candidate-et, impact-proposalt vagy mások intentjét. A saját válasz és összesített válaszszám látható; lezárt közös eredményben a tényleges részvételi subset látható. A teljes egyéni választáslista végig szerveroldali. Lejárt/Free entitlement mellett a history és saját export olvasható, új intent/generálás nem jogosult.

Résztvevő leave, context end vagy deleting marker atomikusan megszakítja a függő döntést, immutable cancelled lezárással és új hatás nélkül. A már lezárt canon és más tagok historyja marad; a saját detached rekord nem éled újra. Más, az adott eseményben nem résztvevő tag kilépése nem szakítja meg azt. A normál account-export `shared.canon` saját részvételi historyt, saját választást és saját impactokat tartalmaz, tagság megszűnése után is; új, későbbi eseményhez nem ad hozzáférést. Tényleges fióktörlés után a tag személyes referenciái/aliasa S0 szerint leválnak.

Ez strukturális jogosultsági és törlési alap: a közös prózába írt személyes nevek automatikus redakciója, retention/backup, moderation/report UI és teljes valódi Shared Auth/AI/canon törlési próba továbbra S3 kiadási kapu. Az S0 korábbi Supabase-próbája nem új S1/AI-elfogadás.

## Szerződések, migráció és ellenőrzés

Külön [shared-engine szerződés](../packages/contracts/src/shared-engine.ts): szerveri decision rules/envelope, strict intent request, tárolt saját intent, resolver result és own memory impact. Hat új kódból exportált séma; a korábbi 29 és mind a kilenc alkalmazott SQL byte szerint változatlan. Nem kell új S1 migráció, a 008/009 meglévő immutable/RLS tábláit használjuk. A Shared verzió 1.0.0, Life v2 2.0.0 marad.

36 új S1 regresszió: 19 domain, 12 persistence, 5 HTTP. A célzott S1 tesztek és meglévő S0 persistence/API sikeresek. A teljes `pnpm check` sikeres: 231 teszt 21 tesztfájlban, formázás, összes típus és API/worker/Next production build. A 35 exportált séma közül a régi 29 byte szerint változatlan. A `4e377159fe37e8d0ffdf4d0c477594731797de49` main commit [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37233779884) sikeres: verify és container, séma-drift nélkül.

A kibővített izolált Linux/PostgreSQL/TLS smoke tíz valóban párhuzamos intentet, azonos revisionből egyetlen nyertest/újrapróbát, egyetlen resolutiont és tíz pending hatást ellenőriz. További öt contextben függő döntéssel fut az átfedő account-deletion próba; személyes ág/state/revision előtte/utána egyezik. A sikeres új CI logjában `sharedEnginePostgres=passed`, `tenParallelIntents=true`, `decisionResolutionOnce=true`, `pendingDecisionDeletion=true` és `zeroPersonalBranchWrites=true` szerepel. Ez valós PostgreSQL-bizonyíték; a PGlite sorosított tranzakciója önmagában nem ilyen. Helyi web/API 200, anonymous Shared 401/no-store, mindhárom queue üres és a tényleges Supabase kliens TLS encrypted/authorized.

OpenAI- és Claude-hívás nulla, a két eredeti 5 USD napló megmarad. Contabo-változás, éles deployment és felhasználói Shared aktiválás nincs.
