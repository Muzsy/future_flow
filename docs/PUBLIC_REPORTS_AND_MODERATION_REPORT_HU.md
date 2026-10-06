# alterward — nyilvános bejelentés és moderáció

2026-10-07 · [Dokumentációs központ](README.md) · [Teljes backlog](NEXT_STEPS.md).

## Működő P10 szelet

Az angol Official és Community nyilvános olvasóban bejelentkezve bejelenthető egy jelenleg olvasható public élet. A bejelentés tartós, privát és önmagában nem módosítja a történet láthatóságát vagy rangsorát. A moderátor védett helyi parancsból dönthet: elutasítás, figyelmeztetés, soft hide vagy hard remove. A visszaeső kezelése külön, explicit publikálási korlátozás és auditált moderátori feloldás; nincs bejelentésszámból automatikus tiltás.

- `POST /api/v2/public-reports/:slug`: bearer Auth, szerveroldali user ID, strict reason/details és `public-safety-1` receipt. A kilenc kategória az eredeti közösségi specifikációból: personal data, harassment, hate, explicit sexual content, violence, illegal content, scam, impersonation, spam.
- Opcionális details legfeljebb 1000 karakter. A form angol, privát adatok hozzáadásától óvó, címkézett; küldéskor újra a teljes public olvasói és English/Official provenance kapu érvényes.
- Egy user/publication/reason egy tartós eset. Ismétlés megtartja az első szöveget és az azonos case ID-t; nem nyit új ügyet vagy ír felül megvizsgált anyagot. Gördülő 24 óránként 10 új bejelentés/fiók; duplicate ingyenes a limitnél is. Userlock védi a kvótát és a párhuzamos dedupot, globális mentő/kiadó lock-sorrenddel.
- Anonim, idegen reporter ID, private/unlisted/withdrawn/hidden/removed/deleting vagy kikapcsolt reader nem érhet el új bejelentést. Az API no-store, a meglévő IP-rate-limit alatt. `PUBLIC_REPORTS_ENABLED=false` a normál alapérték; a valódi `.env` nem változott.
- `GET /api/v2/public-safety`: saját, bejelentkezett felhasználó publikálási korlátozása és legutóbbi 20 figyelmeztetése. Saját Settings-panel, angol hiba/üres állapot. Nincs másik reporter identitása, details, moderator actor vagy privát történet a figyelmeztetésben. A saját notice olvasása kikapcsolt új bejelentés mellett is működik.

## Tartós ügy és moderátori döntés

Az additív `027_public_reports_and_safety.sql` négy privát RLS/REVOKE táblát hoz létre:

| Tábla | Adat és lifecycle |
|---|---|
| `aw_public_reports` | Saját reporter FK, pontosan egy public publication FK, reason/details, szerveridő, queued/resolved case, revision és végleges strict döntés/hash. Reporter vagy publication törlése kaszkád. |
| `aw_public_warnings` | Publisher saját figyelmeztetése: korábbi public slug, moderátori reason/action, idő és audit actor. A reporter törlése csak a case FK-t nullázza; a figyelmeztetés megmarad a tulajdonosnak. Publisher törlése kaszkád. |
| `aw_publication_restrictions` | Publisher aktív/inaktív korlátozása, revision, reason/actor/idő. Explicit döntés és userlock; saját fióktörlés kaszkád. |
| `aw_publication_restriction_actions` | Append-only korlátozás/feloldás audit, user+revision unique. Saját fióktörlés kaszkád. |

A bejelentett details és kezdeti binding nem írható át. A case egyszer mehet queued→resolved állapotba, revision+1 és döntés/hash/idő mellett; a döntés terminális. Figyelmeztetés tartalma immutable, kizárólag a reporter törlése utáni case FK-leválasztás megengedett. Ez egy ügy minden egyedi bejelentéshez, még nem külön több bejelentést csoportosító admin munkafelület vagy appeals workflow.

