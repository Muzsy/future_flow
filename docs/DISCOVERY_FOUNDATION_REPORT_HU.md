# alterward — P10 read-only Discovery foundation

2026-10-06 · [Dokumentációs központ](README.md) · [Státusz](STATUS_HU.md) · [Teljes backlog](NEXT_STEPS.md).

## Megvalósított viselkedés

Bejelentkezés nélkül olvasható angol kereső és lista az aktív, explicit public kiadási másolatokból. Az Official és a Community kiadás saját olvasói engedélye és eredetkapuja megmarad. A találat a meglévő Official vagy Community angol életoldalt nyitja meg; újraolvasás, keresés, lapozás és kategóriacsere nem hív AI-t.

- `GET /api/public/discovery`; default `DISCOVERY_ENABLED=false`, kikapcsolva 404/`DISCOVERY_DISABLED`. A meglévő globális 120 kérés/perc IP-rate-limit érvényes. Nincs névtelen írás vagy trusted moderátori útvonal.
- Zárt `discovery-1` query/card/page kontraktus és 3 új generált séma. Angol locale; q legfeljebb 80 karakter, page 1–100, pageSize 1–24 (default 12). A HTTP és a web GET-form ugyanazt a strict string-parser/normalizálást használja. Ismeretlen mező, tömb, más nyelv, spoofolt classification és hibás oldalérték 422; az üres kategória az összeset jelenti.
- A korábbi 13 kategória változatlan. `all/official/community` szűrő; cím/summary szó szerinti, kis/nagybetűtől független ILIKE keresés, paraméterezett SQL-lel és escape-elt %, _ és backslash karakterrel. Teljes fejezetben még nem keresünk.
- Egyszerű, valós `newest` sorrend: publishedAt csökkenő, slug növekvő tie-break. A Featured/Trending/Most Forked/Turning Points és külön jóváhagyott címkék továbbra backlog; nincs kitalált nézettség vagy fork-rangsor.
- A minimális kártya csak slug, classification, English locale, cím/summary/kategória, fejezetszám, kiadási dátum és AI-generated/user-edited jelölés. Nincs chapter/canon/checkpoint/owner/life/branch/bundle/grant/evidence/publication ID, hash, receipt, token vagy privát háttéradat.

## Jogosultság és visszavonás

A SQL csak az aktív public és aktív tulajdonosjelölésű, angol jelölteket keresi; mindegyik találat a teljes aktuális Official/Community `readPublic` olvasón halad át. Ez ellenőrzi az immutable másolatot, a teljes review/curation kötést és Official esetén a pontos aktív eredetengedélyt is. Az egyes kiadási feature-ek külön érvényesek; kikapcsolt readerből nem jelenik meg kártya.

Private/unlisted nem jelölt, titkos link/tokencsere/withdraw sosem tesz unlisted életet Discoverybe. Hidden/removed és deleting owner kizárt. Lookup és teljes reader között történő 404-visszavonást kihagyjuk; más integritási vagy adatbázishibát nem nyelünk el. A korábbi terminal source-revocation és deleting trigger azonnal megszünteti a kapcsolódó reader/list engedélyét.

A listát nem cache-eljük: HTTP no-store, kliens fetch no-store/credentials omit/no-referrer. A felület új lekéréskor, tab elrejtésekor és focus/pageshow visszatéréskor törli a korábbi kártyákat; látható oldalon 30 másodpercenként újra ellenőriz. Már kézbesített adatot a visszavonás nem tud visszavenni; az új olvasás/listakérés mindig aktuális jogot ellenőriz. Report-szám jelenleg nem vesz részt rangsorban.

A bounded offset-lapozás nyers jelöltoldal alapján ad hasMore-t. Közben visszavont forrásnál rövidebb oldal/üres következő lap is lehetséges; párhuzamos új kiadásnál az offset-határ elmozdulhat. Ez első kis pilotra készült, nem snapshot-pagináció vagy terhelésbizonyíték. Full-text/trigram index és permission-aware cursor későbbi mért fejlesztés; új DB-migráció nincs.

## Angol felület

`/discover`: kereső, 13 kategória, Official/Community/All választó, valódi legújabb sorrend, kártyák és lapozás. A GET-form és a laplinkek az URL-ben tartják a keresést/szűrőket; új keresés első oldalra lép. Csak validált slug/classification állíthat elő life-linket. Loading, üres lista, invalid link, hálózati hiba és default-off üzenet angol; nincs HU választó. Normál linknavigáció, automatikus tartalom-prefetch nélkül.

A fő navigáció és a két meglévő olvasó Discovery-linket kapott. A felület reszponzív gridet és címkézett natív formot használ, abort és régi válasz elleni guard mellett. Discovery noindex/nofollow/no-referrer, nincs tartalomfüggő SEO/OG. Újraolvasás nem indít új történetet. A pozitív böngészős/visuális próba még nem bizonyított: a korábbi localhost eszközkorlátot nem kerültük meg. A production build és a valódi HTTP-próba más bizonyíték.

## Ellenőrzési bizonyíték

