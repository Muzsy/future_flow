# alterward — napi titkosított mentés és felügyelet

2026-10-11 00:53 UTC: a [managed/történeti életciklus aktiválási riportja](RECOVERY_LIFECYCLE_ACTIVATION_REPORT_HU.md) az aktuális mentési/ütemezési/riasztási bizonyíték. A 1525943 napi és managed szerverforrás, helyi másolás és első recovery timer-futás ellenőrzött; hosted login/roles/privacy authority/fence és kiszolgálási kapu továbbra nyitott. Az alábbi korábbi dátumozott checkpointok az akkori forrás állapotai.

2026-10-10 · [Mentés és restore-határ](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md).

## Korábbi, 2026-10-10 09:25 UTC célgépi checkpoint

A napi mentés és felügyelet külön üzemeltetői eszköz, az alkalmazási image cseréje nélkül. A bekapcsolás feltétele a tényleges célkörnyezeti mentés, titkosított helyi másolat, abból izolált PostgreSQL/config restore és sikeres első monitor. A szerver és a helyi gép ütemezése aktív; a pontos kiadási és visszaállítási bizonyíték alább szerepel.

- Napi szervermentés **03:15 UTC**, legfeljebb egyperces eltolással; két saját systemd timer, a monitor negyedóránként.
- A PostgreSQL 17 `public` séma csak `ff_`/`aw_` táblái, read-only repeatable-read exportált snapshotból; a forrástábla-sorösszegek és rendezett tartalom-hash ugyanahhoz a snapshothoz tartoznak. A `pg_dump` hitelesített CA/hostname TLS-t és rögzített kliensimage-et használ. Nincs éles DB-írás vagy automatikus restore.
- Proxy/config, Origin TLS, aktuális/előző owner runtime és upgrade-journal, adatbázis-CA, valamint a napi eszköz/config és négy unit titkosítva mentve. Ez nem teljes Supabase Auth/Storage/grant/SMTP/dashboard backup.
- A szerveren kizárólag az age nyilvános recipient tartós. A mentési plaintext és ideiglenes DB-credential root-only, host `/run` tmpfs munkaterületben van; a Docker-kliens 256 MiB/0,5 CPU korlátú. A restore során az eredeti identity csak ideiglenesen, SSH stdinből használható.
- Szigorú **hét nap** megőrzés az új, külön managed daily archívumokra. A teljes batch neve, manifestje, fájlkészlete, link/uid/mode és ciphertext-hash törlés előtt ellenőrzött; csak a három ismert fájl és az üres saját könyvtár törölhető. Sérült/idegen/hiányos archive esetén nincs vak törlés, monitorhibát kell rendezni. A hétnapos utolsó régi másolatot sem tartjuk meg korlátlanul. A régi rehearsal/config proofok külön történeti állományok, nem részei az automatikus expirynek.
- A helyi gép saját felhasználójának óránkénti és bejelentkezéskori feladata rögzített PowerShell 7-, Node-, wrapper-, root operátor- és report-dependency hash-eket, meglévő SSH-kulcsot és hostpint használ; nem tárol jelszót, nem fut SYSTEM-ként. Az operátor lockja elkerüli az átfedést. Csak bekapcsolt gépen és belépett felhasználó mellett működik; kikapcsolva a másolás és helyi expiry a következő futásig vár. A gép és a szerver együttes elvesztése ellen ez nem független redundancia.

## Felügyelet és hibaút

A monitor ellenőrzi az aktuális három saját szolgáltatás állapotát/image-et, az owner-only nulla költségkeretet, a read-only DB/TLS elérhetőséget és öt queue aggregált pending darabszámát, négy origin 403/no-store választ, anonim HTTPS Access login kaput, legalább 2 GiB szabad tárhelyet, harminc napnál hosszabb Origin-cert érvényességet és 26 óránál frissebb mentést. A worker `running` állapota nem önmagában sikeres job-feldolgozási bizonyíték.

