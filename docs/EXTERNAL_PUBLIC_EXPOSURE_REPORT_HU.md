# alterward — külön külső indexelési és megosztási engedély

2026-10-07 · [Dokumentációs központ](README.md) · [Teljes backlog](NEXT_STEPS.md).

## Elkészült P10 szelet

Az angol közösségi kiadások tulajdonosa a kiadott másolathoz külön külső engedélyt adhat. Official LIFE esetén az engedélyezés trusted kurátori CLI-ből történik; a tulajdonos a saját Official másolatának engedélyét is visszavonhatja. A három mód: `none` (alapállapot), `preview` (történetből linkelőnézet, noindex), `index` (linkelőnézet és keresőindexelés). A publikus olvashatóság önmagában nem ad külső engedélyt; private/unlisted/withdrawn/hidden/removed másolat nem kap történet-metaadatot, képet vagy sitemap-bejegyzést.

Default `PUBLIC_EXTERNAL_EXPOSURE_ENABLED=false`, `PUBLIC_EXPOSURE_OPERATOR_ENABLED=false`. Az actual `.env` kapcsolói változatlanok; nincs külső indexelési aktiválás, Contabo-telepítés vagy Cloudflare-módosítás. A valódi angol seed csak ideiglenes helyi permission-próbát kapott, amelynek adatbázissora és auditja expected-value feltétellel eltávolítva; teljes saját exportja ismét egyezik a kiindulóval.

## Adatmodell és szerveroldali engedély

Additív `030_public_external_exposure.sql`: két RLS/REVOKE tábla. `aw_public_exposures` egyetlen Community vagy Official Publication-pointerhez, pontos publication revisionhöz és snapshot hash-hez kötött mode/permission revision/request hash. `aw_public_exposure_actions` immutable módosítási történet, saját export és publication/owner fizikai törléskor cascade. Nem tartalmaz történetmásolatot, promptot, olvasóazonosítót vagy új AI-jobot. Saját export csak saját slug/revision/hash/mode/idő adatokat ad; a trusted actor label/request hash nem kerül az exportba.

`public-exposure-1`: hat generált strict szerződés (tulajdonosi kérés, Official operator-kérés, own-view, publikus metaadat-projekció, sitemap-query és page). A korábbi 124 séma és 001–029 változatlan. A legacy `publication-1`/`official-publication-1` `indexable:false` mezője az eredeti immutable kiadás beállítása; az aktuális külső jog egyedüli forrása az új engedély/projekció. Nem módosítottunk régi szerződést vagy snapshotot.

Módosítás: publisher user UPDATE → pontos publication SHARE → permission UPDATE; export/read SHARE sorrend és a meglévő withdrawal/source/account-delete sorrend együtt megmarad. Exact copy és permission CAS, azonos request replay egyszer, versengő döntésből egy nyertes, stale binding 409. Új nem-null külső engedély csak nyitott flag, aktív saját felhasználó, nem korlátozott publisher és teljes live public EN reader mellett adható. Official reader a teljes aktuális scenario/life source-grant, evidence/hash és kiadási kötést is újra ellenőrzi. `none` visszavonás globális flag vagy reader kikapcsolásakor és withdrawn másolatnál is elérhető a friss saját publication bindinggel. A recovery nem aktiválja újra a visszavont kiadást vagy forrásengedélyt.

Minden metaadat-/kép-/sitemap-kérés ismét a teljes readeren megy át. Privát user/publication UUID, forrás-élet, grant/bundle/receipt/scan binding, snapshot hash, titkos unlisted token és szerzői privát adat nincs a publikus DTO-ban. A projekció csak a már ellenőrzött angol cím/összefoglaló/kategória/időszakszám/eredet/kiadási dátum és külső mód allowlistje. Korábban engedélyezett, már folyamatban lévő válasz befejeződhet; a visszavonás után induló új kérés nem kap tartalom-metaadatot.

## API, angol UI és trusted CLI

