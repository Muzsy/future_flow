# alterward — S3 Connections és biztonság

2026-10-05 · A [személyes/time szelet](SHARED_CONTEXT_S3_REPORT_HU.md) folytatása. Az angol Connections, block/report és védett moderáció implementált, kikapcsolt feature mögött. **A teljes friend kiadási kapu még nyitott.** Az eredeti P01–P13/public terv és a [Shared S0–S7 terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) együtt marad az irányadó; [következő lépések](NEXT_STEPS.md).

## Angol Connections

Hitelesített `GET /api/v2/shared-capabilities` kizárólag a szerver friend-availability értékét adja, no-store válasszal. A navigáció és a felület ezt követi; a kliens nem kapcsolhatja be a funkciót. Az angol csoportlista/profil/tier/slot, saját élet- és ágválasztás, külön consent, create/invite/preview/accept, saját decision és közös idővonal elkészült. Free előnézetet és biztonsági műveleteket kap, a felület nem kínál működés nélküli fizetős checkoutot. A várakozó közös emlékek a saját életben külön jelzést kapnak; olvasás és polling nem indít AI-hívást. Saját folytatás közös döntés közben is megengedett.

A meghívó kódja URL-fragmentben nyitható meg, a felület azonnal eltávolítja és csak memóriában őrzi. Preview és accept POST-ban továbbítja; nincs query-paraméter, localStorage vagy cookie. Kijelentkezés törli, bejelentkezési átirányítás után szükség esetén újra meg kell nyitni a linket. Új meghívó hét napos, másolása és visszavonása külön művelet. Címzett nélküli bearer-meghívót a link olvasója csak helyben zárhat be; destruktív decline kizárólag a célzott címzettnek engedett. Double-click guard, revision és ugyanazon bemenet hálózati retryjához megtartott idempotenciakulcs védi a módosításokat. Más tag branch/user/goal/employer adata nincs a közös DTO-ban; a generálás státuszából nem látszik a payload, checkpoint, lease vagy payer.

A decision kizárólag a saját választ adja vissza; másoknak a beérkezett válaszok száma látszik. Lezáráskor az opt-in érdeklődésként szerepel, nem teljesített közös programként. Az üres/null deadline mindenkit megvár; a 48 órás javaslat nem vált alapértékké. Leave/continue-solo, owner end és ended archive külön megerősített művelet; nem írja át a személyes múltat.

## Tiltás, jelentés és moderáció

`GET /shared-contexts/:id/safety` saját block-member referenciákat és saját jelentéseket ad. `POST /shared-contexts/:id/block` és `unblock`: strict memberId/contextRevision és idempotencia, nincs kliensoldali másik userId. A blokkolás két irányban tiltja az új páros meghívást és közös generálást. Minden érintett csoportban megszakítja a függő döntést és queued/running jobot; a csoportot, mások történetét és a személyes ágakat nem törli. A saját block-lista nem teszi láthatóvá, ki blokkolt másokat. Feloldás nem támaszt fel sem jobot, sem meghívót. Rendezett user → context lock-sorrend és fresh membership/scope ellenőrzés védi a többcsoportos módosítást.

`POST /shared-contexts/:id/reports`: context/member/event, strict reason és legfeljebb 2000 karakteres részlet. `POST /shared-invites/reports` a bizonyított bearer-kódot használja, helyes targeted recipient ellenőrzéssel, belépés/accept nélkül is. A kód sem a reportban, sem az idempotencianaplóban nem marad meg. Tíz új jelentés/user/24h, tartós target/reason dedup; ismétlés nem írja felül az első részletet. Report és block Free/downgrade mellett is elérhető. Más tag jelentése/reporter adata nem olvasható; saját export tartalmazza a saját jelentéseket, fióktörlés eltávolítja őket és a block-párokat.

Az operátori hold/release/dismiss kizárólag trusted szerverbelső művelet és külön CLI, felhasználói HTTP-admin végpont nincs. Hold külön `moderation_hold` mező: leállítja a jobot, visszavonja a függő meghívókat, lezárja a döntést, és invite/accept/intent/generation/lease-commit/restart után is megállítja az új interakciót. A közös múlt és a saját személyes történet olvasható; leave és report továbbra lehetséges. Release nem indít automatikus generálást és nem nyit újra ended/archived csoportot. Audit actionId/hash/revision védi az ismétlést; az audit tartalma immutable, törölt report hivatkozása leválasztható. Report nem okoz automatikus tiltást, nincs AI-moderáció vagy automatikus külső értesítés.

## Additív adatbázis

**001–012 a fejlesztői Supabase-on alkalmazva és checksumos ismétléssel ellenőrizve.** A korábbi 001–010 változatlan.

- `011_shared_selective_account_cleanup.sql`: a korábban kilépett tag törlése megtisztítja a hozzá tartozó completed/failed/queued/running AI-inputokat és checkpointokat. Más, újabb maradó-tag generálás payload/lease/contextRevision értéke megmarad. A ténylegesen érintett live membership, job vagy visszavont invite továbbra invalidál. Receipt és immutable canon megmarad. Ez nem a retained próza PII-redakciója.
- `012_shared_safety_and_moderation.sql`: két privát RLS-tábla (`aw_shared_reports`, `aw_shared_moderation_audit`) és moderation hold. A rendszerben 19 ff_ és 33 aw_ tábla, mind a 33 aw_ táblán RLS; anon/authenticated közvetlen hozzáférés tiltva.