Helyi teljes `pnpm check` sikeres: formázás, típusok, **471 teszt/40 fájl**, API/worker/Next production build. A 7 új izolált PGlite/HTTP teszt default-off/strict input, minimális DTO, változatlan privát export (csak exportidő kihagyva), külön readerflag, literal SQL-keresés/taxonomy/lapozás, unlisted/withdraw/hide/remove/deletion, source-revoke és lookup–reader withdrawal verseny, anonim no-store HTTP és zárt parser/route-link határ. Ezek címkézett technikai fixture-ek, nem valódi Official seedek.

A teszthelperek első próbája hibásan a címben lévő chapter szót, majd az export változó exportedAt idejét vizsgálta. Az elvárást az adatmezőre és a tényleges private-state-re javítottuk; egyik hiba sem vezetett jogosultság vagy integritáskapu kikapcsolásához.

A valódi fiktív seed-fiókhoz friss Supabase password Auth-export, CA-val ellenőrzött fejlesztői PostgreSQL/TLS és külön loopback alkalmazás: anonim education/Official keresés megtalálja a valódi háromfejezetes mintát, helyes immutable title/periodCount, withdrawn unlisted kimarad, privát owner/ID/hash nem kerül kártyába, uppercase címkeresés működik, % nem wildcard, HU 422, exact Official reader visszaolvasás. Default-off Discovery 404. Előtte/utána friss Auth-export teljes adatállománya változatlan az exportidő kivételével; mindkét szolgáltatói napló hash-e változatlan. Nem írtunk történetet, engedélyt, moderációt vagy új jobot, nem hoztunk létre próbafiókot; a korábban megőrzött seed megmaradt.

A friss valódi seed runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37534973955), `a5daf8e21f1371cea16f84dc4ba7b35ab6d9a17d`: verify és container sikeres, 464/39, 105 séma drift nélkül, 001–025 és ismétlés/Official revocation/deletion race/export/cascade/RLS/TLS/HTTPS/worker-stop, minden korábbi P09/Shared proof és 0 paid CI AI. Az új P10 szelet izolált PostgreSQL/verified HTTPS próbáját a meglévő smoke-ba additívan beépítettük: Official+Community union, unlisted kizárás, literal wildcard/injection, category/classification, stabil kis lapok, minimális kártya, lookup közbeni withdraw, source-revoke/deleting kizárás és normál HTTPS default-off. **Az új P10 runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37537224387) verify/container sikeres**, exact `d5fa97ca460bb042e3b9b6d3c7034887913808bf`: 471/40, format/types/API/worker/Next build, 108 séma drift nélkül. Mind a 6 új Discovery PostgreSQL/verified HTTPS proof igaz, mind a 71 korábbi Shared/P09 és az Official publication proof változatlanul sikeres. 001–025 és ismétlés, CA TLS/HTTPS, default-off Discovery és tiszta worker-stop, egress tiltva, paid AI 0.

108 generált séma; a korábbi 105, 001–025, valódi minták, stratégiai/Shared források és archívum byte/hash szerint változatlanok. A fejlesztői DB ugyanaz a 001–025; nincs új tábla, RLS vagy migrációalkalmazás. Feature-flag minták a .env.example/server.env.example/Compose fájlban, false alapértékkel; a valódi .env-et és szervert nem módosítottuk.

## Költség és hátralévő scope

**Új providerhívás és tokenköltség 0.** OpenAI 149 hívás, becslés 2.617242505 USD, guard 2.745985875 USD, marad 2.254014125 USD; Claude 51 kísérlet/49 ismert usage, becslés 1.7965969 USD, guard 2.37123 USD, marad 2.62877 USD. Ismeretlen 0/2, a korábbi konzervatív foglalások megmaradnak. Külön 5–5 USD keret, nem valós szolgáltatói kreditegyenleg.

**Következő P10:** hitelesített idempotens Save; Share/OG explicit public és indexelési opt-in alapján; felhasználói Report, tartós moderation queue és review/warning/soft-hide/hard-remove audit, bejelentési dedup/abuse guard; olvasás/mentés/megosztás tartalom nélküli metrikái; kurált kollekciók; pozitív böngészős/UI próba. A trusted hide/remove már meglévő operatori művelet, nem felhasználói moderáció vagy teljes Report-rendszer. Discovery aktiválása/éles kiadás csak a P10/P11/P13 kapuk teljesítése után.

P11 Community owner/profile/public folyamatok és kiadási consent, P12 public checkpoint/private fork/personalization, P13 privacy/permission/SEO/minőség és valódi kohorsz továbbra szükséges. A 50–100 élet/20–30 Scenario cél mért kerethez kötött későbbi bővítés. P01–P13 és S0–S7 nem helyettesül: S3 raw/backup-retention/korábbi személyes próza/billing/grace/deadline, S4–S7, P06 valós kiesés/recovery/backup/restore/email és Contabo/Cloudflare tűzfal/karbantartás/DNS/proxy/TLS/külön éles AI-keret mind megmarad. Ez helyi fejlesztés és main/CI, nem alterward.com deploy.


## Dokumentációs ellenőrzés

133 Markdown/130 docs, 21 aktív +21 archív téma, 108 séma és 198 változatlan immutable forrás/példa/séma/migráció; 1500 helyi link, 0 hibás link/anchor. 80 stratégiai fejezet, 14 public MVP-elem, 15 Shared téma, 17 checksum és eredeti ZIP hash változatlan. Új providerhívás 0. A végső main frissítés csak dokumentáció, az exact runtime-bizonyíték a fenti d5fa97ca commitra vonatkozik.