A privát CLI queue a legkorábbi 100 függő esetet adja, publication revision/hash/status és korábbi owner-warning count mellett, védett JSON-fájlba. A reporter szövege vizsgálandó adat; nem utasítás és nem kerül konzolra. A döntés a pontos report revision, publication revision és immutable snapshot hash alapján, publisher-first lockkal és a case lockjával egy tranzakcióban fut.

Azonos döntés újraalkalmazása nem ismétli a warningot, publication actiont vagy restriction auditot; eltérő versengő döntés 409. Hide/remove a már meglevő Community/Official trusted lifecycle-t használja: token érvénytelenítés, status/revision és audit. Így a public olvasó, Discovery és mentett kártya ugyanazzal az aktív jogosultságellenőrzéssel tilt. Nincs privát canon vagy korábbi fejezet átírása. Dismiss nem ad warningot és nem korlátozhat publikálást.

A warning/hide/remove döntés opcionálisan explicit `restrictPublishing=true` lehet. A korlátozás mindkét kiadási rendszerben a Prepare és Confirm kapuját zárja, az idempotens Confirm-hívásokat is; meglévő public olvasás, withdrawal, saját privát élet és account export/törlés ettől nem tiltott. Nem állítja vissza a már elrejtett/eltávolított/visszavont példányt egy későbbi feloldás. A limit feloldása külön expected revision és audit actor mellett történik, nem automatikus időzítővel vagy befizetéssel.

## Védett operatori használat

`pnpm moderation:public-report` a megbízható helyi operatori belépési pont. Előfeltétel: csak az adott operatori parancs környezetében `PUBLIC_REPORT_OPERATOR_ENABLED=true`; normál mintákban false, a Compose API/worker környezetében nem adjuk át. Nincs böngészős moderator, approval vagy restriction útvonal.

- `--list`: `.local/public-report-moderation/queue.json`, user/SYSTEM ACL vagy 0700/0600 alatt. Nem nyomtat tartalmat, nyers credentialt vagy reporter részletet.
- `--request-file <védett fájl> --apply`: `publicReportModeration` schema; reportId/reportRevision/publicationRevision/snapshotHash/action/reasonCode/actorLabel/restrictPublishing/acknowledged.
- `--restriction-file <védett fájl> --apply`: `restriction` schema; userId/revision/active/reasonCode/actorLabel/acknowledged. Az első restriction revision 0, létrejött állapot 1; feloldás a jelenlegi revisionnel.

A request a védett operatori könyvtáron belül legyen, valódi, egyetlen hivatkozású fájl; symlink, több hardlink és kilépő path tiltott. A script sanitized hibát és csak eredményazonosító/állapot/0 paid AI összegzést ad. A kézi audit és feloldási folyamat a kis pilotnak készült; admin webfelület/ appeals/deadline/notification email későbbi scope. A saját Settings-ben a warning már olvasható.

## Export és törlés

A reporter saját exportja a saját ID/korábbi public slug/reason/details/status/createdAt mezőket adja. Nem ad másik publisher belső UUID-ját, forráshashét, privát anyagát vagy decision/actor adatát. A publisher saját warning/restriction/audit metaadatai külön exportálhatók, másik reporter és a bejelentési szöveg nélkül. Reporter törlése után a már kiadott owner-warning leválasztott metaadat marad; ez szükséges a meglévő publikálási korlátozás nyomon követéséhez. Az érintett saját account törlése minden saját safety-adatot kaszkáddal eltávolít. Backup-retention/restore és teljes P13 adatkezelési szabály továbbra kiadási kapu.

## Ellenőrzött bizonyíték és határ

Teljes helyi `pnpm check`: format/types, **491 teszt/42 fájl**, API/worker/Next production build, 117 generált séma. A korábbi 112 séma, 001–026, valódi AI-történetek, stratégiai/Shared források, ZIP és archívum változatlanok. Fejlesztői Supabase 001–027 alkalmazva/ismételve, 19 ff_ és 60 aw_/60 RLS, valódi client CA/TLS ellenőrzéssel.

