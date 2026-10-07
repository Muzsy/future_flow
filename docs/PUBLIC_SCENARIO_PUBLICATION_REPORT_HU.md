# alterward — külön nyilvános Scenario-kiadás

2026-10-07 · P12 következő szelete · Normál kiadás alapból kikapcsolva

A teljes sablon AI-review-ja, külön kurátori döntése és aktuális Official SCENARIO source grantja mellé külön, saját fiókos kiadási előnézet és megerősítés készült. A nyilvános olvasó kizárólag ezt a kiadott angol, általánosított sablont adhatja. Ez Scenario-engedély; nem Official LIFE-provenance, és még nem személyes életet indító API vagy felület.

## Kiadás és külön engedély

A `public-scenario-1` saját előnézet az immutable forrásverzióhoz, a teljes sablonhashhez és a konkrét source granthoz kötött. Kötelező a sikeres teljes review, pontos AI-receipt és DB-s költségelszámolási bizonyíték, külön `scenario_reviewed` kurátori döntés, aktív grant és aktuális sablonverzió. A source grant önmagában nem publikál.

Az előnézet tartalmazza a teljes végleges sablont és az `allowPersonalization` döntést, privát és 30 percig megerősíthető. A Confirm külön `acknowledged=true` publikálási hozzájárulást kér. A külön `personalizationAcknowledged` pontosan a megtekintett személyre szabási engedélyhez kötött; nincs automatikus opt-in. A lejáratot minden source check és tulajdonosi lock után az adatbázis órája vizsgálja.

A megerősítés új, immutable public snapshotot és külön `scenario-…` slugot hoz létre. Egy forrásverziónak egyszerre egy aktív példánya lehet. Ismételt prepare/Confirm nem készít új példányt; a leállított példány régi megerősítése nem aktiválja újra. A flag kikapcsolásakor a pontos történeti Confirm-replay és a saját withdrawal továbbra működhet. Új kiadáshoz új előnézet és új explicit Confirm kell.

## Nyilvános olvasás és visszavonás

A nyilvános DTO csak a kiadott sablont, tartalomhash-t, slugot, kiadási időt, a személyre szabási engedélyt és az elkülönített Official SCENARIO jelölést tartalmazza. Nem kap user-, privát scenario-version-, source-grant- vagy preview-ID-t, profilt, AI-receiptet vagy Shared-memóriát. Az `officialLifeApproved` mindig false.

Minden olvasás ellenőrzi az aktív fiókot/consentet, publication állapotot, teljes immutable snapshotot, aktuális forrásverziót, review/curator/budget bizonyítékot és élő source grantot. Withdrawal, source revoke, új sablonverzió, elrejtés, eltávolítás vagy forrástörlés után az új olvasás 404. A fióktörlési helyreállítás a már visszavont source grantot nem éleszti újra.

A saját withdrawal és a külön trusted hide/remove terminális. Moderáció nem érhető el felhasználói HTTP-akcióként; privát immutable auditot készít. A védett `moderation:scenario` parancs külön operator opt-in és a `.local/public-scenario-moderation` könyvtáron belüli pontos kérésfájl mellett alkalmazható. Az operator flaget a normál API/web/worker konténer nem kapja meg.

Minden API-válasz a meglévő no-store/CDN no-store és noindex/nofollow határokat használja; a sablon nincs külső indexelésre vagy OG-ra engedélyezve. A személyre szabási engedély nem jelenti, hogy már létezik személyes start endpoint. Ilyen HTTP-végpont ebben a szeletben nincs.

## API és tárolás

| Saját hitelesített művelet | Útvonal |
| --- | --- |
| Teljes kiadási előnézet | `POST /api/v2/scenario-publications/versions/:versionId/preview` |
| Külön Confirm | `POST /api/v2/scenario-publications/confirm` |
| Saját kiadási állapot | `GET /api/v2/scenario-publications/:id` |
| Withdrawal | `POST /api/v2/scenario-publications/:id/withdraw` |
| Minimális anonymous olvasó | `GET /api/public/scenarios/:slug` |

