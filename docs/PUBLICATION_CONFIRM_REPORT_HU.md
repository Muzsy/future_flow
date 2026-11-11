# alterward — P09 Publication és külön Confirm

2026-10-06 · [Állapot](STATUS_HU.md) · [Sorrend](NEXT_STEPS.md) · [Nyilvános megvalósítási terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md).

Elkészült az ellenőrzött angol közösségi másolat kiadása: privát végleges előnézet, külön tulajdonosi megerősítés, immutable public/unlisted példány, anonim olvasó, saját visszavonás, titkos link cseréje és trusted moderátori elrejtés/eltávolítás. Az Official eredetengedély és valódi Official seed következő feladat; kliens nem adhat Official jelölést. A P01–P13/S0–S7 teljes scope és minden korábbi operatív/adatmegőrzési kapu megmarad.

## Pontos kiadási kapu

Csak aktuális, nem lejárt, saját angol public-content-1 csomag adható ki: explicit kiválasztott checkpointlista, ellenőrzött canon/copy/opció és teljes tartalomhash, találatmentes public-content-review-1 AI-jelentés/receipt, külön public-content-curation-1 `content_reviewed` döntés, aktív fiók és korábbi 18+/AI consent szükséges. A csak szövegre szóló eredmény, függő/elutasított kurátori döntés vagy megváltozott forrás nem helyettesíti ezeket. Shared-előzmény továbbra fail-closed; S7 többfél-consent külön kapu.

Az első kérés csak végleges privát előnézetet ment. A tulajdonos a történetet, minden kiválasztott állapotot/feltételt/hatást, láthatóságot és szerzői jelölést együtt látja. Csak a külön checkbox és Confirm hoz létre aktív Publicationt. Az előnézet legfeljebb 15 percig és az eredeti copy lejártáig érvényes. A szerver Confirmkor ismét ellenőriz minden forrás- és review-kötést. A böngésző külön hash-ellenőrzést is végez. Beállításváltozás törli a korábbi előnézetet és hozzájárulást.

## Önálló kiadott tartalom és hozzáférés

Új zárt `publication-1` snapshot adja ki a pontosan ellenőrzött prózát/tényeket. A korábbi preparation-only review/permission flag-ek helyett saját kiadási metaadatot használ; a régi 72 séma és migráció 001–021 változatlan. Kizárólag `community`, AI-generated és opcionális user-edited jelölés; a szerző anonim vagy külön kiválasztott saját public handle, sosem a privát display name. A handle megváltozása Confirm előtt új előnézetet igényel. Az anonymous választás a szerzői jelölést rejti; a próza azonosíthatóságát továbbra a review-kapu kezeli.

A publikált snapshot a privát ág folytatásától és a régi előnézet lejártától függetlenül változatlan marad. Public olvasó DTO-ban nincs tulajdonosi/belső UUID, review/canon hash, nyers prompt/memória vagy linkkulcs. A reader csak a kiadott másolatot és hozzáférési állapotot olvassa; nem a privát Life DTO-t adja tovább. A source life/fiók eltávolítása cascade-del törli a publikációt is.

Public: `/lives/life-…`; unlisted: `/unlisted#…`. A titkos link 256 bites HMAC-kulcsból és kiadási revisionből képzett 43 karakteres credentialt használ; a szerver tartósan csak hash-t tárol. Az owner visszakapja a megosztható kulcsot; anonim DTO, idempotency response, audit és log nem tárolja azt. A fragment nem kerül HTTP-kérés URL-jébe vagy referrerbe; a kliens fix `/api/public/unlisted` endpointon Authorization headerben igazolja a hozzáférést. A link birtokosa továbbküldheti azt; az unlisted nem csak meghívott olvasót jelent.

Linkcsere új revision/hash; a régi kulcs azonnal érvénytelen. Külön szerveroldali signing secret cseréje önmagában nem visszavonás: a régi bearer hash továbbra érvényes, a tulajdonosi link újragenerálásához explicit linkcsere kell. Visszavonás és moderáció lenullázza a tokenhash-t. Korábbi Confirm replay nem reaktiválja a withdrew/hidden/removed példányt. Fióktörlési marker visszavon minden élő kiadást; törlés recovery sem állítja vissza a korábbi grantet.

## API, tárolás és üzemeltetés

Tulajdonosi Auth API:

- `POST /api/v2/publication-previews`: strict review-binding + public/unlisted, anonymous/handle beállítás.
- `POST /api/v2/publications/confirm`: pontos previewId/previewHash + explicit acknowledged; idempotens kiadás.
- `GET /api/v2/public-content-bundles/:id/publication`: feature státusz és saját kiadás vagy null.
- `GET /api/v2/publications`: saját kiadások, régi preview/source revision változása után is kezelhetők.
- `POST /api/v2/publications/:id/withdraw` és `/rotate-link`: exact revision/snapshot hash, külön acknowledged és idempotency key.
- Anonim `GET /api/public/lives/:slug`, illetve secret bearerrel `GET /api/public/unlisted`.