10 új izolált PGlite/HTTP regresszió: default-off/strict, own dedup/details/identity, rolling quota, unlisted/withdraw/readerflag, warning/dismiss/replay/private-canon, hide/remove/Discovery/Save, explicit restriction és feloldás, saját export/reporter-delete warning-detach/publisher-cascade, immutable/RLS és hitelesített HTTP/hiányzó admin route. A restriction-teszt első próbája újra akarta publikálni a már kiadott csomagot; új, külön jóváhagyott technikai csomagra javítottuk. Az eredeti egyszeri kiadási kötést nem lazítottuk.

Valódi Supabase Auth és HTTP, két disposable fiók és változatlan genuine háromfejezetes Official seed: három párhuzamos jelentés egy case, receipt/no-store, anon és forged identity tiltás, a bejelentés nem rejti el a valódi mintát. A tényleges CLI-moderációhoz külön ideiglenes **technikai Community tesztpéldány** készült, nem új AI-minta vagy termékbeli demo. Warning/replay→egy notice, private publisher view, explicit restriction mindkét Prepare/Confirm API-n, külön CLI restoration, hide→public 404/Save null, hard remove→removed, saját export és hiányzó böngészős admin útvonal sikeres. Reporter valódi friss Auth DELETE után a publisher figyelmeztetése megmarad; publisher valódi DELETE után mind a négy új tábla saját rekordjai eltűnnek. Supabase Auth/DB cleanup ellenőrizve. A genuine seed teljes private exportja az exportidő kivételével, mindkét kumulatív AI-napló hash-e változatlan.

A korábbi Save/Share runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37540838881), `3d49bef83c20242cb0af771e1a9ab6e46cacf791`: verify/container sikeres, 481/41/112, 001–026 és ismétlés, 5 új valódi PostgreSQL/CA TLS mentési proof és minden korábbi Shared/P09/Official/Discovery bizonyíték, verified HTTPS/worker-stop, egress tiltva, paid CI AI 0. Az új Report runtime [main CI](https://github.com/Muzsy/future_flow/actions/runs/37542777634), `726f7f4a229bb30bc4fadbbbdb8b18f0761f4568`, verify/container sikeres: 491/42/117, 001–027 és repeat, 6 új valódi PostgreSQL/CA TLS safety proof, minden korábbi Shared/P09/Official/Discovery/Save bizonyíték, verified HTTPS/worker-stop, egress tiltva, paid CI AI 0. Az új 027 smoke additívan teszteli a concurrent Report/decision/restriction/restoration, own warnings/export, full Official permission és deletion/RLS/cascade határokat. A pozitív böngészős Save/Share/Report/Settings/Discovery/Official UI-próba nem áll rendelkezésre; a korábbi eszközkorlátot nem kerültük meg. CLI/HTTP/build nem böngészős bizonyíték.

## Hátralévő scope és keret

Új paid AI: **0**. Külön kumulatív OpenAI/Claude 5–5 USD keret, guard-maradék 2.254014125 / 2.62877 USD és korábbi ismeretlen usage-foglalások változatlanok. Nincs normál public/béta flag aktiválás, Contabo-telepítés vagy Cloudflare-módosítás.

Következő P10: tartalom nélküli read/save/share/report/moderation metrikák, kurált kollekciók, külön explicit indexelési/OG/permission/cache-kapu és pozitív UI-próba. A mostani kiadási kontraktus továbbra noindex; a public URL önmagában nem indexelési hozzájárulás. P11 teljes owner/publish/withdraw/permission/privacy folyamat, P12 public checkpoint/private fork/scenario personalization, P13 változatos valódi AI-tartalom/quality/usage feedback és átfogó release továbbra szükséges. P01–P13/S0–S7, S3 retention/régi személyes próza/billing/grace/deadline, S4–S7, P06 valós kiesés/backup/restore/email és teljes Contabo/Cloudflare/domain/TLS/tűzfal/éles allowance megmarad. A P10 és a teljes nyilvános MVP még nincs kész.
