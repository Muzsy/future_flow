# alterward — S3 személyes integráció és időkezelés

2026-10-05 · **A személyes backend/AI/időkezelési szelet implementált és izoláltan ellenőrzött; a teljes S3 friend kiadási kapu még nyitott.** Az S0–S2 és az eredeti P01–P13/public terv folytatása. [Integrált terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Sorrend](NEXT_STEPS.md) · [S2 bizonyíték](SHARED_CONTEXT_S2_REPORT_HU.md).

## Személyes folytatás, idő és fork

A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. [Felhasználói döntés, ADR-027](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md#adr-027--személyes-folytatás-a-közös-válaszok-megérkezése-előtt).

A saját aktuális választás vagy folytatás előbb ellenőrzi a kliens revisionjét és a művelet érvényességét, majd user/branch-lock alatt materializálja a jogosult pending memory_only hatásokat. Egy batch egyszer emeli a revisiont; ugyanazon tranzakció az új revisionnel enqueue-ol. Hibás választás vagy stale kérés nem hagy félig alkalmazott memóriát. A rendezett Shared user-lockok miatt a saját ágon történő átvétel/törlés sorrendje ellenőrzött; nem zároljuk egyszerre minden tag személyes ágát.

A context monoton anchorja a korábbi közös és az aktuális személyes dátumok maximuma. Ha minden tag ugyanabba a későbbi hónapba jutott, új közös generálás előreléptetheti. Korábban létrejött eseményhez az előrehaladt ág később is válaszolhat, akár futó/hibás személyes job mellett; a lezárás megtartja az eredeti eseménydátumot. Saját dátumhoz képest jövőbeli emlék pending marad, amíg az ág eléri ezt a dátumot. Az opt-in érdeklődés, nem igazolt részvétel vagy másik tag döntése.

## Additív tárolás és AI-bemenet

010_shared_personal_memories.sql külön immutable owner-only aw_shared_personal_memories táblát ad RLS-sel és anon/authenticated tiltással. Ág/esemény egyszer szerepelhet; forrásazonosító, dátum és a megismerés utáni első history-position ellenőrzött. A forrássorrend determinisztikus. **001–010 a fejlesztői Supabase-on alkalmazva, ismétlés/checksum sikeres.** A következő tervezett moderációs migráció 011; a 009 nem írható át.

Két új kódból exportált séma: personalMemory és personalMemories. Life v2 2.0.0, a 37 korábbi séma és a kilenc korábbi SQL változatlan. A személyes AI legfeljebb nyolc saját jogosult emléket kap; minden alkalmazott emlék tárolásban/exportban megmarad. Másik tag privát állapotát/célját/történetét/intentjét nem kapja. Kilépés a még nem alkalmazott hatást leválasztja; már megismert történeti emlék marad. Fióktörlés saját snapshotsort töröl, más tag emléke és a közös canon marad.

## Valódi AI-próba és külső audit

Az első fizetett próbában a közös esemény sikerült, de a személyes period és egy javítása LIFE_INVALID_TIMELINE hibával elutasítva maradt. Három hívás elszámolva, hibás fejezet nem commitolódott. Két korábbi fixture-előkészítési hiba nem indított providerhívást. Eredeti próbajelzők és kumulatív naplók megmaradtak.

A prompt most külön rögzíti: minden új esemény szigorúan a period kezdete után legyen; effectiveAt/knownAt kizárólag előzményhivatkozás. Egy célzott worker-repair ugyanazzal a bemenettel a dátumtartományt nevezi meg. Promptok: life_period.v4, life_chapter.v4, life_fidelity.v3; Shared shared_event.v2.en változatlan.

A külön timeline eset **négy valódi Sol-hívása javítás nélkül sikeres**: közös esemény → saját period → angol fejezet → fidelity. 11960 input- és 2989 outputtoken. A közös dátum 2027-04-04, az ág 2027-10-04-én ismeri meg. Korábbi fejezethash és másik ág változatlan. A két korábbi személyes fejezet szintetikus fixture; ez elkülönített PGlite-próba, nem valódi Supabase Auth-folyamat.

[Room to Return — változatlan angol AI-kimenet](examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md). A korábbi meghívás a saját rajzolási célhoz kapcsolódó háttérként jelenik meg, teljesített részvétel kitalálása nélkül. A **Sonnet 5.5 low** külső ellenőr idézet/verdict-validálás után nyelvileg helyesnek és kánonhűnek minősítette, nulla jelzett hibával: személyesség 4/5, koherencia 5/5, nyelv 5/5, döntési tét 4/5, kíváncsiság 4/5. [Változatlan Claude-audit](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md). Egy szintetikus eset, nem használói megtartási bizonyíték.

| Új sorozat | Hívás | Becsült USD | Konzervatív USD |
|---|---:|---:|---:|
| Első elutasított Shared/personal próba | 3 | 0.0595172 | 0.0653825 |
| Pontosított Shared/personal/fidelity próba | 4 | 0.0597840 | 0.0597900 |
| Külön Claude-audit | 1 | 0.0164460 | 0.0199700 |

Új guard összesen **0.1451425 USD**. Az eredeti két külön 5 USD napló folytatódik: OpenAI 107 hívás, 2.074165875 USD guard / 2.925834125 USD maradvány; Claude 50 kísérlet/48 ismert usage, 2.338015 USD guard / 2.661985 USD maradvány. Két történeti ismeretlen Claude-hívás teljes foglalása megmarad. Naplóbecslések, nem szolgáltatói kreditegyenlegek.

Az őrzött fizetett parancsok: pnpm smoke:shared:personal timeline és pnpm audit:shared:claude. Meglévő próbajelző/minta új fizetett futást elutasít. Privát inputs/outputs/receipts kizárólag .local alatt, Gitből kizárva. Fejezet/audit a vizsgálat után nincs átírva; éles allowance nulla.

## Ellenőrzés és hátralévő kapuk

Helyi **pnpm check: 279 teszt/24 fájl**, formázás, típusok és API/worker/Next production build sikeres. 39 exportált séma. Regressziók: késői lezárás, változatlan in-flight/retry snapshot, egyszeri batch, stale/hibás kérés rollback, saját export/törlés/RLS/immutability, forkpont szerinti memória, nyolcas promptkorlát, compatible-month/monoton anchor és jövőbeli emlék halasztása.

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37262177593) (`4a74daa`) verify és container sikeres: 279 teszt/24 fájl, formázás/típusok/API/worker/Next build és 39 séma-drift. Izolált valós PostgreSQL/TLS: késői Shared resolution, konkurens saját choice mellett egyszeri memória, choice/account-deletion verseny, own cleanup és más tag canon/memória megtartása. A korábbi S0/S1/S2 slot/tag/ötcontextes törlés/tíz intent/lease-reclaim bizonyíték is megmarad. 001–010 és ismételt migráció, web/API/Caddy HTTPS, API401, üres queue és worker-leállítás sikeres, paid AI és valódi credential nélkül. Nem Contabo-élesítés vagy teljes friend Auth-release. Helyi Docker nincs. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később.

A korábban kilépett tag fizikai törlésének túl széles job-cancellationje külön additív migrációval javítandó. P06 üzemeltetési és P09–P13 public MVP-kapuk megmaradnak; S4–S7 későbbi típusok. Új Contabo-módosítás vagy éles deploy nem történt.
