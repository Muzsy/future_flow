# alterward — nyilvános aktivitás összesített mérése

2026-10-07 · [Dokumentációs központ](README.md) · [Teljes backlog](NEXT_STEPS.md).

## Elkészült P10 szelet

Az angol Official és Community public olvasó rövid olvasásonként mérhető; a valóban sikeres mentés, mentéseltávolítás, bejelentés, publikálás, tulajdonosi visszavonás és moderátori hide/remove külön szerveroldali összesítést kap. Olvasás és mérés nem indít AI-t, nem változtat privát canont, forrásengedélyt, snapshotot vagy rangsort. A normál `PUBLIC_METRICS_ENABLED=false`; az új kapcsoló mintákban/Compose-ban szerepel, a valódi `.env` változatlan. Migráció alkalmazása és worker-takarítás szükséges az aktiválás előtt.

Az `028_public_activity_metrics.sql` két privát RLS/REVOKE táblát ad:

| Tábla | Tárolás és lifecycle |
|---|---|
| `aw_public_metrics_daily` | Egy Community vagy Official publication FK, UTC-nap, eseményfajta és egész darabszám. Nincs olvasó/user/IP/referrer, prompt, szöveg vagy report-details. Publication/owner törlés kaszkád. |
| `aw_public_reading_sessions` | Kliens által véletlenül generált UUID, egy publication FK, szerveridő, 20 perces lejárat és monoton signal-bitmask. Nincs tartós olvasói profil vagy böngészőazonosító. A kötés/idő nem írható át. Publication/owner törlés kaszkád. |

Események: `reading_started`, `depth_25`, `depth_50`, `depth_75`, `end_reached`, `share_clicked`, `link_copied`, `copy_failed`, `saved`, `unsaved`, `reported`, `published`, `owner_withdrawn`, `hidden`, `removed`. A darabszám műveletet/megfigyelést jelent; nem egyedi embert, igazolt megértést vagy sikeres referral-konverziót.

## Anonim olvasás és megosztás

- `POST /api/public/reading/:slug`, strict `{readingId}` → `public-metrics-1` session, 201/no-store. Auth/cookie nem szükséges. Csak a teljes live public reader által engedett angol másolat; Official esetén a teljes eredetlánc is újraellenőrzött.
- `POST /api/public/reading/:slug/signals`, strict `{readingId, signal}` → receipt/duplicate, 201/no-store. Csak az olvasási és megosztási hét signal küldhető; kliens nem jelenthet sikeres Save/Report/Publish műveletet.
- Ugyanaz az érvényes reading UUID és signal egyszer számít. Másik slughoz kötés, lejárt ID, unlisted, withdrawn/hidden/removed/deleting vagy kikapcsolt reader 404. Az újraolvasó permission-poll és visszatérő fókusz ugyanazt a még érvényes azonosítót használja; teljes oldal-újratöltés új olvasás lehet.
- Az ID csak a React ref-ben él: nincs analytics cookie, local/session storage, URL-paraméter vagy tartós böngészőazonosító. A fetch credentials omit/no-referrer/no-store. DNT=1/GPC esetén a böngésző nem mér; a szerver mindkét privacy-headert önállóan is tiszteletben tartja. Ezek az anonim mérést zárják, nem a sikeres hitelesített művelet identitás nélküli összesítését.
- A depth a látható viewport által elért történetrészt jelzi. `end_reached` a történet végének megjelenése legalább 30 másodperc látható foreground jelenlét után; a szerver legalább 30 másodpercet is megkövetel az ID létrejötte óta. Ez olvasásvégi kitettség, nem igazolt elolvasás. A jel önbevallású, módosított kliens nem szűrhető embernek.
- A megosztásnál click, sikeres Clipboard API és sikertelen copy külön jel. A kézzel kijelölhető fallback nem jelent automatikusan sikeres másolást. A megosztás előtt továbbra teljes reader-ellenőrzés történik.
- Egy public másolat naponta legfeljebb 10 000 új mérési sessiont fogad. Az admission közös napi counterben atomikus; kvótatúllépés 429 és a session insert rollback. Érvényes ugyanazon session retry a limit után is szabad. A napi sapka és a meglevő API rate-limit pilot-védelem; nem bot-, Sybil- vagy egyedi látogató-szűrés. Nincs automatikus Trending-rangsor ebből a számból.

