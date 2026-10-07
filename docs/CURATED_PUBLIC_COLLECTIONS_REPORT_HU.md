# alterward — kurált nyilvános gyűjtemények

2026-10-07 · [Dokumentációs központ](README.md) · [Teljes backlog](NEXT_STEPS.md).

## Működő P10 szelet

Angol Featured lives, Community picks és Turning points válogatás készült, külön szerkesztett sorrenddel. A Discovery és a gyűjteményoldalak egymásra vezetnek; az Official lives a már meglévő eredetszűrős listára mutat. Community picks kizárólag Community kiadási másolatot fogad. Turning points legalább egy teljesen ellenőrzött, kiadott döntési checkpointot kér; ez nem ad public forkengedélyt. Featured mindkét eredetből választhat.

Minden gyűjtemény legfeljebb 24 kiadási pointert tartalmaz. Sorrendet a megbízható kurátor ad, nem olvasási szám vagy Report. Az oldal kártyái a teljes aktuális public readerből származnak, Official esetén a teljes eredetlánccal. Unlisted/private/withdrawn/hidden/removed/deleting, más nyelv és kikapcsolt reader nem kerül ki. Nincs tárolt cím/summary, private canon vagy titkos link a gyűjteményben.

`PUBLIC_COLLECTIONS_ENABLED=false` normál alapérték, a mintákban/Compose-ban rögzítve. A gyűjtemény olvasásához a Discovery és az adott public reader is bekapcsolandó. A valódi `.env` változatlan; a staging-probe külön konfigurációval futott. Trending/Most Forked nem kap hamis technikai tartalmat vagy nézetekből bizonyítatlan rangsort: valódi public fork/konverzió és abuse-kapu P12–P13 feladat. A teljes P10 nincs kész.

## Szerződés, API és angol felület

- `public-collections-1`: külön strict request/page/receipt; három kulcs, fix angol title, curated ranking és újrahasznált szűk Discovery-card. A publikus DTO nem tartalmaz publisher/private publication ID-t, hash/revision/curator actort vagy raw forrást.
- `GET /api/public/collections/:collectionId`: anonim 200/no-store. Unknown kulcs, query/identity/paging/ranking-injection strict 422; nincs böngészős curator/apply route. A három szerkesztett válogatás jelenleg egészben, legfeljebb 24 kártyával érkezik.
- `/collections/:collectionId`: angol választó, origin/kategória/period/AI-generated/user-edited jelölés, public életlinkek; címkézett navigáció és loading/empty/unavailable/error állapot. Fókusz/foreground/pageshow frissítés, 30 másodperces permission-poll, háttérben régi view elrejtése. Nincs új AI-kérés.
- Az Official szűrő és a hagyományos keresés továbbra newest; a gyűjtemény curated. Metadata és jelenlegi reader továbbra noindex/no-referrer. Külön OG/indexelési hozzájárulás még következik.

## Tárolás és megbízható szerkesztés

Az additív `029_curated_public_collections.sql` három RLS/REVOKE táblát hoz létre:

| Tábla | Tartalom és lifecycle |
|---|---|
| `aw_public_collections` | Három fix platformkulcs, revision, utolsó request hash és updatedAt. Kezdetben revision 1 és üres válogatás. |
| `aw_public_collection_entries` | Collection/position és pontosan egy Community vagy Official publication FK. Külön slot/target unique, target törlés kaszkád. Nem másolt story vagy tulajdonosi profil. |
| `aw_public_collection_actions` | Revisionönként egyszeri platform-curation audit: request hash, megbízható actor label és szerveridő. Tartalom és publisher/user ID nincs benne; UPDATE immutable. |

A teljes kiválasztás cseréje strict `{collectionId, revision, entries:[{slug, publicationRevision, snapshotHash}], actorLabel, acknowledged:true}`. Üres lista explicit törli a kiválasztást; ismételt slug tiltott. A szerver előbb globális sorrendben zárolja az összes publisher userét, majd a teljes public reader alatt az exact kiadási másolatot; végül a collection UPDATE-lock/revision kapuját. A source/snapshot/engedély nem módosítható curationnel.

Egyetlen tranzakcióban történik pointercsere, revision+1, hash és audit. Azonos exact request újraalkalmazása ugyanazt a receiptet adja, nem ír új sort. Versengő/elavult kérés 409, hibás vagy nem olvasható target miatt a teljes csere rollback. A read-only kártyalistán minden jelölt újból teljes engedélyellenőrzést kap; eltűnt targetet kihagyunk. A kurátori kiválasztás nem jogosít a tartalom olvasására az aktuális reader-kapu nélkül.

## Védett operatori parancs

`pnpm curation:collections` csak külön `PUBLIC_COLLECTION_OPERATOR_ENABLED=true` környezetben fut; mintákban false, API/worker Compose-környezetnek nem adjuk át. A megfelelő public reader-kapuk és 64 hex linksecret a megbízható helyi operatori folyamat előfeltételei, nem HTTP-paraméterek.

- `--list`: `.local/public-collections/collections.json`, három collection aktuális revisionje és kiválasztott slug/publicationRevision/snapshotHash. Új célt a tulajdonosi Publication-view-ból lehet exact kötni; a jelenlegi lista nem minden kiadható élet katalógusa.
- `--request-file <védett JSON> --apply`: strict, acknowledged teljes csere. A request a védett directory valódi, egyetlen hivatkozású fájlja legyen; linked/symlink/kilépő path tiltott.

