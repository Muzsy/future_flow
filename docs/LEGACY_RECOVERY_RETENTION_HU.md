# alterward — régi és JSON-ba ágyazott mentések lejárata

2026-10-10 · [Managed retention](MANAGED_RETENTION_RECONCILIATION_HU.md) · [Helyreállítási leltár](SUPABASE_RECOVERY_COVERAGE_HU.md).

## Pontos hatókör és időhatár

A [külön végrehajtó](../scripts/ops/legacy-recovery-retention.py) a három régi, már hash-ellenőrzött operátori mentést kezeli a szerver `backups` könyvtárában: összesen négy ciphertext, három manifest és három eredeti archívumkönyvtár. A kapcsolódó helyi hatókör a `contabo-release` négy külön ciphertextje és négy, név szerint rögzített JSON-fájl egy-egy gyökérmezője. A napi alkalmazásmentés és az Auth/Storage managed mentés saját külön életciklusban marad.

A három eredeti manifestből hiányzik a pontos capture-idő. Az új szabály ezért **az eredeti UTC run-start plusz hét nap**, kifejezetten konzervatív történeti időhatár. Nem állítjuk, hogy ez a capture pontos ideje, nem használunk mtime-ot, és az enrollment nem indít új hét napot. Az első határ 2026-10-15 21:36:21 UTC (23:36:21 magyar idő szerint); a másik kettő 2026-10-16 07:36:48 és 21:18:39 UTC. A korábban jóváhagyott hétnapos megőrzéshez így nem kerül hozzá a már eltelt idő. Friss, ellenőrzött napi és managed példány külön megmarad; az aktuális konfiguráció és adatmentés nem erre a történeti példányra támaszkodik kizárólag.

## Ellenőrzött művelet

A [Windows-operátor](../scripts/legacy-recovery-retention.mts) saját kódját és minden helperét a pontos Git-commithoz köti, majd kizárólag egyező, védett helyi/szerveres read-only leltárból állítja elő a véges enrollmentet. A run/scope/időhatár és ciphertext/manifest hash/méret kapcsolat ellenőrzött; pontosan három run, nyolc helyi példány, köztük négy JSON-mező szükséges. A szerveres eredeti manifest saját scope/run/schema és ciphertext-hash adatait a végrehajtó is ellenőrzi.

Az enrollment tartós, külön privát metadata; nem ment újra ciphertextet és nem írja felül a meglévő eltérő enrollmentet. A helyi és szerveres szabályok digestje az apply előtt egyezik. A két UTC óra friss, legfeljebb öt perccel térhet el; a korábbi dönti el a lejáratot. Az eredeti root/könyvtár/fájl azonosság és a teljes friss/lejárt batch ellenőrzése megelőzi az első módosítást.

Minden lejárt run eredeti deletion-intentje tartósan kiíródik az első unlink vagy JSON-csere előtt. A ciphertext után a manifest, végül kizárólag az eredeti üres könyvtár törölhető; nincs rekurzív eltávolítás. A JSON-fájlból csak az előre bejegyzett ciphertext-mező tűnik el, a többi JSON-érték megmarad. A módosított privát tempfájl flush/fsync után, az eredeti hash/azonosság ismételt ellenőrzésével kerül atomikus cserére. Az intent eredeti és módosított hashéből a csere utáni megszakítás is felismerhető. A napló nem tárolja a ciphertextet vagy a JSON többi privát értékét.

Hiányzó eredeti fájl csak lejárt, sértetlen eredeti intenttel folytatható. Újrateremtett ciphertext, megváltozott JSON, torn/idegen intent, új targetbejegyzés vagy más root megállítja a teljes futást. Az operátor nem törli a naplót „javításként”. A megszakításkezelés a managed [kézi recovery-szabályait](MANAGED_RETENTION_RECONCILIATION_HU.md#megszakítás-és-sérült-metadata-kezelése) követi: eredeti ellenőrzött metadata, read-only leltár, majd kontrollált folytatás; hiányzó hiteles eredeti esetén zárt állapot.

## Bizonyíték és aktuális állapot

A **2caa20f** új forrás tizenöt [szintetikus regressziója](../tests/ops/test_legacy_retention.py) Windows alatt és tizenöt tényleges Linux-célpróbája is sikeres, kihagyás nélkül; typecheck sikeres. Friss/boundary, JSON-csere előtti/utáni megszakítás, félbemaradt unlink/üres könyvtár, tartós intent-hiba, torn napló, megváltozott JSON, resurrection, eltérő enrollment, scope/útvonal/mező és peer-clock elutasítása ellenőrzött. A tényleges célpróba kizárólag szintetikus fixture volt; eltakarítva, a kilenc futó konténer teljes állapota/image/restart/port változatlan. Valódi cipher törlése, DB-írás, levél, AI és aktiválás nulla.

A 2026-10-10-i friss olvasási leltár továbbra 16 szerveres ciphertextet és 20 helyi példányt igazolt; négy JSON-ba ágyazott másolat, ismeretlen/unmatched nulla. Ez három meghatározott operátori könyvtár leltára, nem minden helyi személyes adat teljes vizsgálata.

**A valódi enrollment, külön check és apply sikeres 2026-10-10 20:00–20:01 UTC között:** szerver három run/hét target, helyben három run/nyolc target; egyező szabálydigest, lejárt run és tényleges törlés nulla. A nyilvántartás a valódi fájlméreteket, jogosultságokat, manifestformátumot, négy beágyazott mezőt és a két órát is elfogadta. A pontos [2caa20f CI](https://github.com/Muzsy/future_flow/actions/runs/38081559761) verify/container sikeres. A Claude statikus audit nem talált konkrét hatókör- vagy destruktív hibát; a helyi metadata-könyvtár létrehozására tett észrevételét a helper elolvasása után visszavonta. A valódi lejárati törlést ez a nulla lejárt runos próba nem igazolja: azt a szintetikus megszakításos próbák fedik, az első valódi határ október 15.

**Az ütemezett futás még kapu.** Az audit alacsony súlyosságú, útvonalalapú műveleti versenyablakot és sérült intent esetén kézi helyreállítás szükségét jelölte; a jelenlegi változat egyszeri, felügyelt operátori futásra készült. Automatizálás, tartós hibajelzés és napi/managed életciklus-egyeztetés külön lépés. Apply előtt függetlenül ellenőrizni kell a friss aktuális napi és managed mentést: ezt a kód jelenleg nem teszi meg automatikusan. A JSON újraszerializálása megőrzi a többi értéket, a fájl bájtjai és hash-e változik. Windows alatt fájl-fsync van, könyvtár-entry power-loss tartósság nincs külön igazolva. Ez a szelet nem zárja le a hosted Auth/fence/promotion vagy a teljes bétaindítás kapuját.