Az angol olvasó rövid adatkezelési tájékoztatót mutat a mérésről. A kliens mérési hibája nem cseréli le az olvasható történetet. A mérési session lejárta után a régi signal nem számít; új oldal/fókusz-engedélyezési ciklus szükséges az új sessionhez. Éjfél utáni signal az esemény UTC-napjára kerül, ezért a napi start/depth számok nem feltétlenül ugyanazon kohorsz.

## Sikeres szerverműveletek

A normál repository-tranzakció akkor számol, amikor ténylegesen létrejött a Save/Report vagy a kiadási állapotváltozás. Az idempotens Confirm/action/moderation és duplikált Report/Save nem ad új darabot. Egy későbbi valódi eltávolítás és új Save két külön változás. Owner-withdrawal külön a source-revocation/deletion miatti automatikus visszavonástól; utóbbit nem nevezzük tulajdonosi Unpublishnak. Unlisted copy nem kap public statisztikát.

Az aggregate ugyanabban a tranzakcióban commitol, mint a művelet: bekapcsolt mérés mellett DB-hibája a műveletet is visszagörgetheti. Ez nem utólagos best-effort számlálás. A feature alapból off és a 028 előfeltétel; nincs extra provider-foglalás. Unsave a publisher/actor globális lock-sorrendjét és a publication lockját is megtartja, akkor is, ha a publisher deleting: az eltávolítás nem igényel olvasási jogot, és a metric FK nem okozhat publisher-delete deadlockot.

## Takarítás, riport, saját export

Az `end_reached` szerveridő-ellenőrzése és a TTL az adatbázis óráját használja. Lejárt ID nem adható újra olvasásnak. Worker minden induláskor, majd körülbelül 15 percenként törli a lejárat után 24 óránál régebbi sessionöket, a mérési flag-től függetlenül. Indexelt, 10 000 soros `SKIP LOCKED` batch; tele batch után következő ciklusban újabb takarítás, hiba után egyperces retry. Start is takarít legfeljebb 100 régi sort. Leállt/hibás vagy hosszú jobot futtató worker mellett a takarítás késhet; üzemeltetési ellenőrzés és backup-retention továbbra release-kapu.

`pnpm metrics:public` a legutóbbi 90 UTC-nap platformszintű napi/event összesítését védett `.local/public-metrics/summary.json` fájlba írja; konzol csak metadatát mutat. Nincs nyers session-ID, public slug, belső publication ID vagy történet a riportban. `--cleanup-expired` egy külön takarítási batch; ismételhető. A 90 nap a riport időablaka, nem automatikus aggregate-retention: a napi sorok publication/owner törlésig megmaradnak.

A publisher saját account-exportja csak saját publication slug/day/kind/total adatait tartalmazza. Olvasó/saver/reporter nem exportálhat idegen publisher metrikát. Nyers session-ID nincs account-exportban vagy anonim statisztikai endpointon. A publisher/publication fizikai törlése mindkét új tábla kapcsolódó sorait eltávolítja.

## Ellenőrzött bizonyíték és határ

Helyi teljes `pnpm check` sikeres: **503 teszt/43 fájl**, format/types, API/worker/Next production build. Az olvasói tájékoztató végleges formázása is ellenőrzött. **121 JSON-séma**, a korábbi 117, 001–027 és a valódi AI-minták változatlanok. Fejlesztői Supabase 001–028 alkalmazva/ismételve, 19 ff_ és **62 aw_/62 RLS**, CA-val ellenőrzött valódi client TLS.

