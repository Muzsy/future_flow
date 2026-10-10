# alterward — helyi managed mentések lejárata

2026-10-10 · [Szerveroldali retention](MANAGED_BACKUP_RETENTION_HU.md) · [Mentési lefedettség](SUPABASE_RECOVERY_COVERAGE_HU.md) · [Következő lépések](NEXT_STEPS.md).

A helyi managed másolatokra elkészült a külön [lejárati wrapper](../scripts/supabase-managed-local-expiry.mts) és [közös fájlkezelő](../scripts/ops/local-managed-recovery.py). Az új capture és a meglévő mentés olvasása is ezt használja. A változás nem alkalmazáskiadás, nem tesztelői aktiválás és nem új AI-hívás. Automatikus futtatás és teljes történeti retention még nincs.

## Miért szükséges

A hét napos manifest eddig tiltotta a lejárt mentés visszaállítását, de a helyi ciphertextet nem törölte. Az új eljárás kizárólag az eredeti munkakönyvtár `.local/supabase-recovery` mappájában lévő, projekthez kötött v2 managed másolatokra vonatkozik: runonként két ciphertext és egy manifest. A régi alkalmazásmentések, más mappák és JSON-ba ágyazott ciphertext külön feladat marad.

## Ellenőrzés és megszakítás

- A wrapper kizárólag explicit `--check` vagy `--apply` módot fogad. Nem kér és nem olvas visszafejtő kulcsot. A szerverről csak friss UTC-időt olvas a már rögzített SSH-hostkulccsal; lejárat mindkét óra szerint szükséges, legfeljebb öt perc eltérés mellett.
- A teljes batch friss és lejárt fájljai is ellenőrzöttek törlés előtt: eredeti könyvtár, regular egyszeres fájl, pontos projekt/scope/UTC/hét nap, ciphertext hash és méret. Link, sérülés, ismeretlen archívumfájl, eltérő vagy napló nélküli hiányos másolat megállítja a batch-et.
- Ugyanaz a kernelzár védi a helyi capture véglegesítését, a rehearsal számára történő olvasást és a lejárati műveletet. Windows alatt valódi byte-lock, Linuxon flock; a módosító Python-folyamat tartja a zárat, a folyamat halálakor feloldódik. Nem PID-alapú, elavult lock törlésével szimulált kizárás.
- Minden lejárt runhoz, az első unlink előtt, fsyncelt, egyszer létrehozott napló készül a `managed-lifecycle` almappában. Ez tartalmazza az eredeti manifestet, a könyvtár azonosítóját és a fájlok méretét/hashét/azonosságát. Megszakítás után csak a napló által igazolt hiány fogadható el; azonos tartalmú új fájl is blokkol, ha más az azonossága.
- A törlés pontos fájlnevekkel, manifest utolsóként történik. A lejárt runra mutató latest pointer is eltávolítható; friss pointer és más proof nem törlődik. A napló megmarad, ezért az eredeti manifest authority nem vész el, a törölt run nem tárolható újra.
- A capture saját, titkosított adatot nem tartalmazó naplót ír a fájlok előtt. Teljes fájlírás utáni megszakítás ugyanazzal az eredeti manifesttel/ciphertexttel folytatható. Tépett fájl vagy napló biztonságosan blokkol; ezt nem nevezzük automatikusan javítható megszakításnak.

A napló csak mentési metaadatot tartalmaz, nincs benne Auth-sor vagy ciphertext. Nem nyilvános: ugyanabban a védett helyi tárolóban marad. Ez nem teljes helyreállítási jogosultság vagy adatvédelmi replay-engedély. A helyi eredeti manifest törlése után a jövőbeli közös szerver/helyi operátor a megmaradó napló alapján is össze kell hogy egyeztesse az archívumhalmazt; a korábbi, kizárólag flat manifestfájlokat olvasó privát helper erre még nem alkalmas.

## Ellenőrzött és nyitott határok

Tizenkilenc [célzott Windows-eset](../tests/ops/test_local_managed_recovery.py) sikeres: pontos expiry/check, friss és idegen fájlok megőrzése, sérült friss batch, minden unlink utáni megszakítás, naplóhiba, újra beillesztett fájl, részleges capture és lejárt run feltámasztásának tiltása, pointer, pontos request és két óra. Külön valódi másik folyamat zárütközését/halál utáni feloldását és unlink utáni `os._exit` megszakításból folytatást is ellenőriztük. A Windows symlink-létrehozási ág csak akkor fut, ha a gép ezt engedi; Linuxon ezt a CI ellenőrzi. A TypeScript operátori ellenőrzés sikeres. Claude-audit, pontos CI és valódi helyi másolat törlés nélküli checkje ennél a checkpointnál még hátravan.

Ez nem fájlrendszeri tranzakció vagy általános ellenséges helyi admin elleni védelem. Windows alatt a fájl flusholt, de a Python nem biztosít hordozható directory-fsyncet; áramkimaradás utáni directory-durability nem igazolt. Az eredeti private könyvtárban a végső ellenőrzés és név szerinti unlink közti ablak megmarad. A CLI a könyvtár Windows ACL-jét a meglévő private-report eljárással állítja be; a Python önmagában nem Windows ACL-auditor. A forráskönyvtár és helper byte szerint a main commitjához kötött.

A naplók legfeljebb száz ismert runt engednek; későbbi metaadat-archiválás/pruning a szerverrel egyeztetett külön feladat. A `check` nem ír/töröl mentést vagy naplót, de a persistent lock és az összesített privát proof létrejöhet. A teljes szerveroldali megszakítási napló, összehangolt automatikus lejárat/riasztás, régi történeti és beágyazott példányok kezelése, független kulcspéldány és hosted Auth/fence/promotion továbbra nyitott. Valódi mentést most nem töröltünk; a béta és paid allowance inaktív.