A 022 additív migráció három RLS/client-revoke táblát ad: immutable final preview, immutable copy + szűk publication lifecycle és immutable minimális action audit. Owner → source → publication zárolási sorrend, atomikus Confirm/reuse, egyszeri bundle-kiadás, revisionös revoke/rotate/moderation és account-export/cascade integrált. Nincs publikus moderátori/approval endpoint. A protected operatori `pnpm moderation:publication -- --list`, illetve `--request-file <védett fájl> --apply` külön `PUBLICATION_OPERATOR_ENABLED=true` mellett elrejt/eltávolít egy pontos másolatot. A reason kód és actor-label minimális audit, szabad privát magyarázat nem kerül naplóba.

Alapból `PUBLICATIONS_ENABLED=false`. Aktiváláshoz független, védett szerveroldali `PUBLICATION_LINK_SECRET` kell: 32 random byte, 64 kisbetűs hex; sosem NEXT_PUBLIC, Auth- vagy AI-kulcsból. A deploy sablon ezt csak az API-nak adja, web/worker nem kapja meg. A normál helyi környezetet és az éles Contabót ez a teszt nem aktiválta.

Jelenleg minden reader no-store, no-referrer és noindex; nincs tartalom az SSR/OG metaadatban, unlisted nincs listában. A böngésző láthatóság/fókusz/visszanavigálás után újra ellenőriz, rejtett tabnál eldobja a tartalmat; nyitott aktív oldalon 30 másodpercenként frissít. Új kérés visszavonás után nem kap tartalmat. Már elolvasott, lemásolt vagy letöltött példányt nem lehet visszahívni. CDN-cache nincs e szeletben; keresőindex, SEO/OG, Discovery, listázás, Save/Share, report UI és nyilvános fork külön P10–P13 munka. `indexable=false`, `forkEnabled=false` szerveroldalon, kliens nem kapcsolhatja be.

## Ellenőrzési bizonyíték

Helyi teljes `pnpm check`: 428 teszt / 36 fájl, formázás, típusellenőrzés, API/worker/Next production build sikeres. 14 új regresszió ellenőrzi a gate-et, exact preview/fact kötést, consent/expiry/owner/source változást, replayt, public/unlisted határt, hash-only tokent, linkcserét, visszavonást/moderációt, immutabilityt, exportot, marker/recoveryt, source/account cascade-t és RLS-grant tiltást. Kilenc új séma, összesen 81; korábbi 72 változatlan.

Fejlesztői Supabase: 001–022 alkalmazva és ismételve, verified CA/TLS, 19 ff_ és 47 aw_ / 47 RLS, Auth elérhető. Valódi Auth/HTTP/böngésző/CLI technikai próba sikeres. Külön Confirm előtt tiltott gomb; beállításváltás törli az előnézetet/consentet; public és unlisted olvasó, noindex/referrer, új link és régi link tiltása, tulajdonosi visszavonás, trusted CLI opt-in/hide/idempotens reapply és moderátori elrejtés utáni olvasási tiltás ellenőrizve. A saját élet továbbhaladt, a kiadott snapshot/hash és tulajdonosi kezelőoldal megmaradt. Párhuzamos három valós HTTP Confirm replay egy rekordot használ újra. Export 2 final preview/2 publication/3 action; mindkét ideiglenes Auth/DB-fiók és credential fájl ténylegesen eltávolítva, 3200/4200 leállítva. A fixture saját scope-ra korlátozott; normál localhost:3000 változatlan. Végleges kisebb felületi szöveg/flag-javítás után format és Next production build ismét sikeres. Izolált PostgreSQL/HTTPS main CI is sikeres; pontos bizonyíték alább. A tesztforrás és a technikai review/curator fixture nem Official seed, nem valódi AI-történet és nem minőségi jóváhagyás.

Pontos runtime bizonyíték: `bad1b81680ccbf704767b049285ffae552199933`, [main CI](https://github.com/Muzsy/future_flow/actions/runs/37457083884) verify és container egyaránt sikeres. Teljes format/typecheck/428 teszt/production build/81 séma és schema drift-check; a konténerben credential nélküli izolált PostgreSQL/verified CA TLS, 001–022 alkalmazás és ismétlés, HTTPS web/API, tiszta worker-stop. Párhuzamos prepare/Confirm egyetlen kiadást hoz létre; unlisted hash/linkcsere, privát source továbbhaladás utáni változatlanság, moderáció/withdrawal verseny, fióktörlési recovery/export/cascade/RLS és minden korábbi P09/S0–S3 proof sikeres. Hálózati provider-egress tiltott; fizetett AI 0. A későbbi dokumentációs commit ezt a konkrét runtime eredményt rögzíti, nem új Contabo-deployt.

Új OpenAI/Claude hívás: 0. A kumulatív 5–5 USD keret változatlan: OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD, maradék 2,661985 USD. Ismeretlen korábbi usage foglalásai megmaradnak.

## Következő feladat

Külön trusted Official eredetengedély, a teljes ScenarioVersion kiadási review-ja és valódi AI-receipt eredetbizonyíték; csak utána kis angol Official seed a fennmaradó keret mért felhasználásával. A 50–100 élet/20–30 scenario forráscél nem csökken; a kezdeti minta nem helyettesíti azt. Ezután P10 Discovery/reader/SEO/Save/Share, P11 további community moderation/report, P12 public fork, P13 kiadási mérés/minőség. S3 retention/backup/régi személyes próza/billing/grace/deadline, S4–S7, éles AI-allowance, valós email, backup/restore/DB-kiesés és Contabo/Cloudflare telepítési kapuk továbbra nyitottak.
