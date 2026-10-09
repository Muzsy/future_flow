# alterward — napi titkosított mentés és felügyelet

2026-10-09 · [Mentés és restore-határ](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md).

## Implementált eljárás, aktiválás előtti ellenőrzés

A napi mentés és felügyelet külön üzemeltetői eszköz, az alkalmazási image cseréje nélkül. A bekapcsolás feltétele a tényleges célkörnyezeti mentés, titkosított helyi másolat, abból izolált PostgreSQL/config restore és sikeres első monitor. A jelen szakasz implementációs leírás; a tényleges aktiválás bizonyítéka külön dátumozott checkpointban kerül ide.

- Napi szervermentés **03:15 UTC**, legfeljebb egyperces eltolással; két saját systemd timer, a monitor negyedóránként.
- A PostgreSQL 17 `public` séma csak `ff_`/`aw_` táblái, read-only repeatable-read exportált snapshotból; a forrástábla-sorösszegek és rendezett tartalom-hash ugyanahhoz a snapshothoz tartoznak. A `pg_dump` hitelesített CA/hostname TLS-t és rögzített kliensimage-et használ. Nincs éles DB-írás vagy automatikus restore.
- Proxy/config, Origin TLS, aktuális/előző owner runtime és upgrade-journal, adatbázis-CA, valamint a napi eszköz/config és négy unit titkosítva mentve. Ez nem teljes Supabase Auth/Storage/grant/SMTP/dashboard backup.
- A szerveren kizárólag az age nyilvános recipient tartós. A mentési plaintext és ideiglenes DB-credential root-only, host `/dev/shm` munkaterületben van; a Docker-kliens 256 MiB/0,5 CPU korlátú. A restore során az eredeti identity csak ideiglenesen, SSH stdinből használható.
- Szigorú **hét nap** megőrzés az új, külön managed daily archívumokra. A teljes batch neve, manifestje, fájlkészlete, link/uid/mode és ciphertext-hash törlés előtt ellenőrzött; csak a három ismert fájl és az üres saját könyvtár törölhető. Sérült/idegen/hiányos archive esetén nincs vak törlés, monitorhibát kell rendezni. A hétnapos utolsó régi másolatot sem tartjuk meg korlátlanul. A régi rehearsal/config proofok külön történeti állományok, nem részei az automatikus expirynek.
- A helyi gép saját felhasználójának óránkénti és bejelentkezéskori feladata pinned Node/sync-forrást, meglévő SSH-kulcsot és hostpint használ; nem tárol jelszót, nem fut SYSTEM-ként. Az operátor lockja elkerüli az átfedést. Csak bekapcsolt gépen és belépett felhasználó mellett működik; kikapcsolva a másolás és helyi expiry a következő futásig vár. A gép és a szerver együttes elvesztése ellen ez nem független redundancia.

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