A monitor root-only státuszfájlt és systemd/journal eredményt ír; hibánál nem nulla exitkódot ad. Nem küld emailt, nem nyit hozzáférést, nem aktivál paid AI-t és nem indít újra automatikusan alkalmazást vagy idegen szolgáltatást. Külső hibaértesítési csatorna és az egész host kiesését másik gépről figyelő monitor külön hiányzó kapu.

Az owner activation lock megakadályozza, hogy egy frissítés és a mentés egy időben módosuló runtime-ból készítsen snapshotot. A napi eszköz pontos telepített script-hash-eket ellenőriz. Új alkalmazási kiadás vagy fizetett béta esetén a jelen owner-only monitor határát külön felül kell vizsgálni; vak script-/timer-felülírás nincs.

## Operátori parancsok

[Windows indító](../scripts/contabo-daily.mjs), [szerveroldali feladat](../scripts/ops/contabo-daily.py), [telepítő](../scripts/ops/contabo-daily-install.py), [helyi feladatkezelő](../scripts/contabo-daily-sync-task.ps1).

```powershell
node scripts/contabo-daily.mjs --prepare
node scripts/contabo-daily.mjs --backup
node scripts/contabo-daily.mjs --monitor
node scripts/contabo-daily.mjs --sync
node scripts/contabo-daily.mjs --restore-latest
node scripts/contabo-daily.mjs --activate
node scripts/contabo-daily.mjs --status
```

`--disable` csak a két saját timert kapcsolja ki, archívumot vagy alkalmazást nem töröl. `--expire-local` a helyi managed archívumok megőrzését ellenőrzi SSH nélkül. A titkosított fájlok és proofok ACL-védett `.local/contabo-daily` könyvtárban, a visszafejtő kulcs a meglévő külön secrets-helyen marad; Gitbe/image-be nem kerülnek.

A felhasználó szerint nincs külön második tárhely/gép. A visszafejtő kulcs és mentés független biztonsági példánya, a hosztolt Supabase határai, privacy/törlés-visszavonás replay és külső hibaértesítés továbbra külön feladat; a napi timer ezeket nem helyettesíti. A teljes P01–P13 / Shared S0–S7 és jóváhagyott 10 USD/tízfős béta megmarad, most inaktív.