12 új izolált PGlite/HTTP teszt: default-off/strict/no identity, read/signal dedup és exact slug binding, daily admission rollback, elapsed end és copy-jelek, expiry/unlisted/withdraw/readerflag, valódi server-action once, hide/remove replay, full Official revoke, flagfüggetlen cleanup/old-migration compatibility, own export/cascade, immutable/RLS, anonim no-store/DNT/GPC és hiányzó public stat endpoint. A kezdeti teszt négy hibája a meglévő strict moderációs/revoke/action szerződés téves meghívása volt; a tesztet a már kötelező acknowledged/reason/hash/revision mezőkhöz javítottuk, a kapukat nem lazítottuk.

Valódi Supabase Auth/HTTP/PG: **31 sikeres ellenőrzés**, két disposable fiók és a genuine háromfejezetes Official minta. Párhuzamos starts/signals egyszer, early-end tiltás, DNT/GPC, exact UUID/slug, real Auth Save/Unsave/Report egyszeri count, saját/idegen exporthatár és protected CLI sikeres. Kvóta, aged-ID, hide/replay és fizikai cascade külön ideiglenes **technikai Community fixture-en**, nem új AI-mintán. Mindkét fiók tényleges friss Auth DELETE és DB-cleanup sikeres. A genuine seed kizárólag a próba által hozzáadott counterjeit expected-value összevetéssel visszaállítottuk, saját teszt-session ID-i eltűntek; teljes saját export az exportidő kivételével és mindkét AI-napló hash-e változatlan. Két korábbi Auth-próba a legelső fióklétrehozásnál sikertelen volt; akkor nem keletkezett tesztfiók vagy mérés. Read-only admin-diagnosztika és a harmadik próba sikeres; az első hibák pontos külső oka nem igazolt.

A korábbi Report runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37542777634), `726f7f4a229bb30bc4fadbbbdb8b18f0761f4568`, verify/container sikeres: 491/42/117, 001–027 és ismétlés, 6 új valódi PG safety proof, minden korábbi Shared/P09/Official/Discovery/Save bizonyíték, verified HTTPS/worker-stop, egress tiltva, paid AI 0. **Az új 028 runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37545794487), `ea517bc43d1c7ca86f02cc22b3e4be98308a0f09`, verify/container sikeres**: 503/43/121, 001–028 és ismétlés, mind a 7 új real-PG proof: concurrent reading/signal, quota rollback race, server elapsed, actual actions once, Unsave/publisher-delete race, cleanup/private export, live permission/cascade/RLS. A korábbi teljes Shared/P09/Official/Discovery/Save/safety bizonyíték megmaradt; verified HTTPS/worker-stop, egress tiltva, paid AI 0. Pozitív böngészős Discovery/Official/Save/Share/Report/reading-progress próba továbbra nincs; a korábbi eszközkorlátozás megkerülése nem történt. HTTP/CLI/build nem bizonyítja a valódi scroll/clipboard felületet.

## Következő szelet és teljes terv

P10 kurált kollekciók, majd külön explicit OG/index/permission/cache-kapu és pozitív UI-próba. Trending/Most Forked/referral/olvasás→saját élet kohorsz csak külön megfelelő mérési és abuse-kapuval; fork-metrika P12 után. P11 teljes refresh/owner/publish/withdraw/privacy folyamat, P12 public checkpoint/private fork/scenario personalization, P13 változatos genuine AI-tartalom/quality/usage feedback és release továbbra követelmény. A P10 és teljes nyilvános MVP nincs kész.

P01–P13 és S0–S7 kombinált scope, S3 raw/backup/korábbi személyes próza/billing/grace/deadline, S4–S7, P06 valós kiesés/backup/restore/email és Contabo/Cloudflare/domain/TLS/tűzfal/éles allowance megmarad. Új paid AI **0**; a külön kumulatív OpenAI/Claude 5–5 USD keret guard-maradéka **2.254014125 / 2.62877 USD**, korábbi ismeretlen usage-foglalások változatlanok. Nincs normál flag-aktiválás vagy Contabo-telepítés/Cloudflare-módosítás.