Prepare/Confirm szigorú body és Idempotency-Key szerint működik, minden végpont elutasítja az ismeretlen query/body mezőket. A tulajdonosi preview/állapot másik fióknak vagy anonymous hívónak nem olvasható. A publikus olvasó nem indít jobot vagy providerhívást.

A 035 migráció három saját/private RLS táblát ad: immutable kiadási preview, immutable snapshot/engedély terminális státusszal, és immutable moderációs audit. A source grant/forrásverzió/tulajdonos összetett FK-kal kötött. Export csak saját rekordokat tartalmaz; fiók- vagy forrástörlés cascade-eli a teljes kiadási gráfot. Közvetlen anon/authenticated Supabase-jog nincs. A korábbi 001–034 migráció és 148 JSON-séma változatlan; hat új séma külön könyvtárban van.

## Ellenőrzés és határ

Tizenkét célzott PGlite/HTTP-próba ellenőrzi a default-off működést, teljes evidence-et, ownershipöt, külön hozzájárulást, exact replay-t, újraaktiválás tiltását, minimális public DTO-t, DB-óra szerinti lejáratot, source revision/revoke-ot, terminális moderációt, immutabilitást, exportot, RLS-t, cascade-ot és no-store/noindex HTTP-határokat. A fixture-receiptek technikaiak; nem valódi AI vagy szerkesztett éles Scenario.

Nyolc új izolált valós PostgreSQL-proof készült a prepare/Confirm versenyére, versengő engedélyű snapshotokra, az olvasás/withdraw/source revoke/törlés versenyére, a lock-várakozás közbeni lejáratra és az export/RLS/immutable moderációra. A pontos új CI-bizonyíték és a fejlesztői DB-migráció eredménye az alábbi lezárási bejegyzésben követhető; nem tekintjük lefutottnak a kód puszta megléte alapján.

A privát személyre szabási composition alap `89a7cf5` [pontos CI-je](https://github.com/Muzsy/future_flow/actions/runs/37663653592) már sikeres: verify/container, 588/53/148, 001–034/repeat és korábbi PG/HTTPS/TLS próbák, új paid AI 0. Az éles 30 nap 10 USD OpenAI + 5 USD Claude kerete külön jóváhagyott, nincs aktiválva. Contabo-telepítés és valódi külső publikálás nem történt.

## Következő feladat

A saját, tartós és lejáró **személyes** előnézet, élő public consent/source ellenőrzés, idempotens cross-owner privát élet/egy normál AI-job és leválasztható attribution még következik. Ezután az angol Scenario-olvasó, kiadási Confirm és „Try this with your own life” UI, tényleges Auth/AI minőségi próba, majd P13 aktivitás/referral/indulási kapu szükséges. A P11/Shared/retention/ops és eredeti 50–100 élet/20–30 Scenario scope megmarad.

[Privát személyre szabási alap](SCENARIO_PERSONALIZATION_FOUNDATION_REPORT_HU.md) · [Teljes terv](NEXT_STEPS.md) · [Költségkeret](AI_PRODUCTION_BUDGET_HU.md) · [Forrásreview](SCENARIO_RELEASE_REVIEW_REPORT_HU.md)


## 2026-10-07: helyi és fejlesztői DB-lezárás

Teljes helyi `pnpm check` sikeres: 600 teszt/54 fájl, format/types/script-types és éles build. Összesen 154 JSON-séma, a korábbi 148 és 001–034 változatlan. A fejlesztői Supabase DB-n 001–035 alkalmazva és megismételve; az új három tábla üres, RLS enabled, közvetlen anon/authenticated hozzáférés nincs, normál feature és operator false. Új valódi AI 0, nincs új valódi fiók vagy nyilvános Scenario, éles allowance/Contabo-deploy nincs. Az új commit valós PostgreSQL concurrency/TLS/container és verify CI eredménye még ellenőrizendő.