Hivatalos háttér: [PostgreSQL snapshot-szinkronizálás](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [systemd timer](https://github.com/systemd/systemd/blob/v255/man/systemd.timer.xml). A helyi systemd 255 unitokat aktiválás előtt a célgép saját ellenőrzője vizsgálja.

## Tényleges aktiválás: 2026-10-10

Az aktív szerveres és helyi forrás azóta **dbaac32**; a friss capture/offsite restore és a tényleges óránkénti feladat eredménye a [napi expiry jelentésében](DAILY_EXPIRY_RECOVERY_HU.md) szerepel. Az alábbi táblázat az eredeti telepítés történeti bizonyítéka.

| Ellenőrzés              | Eredmény                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Korábbi szerverforrás   | df7550eee2faef081e608a4edce4e5f371b4db48; mindhárom script és négy unit hash-e kötött                                                                                                                          |
| Korábbi helyi transport | 2eb9a50579fc84dc9d9af2c747cbb0d5ed1190e4; eredeti SSH-kulcs/hostpin, külön másolás nélkül                                                                                                                      |
| Friss mentés            | 20261010T092255Z-ca2becbc; 97 tábla, 1633 sor, 55 configfájl                                                                                                                                                   |
| Offsite restore         | 2026-10-10T09:24:39.514Z; ciphertext/tamper/config/adapt/validate és valamennyi tábla egyezett; izolált, nincs éles DB-írás                                                                                    |
| Időzítők                | 2026-10-10T09:25:23.186Z; backup/monitor enabled+active; 03:15 UTC (jelenleg magyar idő szerint 05:15), illetve negyedóra                                                                                      |
| Helyi task              | Current-user Interactive/Limited, jelszó nélkül; valódi futás eredménye 0, az első automatikus 09:39 UTC futás is sikeres                                                                                      |
| Fájlhatár               | Ideiglenes kulcs/plaintext és PG-kliens eltávolítva, /run tmpfs/root 0700; tartós restore-* maradvány nincs                                                                                                    |
| Működő alkalmazások     | Kilenc futó konténer; a hat idegen futó szolgáltatás állapota az owner-upgrade baseline-nal egyezik; a külön már leállított idegen Ghosthoz nem nyúltunk                                                       |
| Tesztek                 | 65 helyi Python esetből 64 sikeres, egy Windows symlink-korlát; 24 új eset a valódi Linuxon mind sikeres; hat Node-retention eset; két tényleges dependency-tamper elutasítás SSH előtt                        |
| CI                      | [Pontos 2eb9a50 verify/container sikeres](https://github.com/Muzsy/future_flow/actions/runs/38041820645); az előző [df7550e](https://github.com/Muzsy/future_flow/actions/runs/38040938829) és 135fd7b is zöld |

A 03:15 UTC napi és negyedórás schedule engedélyezett; a jövőbeli minden futás sikerét az aktiválás nem bizonyítja. A kimaradt időpontokat a persistent timer követi. A monitor nem indít újra alkalmazást. A státusz csak aktuális source/script/unit-kötéssel és megfelelő frissességgel sikeres: backup legfeljebb 26 óra, monitor 30 perc, aktiválási restore-próba hat óra. Az aktiválás külön job/owner lock alatt, a root által megőrzött tényleges restore-recorddal és runtime-újraellenőrzéssel történt.

A systemd ténylegesen újra létrehozta a szándékosan eltávolított **üres saját** runtime-könyvtárat, mielőtt futtatta a monitort. A hard-kill próba az eredeti rehearsal kulcsfájlírását használta, mesterséges, nem valódi kulccsal: a saját gyermekfolyamat SIGKILL után a tényleges monitor eltakarította a memóriamaradványt. Ez nem teljes host-reboot vagy valódi titkoskulcsú restore hard-kill garantált lefedése. A végső valódi restore másik, sikeres próba.

Egy config-capture futás zártan hibát adott a proxy-config szakaszban; az ok nem reprodukálódott. Nem keletkezett elfogadott hibás snapshot. Ugyanezen forrás közvetlen diagnosztikai és későbbi valódi systemd capture-ja sikeres, majd a friss offsite restore és monitor is sikeres volt. A negatív státusz nyoma privát bizonyítékban megmaradt.

A Windows feladat régi powershell.exe indítása execution-policy hibát adott, a PowerShell 7-es következő próba pedig a csomagolt alkalmazás által átirányított AppData miatt nem találta az eredeti SSH-fájlt. Most a már installált, hash/path szerint rögzített PowerShell 7 és az eredeti, fizikailag létező védett könyvtár explicit címe működik. Mindkét eredeti SSH-fájl hash-e egyezett; nincs új credential, másolt kulcs vagy globális execution-policy módosítás. A valódi task és az első automatikus másolás eredménye 0. [Microsoft MSIX/AppData magyarázat](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).

## Claude-audit és önálló értékelés

A 135fd7b első audit hét, a 6cfeddd javításellenőrzés négy, a df7550e egy további észrevételt adott. A 2eb9a50 transportellenőrzés új finding nélkül elfogadott. A korábbi 43-mal együtt **55 megfigyelés**, nem 55 igazolt hiba. A Claude minden körben forrást olvasott; privát szerveradatot, kulcsot és runtime-proofot nem kapott, tesztet nem futtatott. A tényleges próbákat a Codex külön végezte.

| Jelzés                 | Értékelés / kezelés                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DLY-01 medium/source   | A reboot utáni hiányzó munkakönyvtár igazolt tervezési hiba; RuntimeDirectory/mode/Preserve és új forrású státusz, célgépi hiányzó-könyvtár próba kész             |
| DLY-02 low/source      | A két hiányzó helyi dependency pin javítva; valódi tamper-elutasítás és teljes Windows task sikeres                                                                |
| DLY-03 low/source      | Friss source/script/unit-kötés, root-recorded manifest/cipher restore és két lock implementált, valódi aktiválás sikeres                                           |
| DLY-04 low/source      | Inventory/status job-lock, saját pending cleanup; ütközéskor zártan hibázik, következő órában új próbálkozás                                                       |
| DLY-05 low/hypothesis  | Sérült lock/PID-újrahasználat miatti megakadás: operátori feladat; aktív lockot automatikusan nem lopunk el                                                        |
| DLY-06 low/source      | Elfogadott szigorú hét nap; folyamatos hét napnál hosszabb hiba a legutolsó managed másolatot is lejáratja. Külső riasztás még külön kapu                          |
| DLY-07 info/hypothesis | Adatnövekedéskor vizsgálandó: 15 s query-limit, 240 s snapshot watchdog, 360 s backup unit, 128 MiB file/buffer és 60 s letöltési timeout                          |
| DLY-08 low/source      | A hiba source-kötése és eredeti alert/phase megőrzése javítva                                                                                                      |
| DLY-09 low/hypothesis  | Valódi fennmaradási kockázat megelőzése: daily restore /run tmpfs-ben, signal/finally kezelés és scoped elhagyott PG/scratch cleanup; régi disk-maradvány nincs    |
| DLY-10 info/hypothesis | A megosztott /run kapacitása növekedéskor újra vizsgálandó; jelenleg legalább 384 MiB guard és kis dump                                                            |
| DLY-11 info/source     | Régi saját /dev/shm munkakönyvtár üres, szándékosan megmarad rebootig                                                                                              |
| DLY-12 low/source      | A memory-only flag nem önálló per-run filesystem guard: ezen a célgépen külön findmnt tmpfs bizonyíték igazolja; másik gépre portoláskor külön hardening szükséges |

Az első audit tévesen írta, hogy az aktiválás már owner-lockot tartott; ezt önállóan javítottuk, és a későbbi auditor helyesnek olvasta. A következő audit egyik limitmondata a teljes host-reboot hiányát összemosta a runtime-könyvtár próbájával: a könyvtárpróba ténylegesen megtörtént, host-reboot nem. Az auditor megállapításai nem automatikus engedélyek vagy runtime-bizonyítékok.

A végső kijelzett saját Cloud-session összköltség 33,45 USD; a korábbi 28,38 USD-hez képest **5,07 USD** az új mentési/audit/transport körök kijelzett változása. Cache-találat 94%, Sonnet 5.5; a promóciós maradék kijelzése 69/100 USD. Ez külön Cloud-metrika, nem szolgáltatói számla vagy az alkalmazás 10 USD béta-kerete. Az alkalmazás új provider-hívása/költése 0.

## Aktív korlátok és kezelendő hibák

- Nincs független második tárhely vagy kulcsmásolat; ezt a felhasználó megerősítette. A jelen helyi gép és a VPS közös elvesztését nem oldja meg. A csomagolt alkalmazás cache-függősége és a kulcs külön, stabil megőrzése külön feladat.
- Kikapcsolt vagy kijelentkezett helyi gépen nincs sync/expiry. Pin-változás, sérült lokális archive vagy lockhiba esetén sincs sikeres futás; így a helyi hét nap a következő tényleges futásig túlléphető. Nincs külső értesítés.
- Pinfrissítésnél a saját taskot ellenőrzött leállítás/archiválás után újra kell telepíteni; PowerShell/Node/source változás nem fogadható el vakon. A privát scriptet kizárólag a jelen user/SYSTEM ACL védi, ugyanazon felhasználó bizalmi határán belül.
- Foglalt job/owner locknál később újrapróbálunk. Sérült/idegen archive és nem ismert scratch/fixture esetén nem törlünk vagy javítunk vakon. A privát status, unit Result/journal és Windows LastTaskResult együtt vizsgálandó.
- A régi történeti mentések nem tartoznak e hét napos managed expirybe. A teljes retention/privacy replay, régi érintett próza, hosztolt Auth/Storage/grant restore, külső host-monitor és paid worker/provider hibaút külön béta-kapu.
