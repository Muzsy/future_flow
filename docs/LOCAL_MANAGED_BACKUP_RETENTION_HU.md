# alterward — helyi managed mentések lejárata

2026-10-10T16:52Z friss kiegészítés: [közös managed egyeztetés/naplóarchiválás](MANAGED_RETENTION_RECONCILIATION_HU.md) implementált és tényleges célpróbával ellenőrzött; a b5c23f1 pontos auditja és CI-je sikeres. Független leválasztott kulcspéldány és első sikeres külső schedule igazolt. Automatikus/történeti/ágyazott expiry és teljes hosted recovery még nincs. Az alábbi régebbi checkpointok a megjelölt korábbi forrás állapotai.

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

Az eredeti **77197467d78048b02de7ee9682c59cc49531e6df** forrás tizenkilenc [célzott Windows-esete](../tests/ops/test_local_managed_recovery.py) sikeres: pontos expiry/check, friss és idegen fájlok megőrzése, sérült friss batch, minden unlink utáni megszakítás, naplóhiba, újra beillesztett fájl, részleges capture és lejárt run feltámasztásának tiltása, pointer, pontos request és két óra. Külön valódi másik folyamat zárütközését/halál utáni feloldását és unlink utáni `os._exit` megszakításból folytatást is ellenőriztük. Mind a tizenkilenc teszt a Contabón, Linuxon is sikeres, kihagyás nélkül; a kilenc futó konténer állapota/image/restart/port és a meglévő archívumok változatlanok, szintetikus fixture eltakarítva. A Windows symlink-létrehozási ág csak akkor fut, ha a gép ezt engedi; Linuxon ténylegesen lefutott.

A 2026-10-10T15:46:01Z tényleges helyi `--check` egy teljes friss archívumot igazolt, lejárt/törölt fájl nulla. Az új zárolt read út mindkét eredeti ciphertexttel byte/hash/méret szerint egyezik. Visszafejtő kulcs/decryption/DB-írás/levél/alkalmazási AI/aktiválás nulla; a távoli check kizárólag órát olvasott. A TypeScript ellenőrzés sikeres. Az [eredeti pontos verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38064906690) végül sikeres.

## Claude-jelzések és javításuk

A 7719746 statikus Claude Cloud-audit read-only/szintetikus próbát nem blokkolt, automatikus expiry-t igen. Három low és egy info jelzést adott; egyik sem igazolt éles adatvesztés vagy adatszivárgás:

- LMR-01: a teljesen befejezett napló egy másik könyvtárba másolás után ne blokkoljon minden új mentést. A root azonosságát csak akkor követeljük, ha még van eltávolítandó fájl; a megmaradó tombstone továbbra tiltja ugyanannak a runnak az újratárolását. Félbehagyott expiry átmásolása továbbra blokkol.
- LMR-02: Python `-I` izolált indítás, kizárólag explicit abszolút eredeti `ALTERWARD_PYTHON` executable; byte-hash szerepel a privát proofban. Nincs PATH-alapú interpreterválasztás. Az interpreter teljes bináris függőségláncának attestációját ez nem állítja. Windows alatt Python 3.12 vagy újabb szükséges a `st_birthtime_ns` azonossághoz.
- LMR-03: a CLI a saját, private-report és helyi helper/validator forrásait, valamint a lockfile-t builtin műveletekkel ellenőrzi, **dinamikus import és ACL-művelet előtt**. Ezek hash-e is megmarad a proofban. A Python törlési célja ettől függetlenül fix; az audit helyi segédforrás-kötési hiányt jelzett.
- LMR-04 info: a már ismert régebbi pending pointer ellenőrzés után felülírható új capture-rel; ismeretlen/újabb/tépett pointer blokkol. A server-only capture újraletöltési operátora, nagy batch ismételt hashköltsége/timeoutja és száznaplós pruning az összehangolt futtató külön feladata.