| Felület | Engedély és viselkedés |
|---|---|
| GET /api/v2/public-exposure/:slug | Auth + saját Publication, aktuális és hatályos külső mód; globális kapcsoló mellett is visszavonható |
| POST /api/v2/public-exposure/:slug | Exact publication revision/hash + permission revision + explicit acknowledged; Community owner opt-in, Official own revoke |
| GET /api/public/external/:slug | Anon, teljes reader + exact külső grant, strict no-query, minimális DTO, no-store; unavailable 404 |
| GET /api/public/external/sitemap | Strict cursor/limit, maximum 100 candidate/page, lexikografikus slug keyset, csak teljes aktuális index-grant |
| pnpm curation:exposure --list | Külön operator opt-in, védett Official publication/permission revision/hash lista, nincs történet vagy credential a konzolon |
| pnpm curation:exposure --request-file … --apply | Védett valódi single-link request-fájl, exact Official slug/copy/permission CAS + actor + acknowledged; nincs curator HTTP API |

Az angol own-publication panelen külső mód, tényleges hatály, külön checkbox és mentés található. Official beállításnál a tulajdonos számára csak a visszavonás használható. Unlisted másolat külső panelt sem kap. Reload és megváltozott publication binding új permission-readet kér. Hibás/idegen/stale válasz nem menthető. A nem aktív másolatra nem adható új engedély.

## HTML, Open Graph, kép, sitemap és cache

A Next szerver `PUBLIC_SITE_URL` root originből és `API_INTERNAL_URL` server-owned `/api/public` base-ből dolgozik. HTTPS kell külső originhez; HTTP csak localhost/loopback oldalhoz. Credential/query/fragment/path eredet tiltott, Request Host nem hatósági forrás. Metadata fetch cache no-store, credentials omit, redirect error, referrer no-referrer, ötmásodperces timeout; cookies/token/privát Auth nem kerül az API-kérésbe. A Compose csak a nem titkos origin/API-base/feature flaget adja a webnek; DB/admin/link-secret nem kerül a web envbe.

`/lives/:slug` és `/official-lives/:slug` dinamikus `generateMetadata`: jogosult preview esetén ellenőrzött title/description/canonical/OG/article/EN-locale/Twitter image; index csak explicit `index` módban. Hiba, lezárt feature, rossz slug vagy revocation esetén általános alterward cím/leírás, noindex/nofollow, történet-OG/canonical nélkül. Az összes többi oldal layout-alapból noindex. A metaadat-streaming kikapcsolva: a jogosultsági eredmény minden user-agentnél a HTML headben megjelenik; ez engedélyezett metaadatnál növelheti az első válasz idejét.

`/share-preview/:slug`: külön Route Handler, minden GET teljes permission-check után 1200×630 code-native PNG. Már ellenőrzött cím, Official/Community és AI-generated simulated life jelölés. Nincs automatikus `opengraph-image` fájl, távoli cover/font/emoji vagy AI-képgenerálás. Az angol kép ASCII tipográfiát használ, Unicode idézőjelet normalizál, a többi nem-ASCII jel helyén space; az eredeti történetcímet és HTML-metaadatot nem írja át. A valódi seed képe helyben vizuálisan átnézve, olvasható és nem levágott. Query-paraméteres képkérés 404. Tiltott kép 404, nem korábbi cache-tartalom.

`/sitemap.xml`: dinamikus XML, csak live explicit index-grant public URL + published date. Legfeljebb tíz 100-as API-page, így a 50–100 életű induló célhoz elegendő 1000-candidate pilotkapacitás; hibás cursor/rendezés, outage vagy túllépés 503 + Retry-After, nem csendes csonkolás. Feature-off állapot üres sitemap. Query-s sitemap-kérés 404. Később nagyobb kínálatnál sharding szükséges.