Három új JSON-séma: blockRequest, reportRequest, inviteReportRequest. A korábbi 39 séma és Life v2 2.0.0 változatlan, az összes exportált séma 42. A Shared szerződésverzió marad 1.0.0.

## Ellenőrzés és bizonyíték határa

A jelenlegi készlet 297 teszt/26 fájl: új auth/flag/no-store, strict report/block, own privacy, Free hozzáférés, rate/dedup, többcsoportos cancellation, stale revision, invalid lease, restart hold, RLS, saját export/report törlés/audit detach, valamint former-member queued/running job megtartás regressziók. A teljes check/build és main container CI végső eredménye az alábbi bizonyítékkiegészítésben szerepel.

Elkülönített helyi PGlite/API és két valódi, megerősített, szintetikus Supabase Auth-fiók mellett böngészőben ellenőrizve: create/own branch/consent, private fragment/preview/accept, két külön saját decision és lezárás, személyes pending banner, revoke és leave/solo. A közös/privát fejezetek ebben a UI-próbában kifejezetten tesztfixture-ök, nem fizetett AI és nem a termék fallback módja. A termékben továbbra kötelező a valódi AI. 390×844 mobilnézeten nincs vízszintes túlcsordulás. Külön UI-próba ellenőrzi a privát report, block/unblock és moderation hold állapotot. A tesztfiókok takarítása kötelező; screenshotok és tesztjelszavak csak a Gitből kizárt `.local` alatt vannak.

Új fizetett AI-hívás nincs: OpenAI guard 2.074165875 USD, megmaradt 2.925834125 USD; Claude guard 2.338015 USD, megmaradt 2.661985 USD. A két történeti ismeretlen Claude-hívás teljes foglalása marad. Mind a négy Shared flag false, éles allowance nulla, Contabo-változás/deploy nincs.

## Operátori használat és következő kapu

Privát helyi/szerveroldali környezetben, megbízható DB-kulccsal: `SHARED_MODERATION_ADMIN_ENABLED=true` és `pnpm moderation:shared --list`. A listázás a védett `.local/shared-moderation/reports.json` fájlt írja; konzolba csak darabszám és fájlnév kerül. Windows alatt írás előtt saját user+SYSTEM ACL, más rendszeren 0700/0600 jogosultság. A felhasználói web ebből semmilyen adminjogot nem kap.

Kézzel átnézett `.local/shared-moderation/action.json` kötelező mezői: `contextId`, új UUID `actionId`, aktuális `contextRevision`, `action` (`hold`/`release`/`dismiss`), `actorLabel`, `reason`; `reportId` opcionális, dismiss esetén kötelező. Alkalmazás: `pnpm moderation:shared --request-file .local/shared-moderation/action.json --apply`. A parancs csak a védett mappán belüli valódi fájlt olvassa; nincs automatikus ítélet. A jogosultsági flag nélküli próbát elutasította, az explicit listázás nulla reportot adott a fejlesztői DB-ben, személyes tartalom naplózása nélkül. Éles moderációs lépés nem történt.

Hátravan a törölt tagot érintő retained próza adatvédelmi vetülete és a nyers tárolás/backup-retention szabálya, teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery bizonyíték, entitlement/billing és release-deadline döntés. A törölt tag régi szövegének megjelenítési választása folyamatban: ajánlott az érintett szöveges részletek elrejtése ellenőrzött dátum/eredmény megtartásával; másik lehetőség a teljes érintett esemény elrejtése. Válasz nélkül nem válik elfogadott döntéssé. S4–S7 és P09–P13 ezután is a közös terv része; P06 backup/restore/ops és későbbi Contabo-élesítés megmarad.


## S3 Connections/safety lezárási bizonyíték — 2026-10-05

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37303841122) (`9e3c9c5`) verify és container sikeres: 297 teszt/26 fájl, teljes formázás/típusellenőrzés/API/worker/Next build, 42 séma-drift. Izolált valódi PostgreSQL/TLS mellett 001–012 migráció és ismétlés, korábbi S0–S3 proof, former-member queued/running payload-megtartás, konkurens kétoldali block, lease-cancellation, restart utáni moderation hold és privát report cascade/audit detach ellenőrzött. Web/API/Caddy HTTPS és üres worker-leállítás sikeres; nincs paid AI vagy valódi CI-credential. Ez nem Contabo-élesítés vagy teljes friend Auth-release.

Mindkét izolált böngészős próba saját szintetikus Auth-fiókjai törölve; a credential fájl hiányzik, a QA 3001/4100 portok leálltak. A normál helyi fejlesztői környezet megmarad. A friss dokumentációs auditban 111 Markdown (108 docs), 21 aktív/21 archív téma, 42 séma, ép helyi linkek és horgonyok; eredeti 80 fejezet, public14 és Shared15/17 checksum megmarad. A két AI-költségnapló változatlan. Következő S3 lépés a megválaszolandó retained privacy megjelenítés, majd teljes valódi fiókos Shared→saját AI→export/törlés/recovery; a többi P/S-terv megmarad.