User/SYSTEM ACL vagy 0700/0600; konzolra csak collection/revision/applied/0 paid AI vagy sanitized hiba kerül. Nincs privát történetszöveg, credential vagy böngészős curator-engedély. Platform-audit a kiadási pointer eltűnése után is megmarad request hash/actor/idő formában; nincs benne törölt story vagy publisher-azonosító. Backup/operátori-audit retention/restore a teljes release szabályzat része marad.

## Törlés és valódi staging-válogatás

Publisher deleting markerrel a kártya azonnal elérhetetlenné válik az új readerben; fizikai source/publication/account törlés a collection-pointert kaszkáddal eltávolítja. Üres maradhat a válogatás; másik életet nem helyettesítünk be hallgatólagosan. A saját account exportja nem kap idegen vagy platform-curation auditot. A tulajdonosi canon/forrás/kiadási másolat nem változik a válogatástól.

A korábban auditált, genuine háromfejezetes angol Official staging seed került a Featured és Turning points válogatásba. A két lista ugyanarra az egy életre mutat; nem két új AI-történet. A felhasználó korábbi döntése alapján az angol szerkesztői minősítés delegált; a meglévő full-scope AI/curator és Sol/Sonnet eredet/minőségi bizonyítékot nem kerülte meg a kiválasztás. Community picks üres, amíg valódi megosztott kínálat készül. Normál feature-ek továbbra false, ez nem éles közzététel.

## Ellenőrzött bizonyíték és határ

Helyi teljes `pnpm check`: **513 teszt/44 fájl**, format/types, API/worker/Next production build. **124 generált JSON-séma**; a korábbi 121, 001–028, valódi AI-minták és stratégiai/Shared források változatlanok. Fejlesztői Supabase 001–029 alkalmazva/ismételve; 19 ff_ és **65 aw_/65 RLS**, CA-val ellenőrzött valódi client TLS.

10 új izolált PGlite/HTTP regresszió: default-off/Discovery gate/strict, exact ordered selection/replay/unchanged canon/jobs/export, stale hash/revisions/atomic rollback, explicit replacement/clear/audit, unlisted/withdraw gate, withdrawal-between-lookup/read, Community/turning-point eligibility, Official full origin/revoke, platform audit immutability/RLS/publisher cascade, anonymous no-store és hiányzó browser curator route.

Valódi Supabase Auth/HTTP/PG/protected CLI: **28 sikeres ellenőrzés**, két disposable fiók és genuine seed. Operator opt-in, CLI-lista/expected revision/replay, valós anonymous Featured/Turning points, provenance nélkül card, strict query/ranking/identity tiltás és Auth sem jogosít curationre. Real PG competing ordered replacement egy revision-nyertes; végül genuine-only Featured. Community-origin/hide/cascade külön ideiglenes **technikai fixture-en**, nem új AI-sample. Mindkét fiók tényleges friss Auth HTTP DELETE és DB-cleanup kész; technikai kiválasztás eltűnt, explicit clearing audit maradt. A genuine seed saját exportja az exportidő kivételével és a két provider ledger hash-e változatlan. Új paid AI **0**.

A korábbi metrics runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37545794487), `ea517bc43d1c7ca86f02cc22b3e4be98308a0f09`, verify/container sikeres: 503/43/121, 001–028 és repeat, mind a 7 új metrics real-PG proof, minden korábbi Shared/P09/Official/Discovery/Save/safety bizonyíték, verified HTTPS/worker-stop, egress tiltva és paid CI AI 0. **Az új 029 collection runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37547186480), `8ca62310112f7b4a011845bba6a95d64f3e2027c`, verify/container sikeres.** 513/44/124, 001–029 és repeat, verified HTTPS/worker-stop, egress tiltva, paid CI AI 0. Mind a hat additív PG-proof sikeres: concurrent exact selection, competing revision, curated order/minimal card, Official/Community eligibility, live withdrawal/deletion race, publisher cascade/RLS/immutable audit.

Pozitív böngészős Collection/Discovery/Official/Save/Share/Report/reading-progress próba még nem igazolt; a korábbi eszközkorlátot nem kerültük meg. HTTP/CLI/build nem valódi render/scroll/clipboard bizonyíték. A teljes angol journey, explicit OG/index/permission/cache és P11 refresh/withdraw/privacy, P12 public fork/personalization, P13 genuine változatos tartalom/minőség/cohort/usage és release megmarad.

## Következő lépés és teljes terv

Következő P10: explicit indexelési/OG-engedély, permission/cache-visszavonás és pozitív UI. Trending/Most Forked/referral/public-fork-konverzió külön P12–P13 mérés/abuse-kapu; nincs technikai adattal kitöltött sikeres social feed. P01–P13/S0–S7 kombinált terv, S3 retention/régi személyes próza/billing/grace/deadline, S4–S7 és P06 backup/restore/email/valós kiesés, Contabo/Cloudflare/domain/TLS/tűzfal/éles allowance továbbra követelmény.

Kumulatív OpenAI/Claude külön 5–5 USD kísérleti keret változatlan: guard-maradék **2.254014125 / 2.62877 USD**, korábbi ismeretlen usage-foglalások megmaradtak. Normál flag-aktiválás, Contabo-telepítés és Cloudflare-módosítás nem történt. A P10 és a teljes nyilvános MVP még nincs kész.