Saját HTML/API/PNG/XML cache no-store, CDN-Cache-Control/Cloudflare-CDN-Cache-Control no-store és no-referrer. Nem létesült tartalom-CDN-cache: visszavonás után új kérés a permission rétegen dönt, nincs saját tárolt OG-kép. A Contabo/proxy és tényleges Cloudflare cache-rule/BYPASS/DYNAMIC/withdraw próba az élesítési kapu része. A keresőszabály nem hozzáférésvédelem; robots.txt nem zárja el a noindexet olvasó crawlerszolgáltatásokat. Külső kereső vagy sharing provider már mentett előnézetét nem lehet garantáltan törölni; ezt az explicit angol hozzájárulás jelzi. [Google noindex követelmény](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [Open Graph mezők](https://ogp.me/).

## Bizonyíték és fennmaradó kapuk

Teljes `pnpm check` sikeres: **525 teszt/45 fájl**, format/types/scripts-types és API/worker/Next production build. **130 generált JSON-séma**. Supabase 001–030 alkalmazva/ismételve; 19 ff_ és **67 aw_/67 RLS**, saját CA-val ellenőrzött tényleges client TLS. Tizenkét új technikai regresszió: default-off/strict/unlisted/idegen owner; exact grant/replay/unchanged canon; CAS/rollback; restricted publisher/revoke flag-off; withdrawal; Official curator + source permission; live sitemap race/keyset; RLS/immutable/cascade/recovery; Auth/public HTTP/no curator; trusted origin; fresh metadata/fallback; pagination/outage/capacity.

Valódi Supabase Auth + production web HTTP + PG + protected CLI: **33 sikeres ellenőrzés**, genuine angol seed és két disposable fiók. Tényleges HTML OG/noindex/index/canonical, 1200×630 PNG-byte és képméret, cache/referrer headerek, strict metadata/sitemap, külön Official opt-in/owner revoke, konkurens Community grant/CAS, withdrawn/flag-off revoke és valós Auth HTTP DELETE/DB-cleanup. Temporary genuine permission expected-value törlése után teljes saját export/canon/accounting egyezik, mindkét provider ledger változatlan. Technikai fixture nem került valódi AI-generated seedként a kínálatba. Új paid AI **0**; guard-maradék OpenAI **2.254014125**, Claude **2.62877 USD**, unknown reservations megmaradtak.

A gyűjtemények pontos `8ca62310112f7b4a011845bba6a95d64f3e2027c` [main CI-je](https://github.com/Muzsy/future_flow/actions/runs/37547186480) verify/container sikeres, 513/44/124, 001–029/repeat, hat új PG-proof és minden korábbi Shared/P09/Official/Discovery/Save/safety/metrics bizonyíték. Az új **030 runtime main CI még ellenőrizendő**: hat additív PG-proof a concurrent grant/revision, authority, bounded minimal sitemap, live revocation/recovery és active physical deletion/cascade/RLS/immutable audit ellenőrzésére; HTTPS default-off web/PNG/sitemap/cache proof is bővítve.

Pozitív böngészős UI/scroll/clipboard/consent próba még nem igazolt; a korábbi browser-eszközkorlát megmarad, HTTP és PNG-inspection nem helyettesíti az interaktív UI-t. P10 Trending/Most Forked/fork/referral/cohort külön P12–P13 kapu. Következő P11 új snapshotverziós refresh és teljes owner/privacy workflow, majd P12 public cross-owner fork/scenario personalization és P13 genuine kínálat/minőség/usage/release. Teljes P01–P13/S0–S7, S3 retention/régi személyes próza/billing/grace/deadline, S4–S7, P06 backup/restore/email/valós outage és Contabo/Cloudflare/éles AI allowance megmarad. A felhasználó folyamatos haladást kér az élesítésig; a sikeres lépések után önállóan következik a következő, valóban szükséges adat/döntés esetén korai tisztázással.


## 2026-10-07: konténeres ellenőrzés javítása

A `ebfbfc71be7feaf1ed28256a9e01521dfe7821e5` runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37569799947) container jobja a teszt audit-sorrendjén bukott: a `SELECT … aw_public_exposure_actions` már a saját source/account cascade törlése után futott, ezért nem volt audit-row az immutable UPDATE-negatív kontrollhoz. A grant/CAS/read/sitemap/deletion bizonyítékok addig lefutottak; az audit eltűnése az elvárt cascade következménye. Az immutable ellenőrzést közvetlenül az első grant utánra mozgattuk; a későbbi nulla-soros cascade-ellenőrzés megmaradt. Az alkalmazás runtime, 030 és a 130 szerződés nem változott. Javított exact main CI még ellenőrizendő; a kaput nem tekintjük sikeresnek a bukott futás alapján. Helyi types/format, 525 teszt és valódi 33 Auth/production HTTP proof külön sikeres.