Négy új Python-eset és egy [Node/Python izolációs célpróba](../tests/local-managed-runtime.test.ts) készült. Az utóbbi valódi gyermekfolyamatban, külön szintetikus Git-projektben ellenőrzi, hogy a munkakönyvtárba ültetett `json.py` és `PYTHONPATH` nem fut le, a runtime hash egyezik.

A javított **081f4f657a7d3df524b23d315e0c5131521e778b** pontos main forrás mind a **23 Windows- és 23 Contabo Linux-esete sikeres**, Linuxon kihagyás nélkül. A Node/Python izolációs célpróba és scripts TypeScript ellenőrzés sikeres. A Linux fixture eltakarítva, kilenc futó konténer állapota/image/restart/port változatlan. A 2026-10-10T15:56:12Z új tényleges helyi check teljes friss archívumot igazolt, lejárt/törölt nulla; `pythonIsolated=true`, eredeti runtime és ellenőrzött operátori forráshashek rögzítve. Csak távoli óraolvasás, visszafejtő kulcs/decryption/DB-írás/levél/provider/aktiválás nulla.

A pontos 081f4f6 statikus Claude-delta LMR-01/02/03 és LMR-04(a) forrásjavítását elfogadta, új konkrét finding nincs; read-only/szintetikus próba blokkolása false. Automatikus expiry blokkolása true a külön integrációs kapuk miatt, nem új adatvesztési hiba miatt. Claude nem futtatott tesztet és nem látott privát/prod adatot; a célpróbákat mi végeztük. Későbbi server-only újraletöltésnél a már végleges latest pointer visszaléptetését is külön tiltani kell; a jelenlegi capture mindig új runt készít. A [pontos javított verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38065593193) sikeres, a Linux operátori tesztekkel, typecheckkel, teljes alkalmazástesztekkel/builddel és izolált telepítési próbákkal. Az automatizálás nyitott kapuit nem tekintjük lezártnak.

## Operátori indítás

Az `ALTERWARD_PYTHON` környezeti változóban az eredeti Python 3.12+ executable abszolút útja szükséges; PATH-alapú alapérték nincs. A rögzített SSH-fájlok a meglévő protected secrets könyvtárban maradnak; virtualizált Windows-profil esetén az eredeti mappa az `ALTERWARD_SSH_SECRETS_DIR` változóval választható, kulcsmásolás nélkül. A projekt gyökeréből a törlés nélküli indítás:

```powershell
pnpm exec tsx --env-file-if-exists=.env scripts/supabase-managed-local-expiry.mts --check
```

A `--apply` kézi mód implementált és szintetikus adatokon tesztelt. Éles expiry vagy scheduler bekötése előtt a szerver/helyi metadata-aware egyeztetést és teljes megszakítási eljárást le kell zárni; ezt a checkpointot nem tekintjük ilyen bekötésnek.

Ez nem fájlrendszeri tranzakció vagy általános ellenséges helyi admin elleni védelem. Windows alatt a fájl flusholt, de a Python nem biztosít hordozható directory-fsyncet; áramkimaradás utáni directory-durability nem igazolt. Az eredeti private könyvtárban a végső ellenőrzés és név szerinti unlink közti ablak megmarad. A CLI a könyvtár Windows ACL-jét a meglévő private-report eljárással állítja be; a Python önmagában nem Windows ACL-auditor. A forráskönyvtár és helper byte szerint a main commitjához kötött.

A naplók legfeljebb száz ismert runt engednek; későbbi metaadat-archiválás/pruning a szerverrel egyeztetett külön feladat. A `check` nem ír/töröl mentést vagy naplót, de a persistent lock és az összesített privát proof létrejöhet. A teljes szerveroldali megszakítási napló, összehangolt automatikus lejárat/riasztás, régi történeti és beágyazott példányok kezelése, független kulcspéldány és hosted Auth/fence/promotion továbbra nyitott. Valódi mentést most nem töröltünk; a béta és paid allowance inaktív.
