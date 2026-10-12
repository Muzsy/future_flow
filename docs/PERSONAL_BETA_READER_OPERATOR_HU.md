# alterward — naplózott, költés nélküli olvasói belépés

2026-10-11 · [Aktiválási sorrend](PERSONAL_BETA_ACTIVATION_PLAN_HU.md) · [Teljes audit](PERSONAL_BETA_FINAL_AUDIT_HU.md).

A [külön operátor](../scripts/contabo-personal-beta-readers.mjs) és [szerveroldali tranzakció](../scripts/ops/contabo-personal-beta-readers.py) az első valós belépést készíti elő. Csak a web és API név szerinti origin-emaillistája változhat, legfeljebb tíz kiválasztott címre a tulajdonos mellett. UUID, providerkulcs, AI-keret, időszak, indulási flag, image, CA, hálózat és Shared nem módosul. Meghívót nem küld és a Cloudflare-ben nem hoz létre hozzáférést.

Az `inspect` csak ellenőriz. A `prepare-readers` friss, teljes Cloudflare-readbacket kér: a korábbi metadata mezői közül kizárólag a pontos kiválasztott emailek és az ellenőrzés időpontja térhet el. A külön, védett helyi kérés az `readers` és `readerAccess` két mezőt tartalmazza. Valódi címlista és a Cloudflare-módosításra szóló konkrét utasítás nélkül ezt nem futtatjuk. A candidate a hash-ellenőrzött aktuális owner-fájlokból készül; teljes policy-egyezés, frozen Compose roundtrip és tartós, fsyncelt eredeti/candidate fájlok szükségesek. A serving állapot nem változik előkészítéskor.

Az `apply-readers` ugyanahhoz a commitra szóló értékelt, súlyos finding nélküli audithoz, pontos verify/container CI-hez és elkülönített célpróbához kötött. A telepített, hash-ellenőrzött napi eszköz olvasói archívumszabálya is kötelező. A meglévő napi/aktiválási lockokat ebben a sorrendben foglalja. Naplózott intent után saját szolgáltatás-stop, friss read-only TLS queue/lease/idegen session ellenőrzés, ugyanazon image indítása, erőforrás/origin/idegen konténer ellenőrzés és négy fájl promotion következik. Bármely hiba az eredeti nulla állapotra áll vissza; ismételt vagy driftelt apply külön vizsgálat nélkül tiltott.

Az explicit `disable` először a név és project-label alapján behatárolt saját konténereket állítja le. A sérült candidate és az esetleges provideradat nem előfeltétele. Csak a külön megőrzött, forrással/CA-val/owner-receipttel ellenőrzött nulla baseline indítható újra. Sikertelen eredeti ellenőrzésnél a saját szolgáltatások zárva maradnak. Az upstream Cloudflare-listát ez sem szerkeszti: a tulajdonosra visszaszűkített origin már elutasítja a többi címet, az Access visszavonása és a külső readback külön szükséges. A naplókat nem töröljük új próbálkozás vagy későbbi költségidőszak indítása céljából.

A napi mentés kötött fájllistával az olvasói candidate-et, eredeti konfigurációt, selectiont, receipteket és naplót is titkosítja; részleges előkészítést is megőriz, ismeretlen fájlt, könyvtárat, symlinket, hardlinket vagy nyilvános jogosultságot elutasít. Ezt a napi eszközváltozatot tényleges alkalmazás előtt külön ellenőrizni és telepíteni kell.

A [fizikai fixture](../scripts/ops/contabo-personal-beta-readers-fixture.py) három ártalmatlan node-processzel, belső hálózattal és mesterséges fájlokkal vizsgálja a tényleges Docker/Compose/fájl/journal váltást, sérült candidate utáni emergency restore-t és post-check hibából rollbacket. DB/source-render/proxy discovery itt kifejezett fixture-helyettesítés; ez nem valódi Auth-, Cloudflare- vagy adatbázis-TLS próba. A tényleges szolgáltatás-/fájlpróba még futtatandó; az API olvasói és idegen legacy-job határának kilenc valódi HTTP-regressziója külön bizonyíték.

Helyben tíz tranzakció/byte-contract és hét Node registry/receipt/CI-eset sikeres. A négy POSIX archive-eset Windows alatt kihagyott; pontos Linux CI/célpróba szükséges. Az olvasói operátor még nem aktivált személyt. A fizetett M-1 rész — friss Auth/application UUID-egyeztetés, a seed-ablak pontos megkülönböztetése, egyszeri harmincnapos funded-journal, worker-only kulcs, új konfiguráció és annak hibaútja — továbbra következő fejlesztési kapu. A már mért seed-leltár nem held-aktiválási bizonyíték.

Ha a távoli apply sikerül, de a helyi aktív receipt írása megszakad, az ellenőrzés biztonságosan elutasít. A szervernapló és tényleges manifest egyeztetésével kell a receipteket helyreállítani; régi prepare-t vagy aktív receiptet vakon felülírni és apply-t újraindítani tilos.

## A 23109be audit utáni javítások és tényleges próba

A Claude Cloud 123. válasza egy közepes és öt alacsony findingot talált. A közepes szülőkönyvtár-jogosultsági hibát a 16c61cc javította; ezzel az elkülönített Contabo-próba sikeres lett: tényleges olvasói promotion, sérült candidate utáni nulla-visszaállás, kikényszerített post-check hiba rollbackje és teljes fixture-takarítás. A szolgáltatás-/fájlhatárra érvényes; valódi Auth-, Cloudflare- és DB-próba továbbra külön kapu.

Az eredeti helyi nulla receipt most kizárólag egyszer, exclusive és fsyncelt írással hozható létre. Csak bájttartalmilag azonos adatok újrahasználata engedett; egy már olvasói stage nem lehet nulla baseline. Az emergency eredeti flagjeit az eredeti image forráscommitja szolgáltatja, nem egy későbbi HEAD. Ha az előkészítés még az eredeti szerverreceipt mentése előtt megállt, a disable nem állítja le a változatlan owner-oldalt. Meglévő, akár sérült eredeti receipt esetén megmarad a stop-first viselkedés.

A félbeszakadt journal-csere legfeljebb nyolc, pontos `.upgrade-[a-z0-9_]{8}` nevű, root/private/regular átmeneti fájlját a mentés bizonyítékként megőrzi. Ezek nem újraindítási vagy jogosultsági authority fájlok. Idegen vagy nem megfelelő jogosultságú fájl továbbra tiltott. Új POSIX-regresszió vizsgálja a valódi prepare fájlkezelését 022 umask mellett, a durable create/replace/link-refusal és a lock-várakozás határát.

A disable legfeljebb 30 másodpercet vár egy-egy meglévő lockra. Nem kerülheti meg egy futó mentés vagy konfigurációváltás lockját. Ha ezután is foglalt, nincs párhuzamos módosítás: sürgős esetben az operátor a név/project-label alapján behatárolt saját három szolgáltatást kézzel leállítja, majd a lock birtokosának és a naplóknak az ellenőrzése után folytatja a nulla baseline visszaállítását. Lockot vagy naplót törölni tilos. Ez operátori hibaút, nem automatikusan igazolt visszaállítás.

Ezeket a javításokat új, pontos commitra szóló CI, Claude-forrásaudit és célpróba ellenőrzi a telepítés előtt. Valódi olvasói hozzáférés még nem lett alkalmazva. Image-upgrade előtt aktív olvasókat disable-lel a nulla owner-állapotra kell visszaállítani; az olvasói állapot nem jogosítja fel az image-only upgrade eszközt.

A root fájlkezelési négy teszt a CI-ben külön root-folyamatban is lefut, kihagyást nem fogad el. Nem kap hálózati, szolgáltatási vagy credentialadatot, kizárólag saját átmeneti könyvtárát és tesztelt lockadapterét használja. A nem root általános tesztkör ezt a négy esetet kifejezetten kihagyja; a külön lépés és a tényleges Contabo 52-es fájl/archívum/installer próbája adja a szükséges bizonyítékot.

Egy előkészítési/aktiválási ciklus továbbra is egyszeri: az alkalmazott (journalos) állapotra, az új image alatti ismételt előkészítésre és az automatikus archiválásra nincs támogatás, a disable megőrzi a naplót és az eredeti nulla receiptet. Egyetlen kivétel van: a **lejárt és soha nem alkalmazott** előkészítés explicit archiválása (lásd az [alábbi szakaszt](#lejárt-alkalmazatlan-előkészítés-archiválása)), amely után új normál ciklus indulhat. A guard elutasítását az előzmények törlésével vagy átnevezésével továbbra sem oldjuk fel.

Az első helyi receipt írását megszakító géphibánál részleges, nem parse-olható fájl maradhat. A program ekkor sem jutott el a távoli előkészítésig. Javítás előtt az inspect és a szerver tényleges manifestje alapján ellenőrizni kell az image-only nulla állapotot és a szerveroldali reader-state hiányát; csak ezek egyezése után helyezhető külön védett karanténfájlba a hibás helyi példány és készíthető új eredeti receipt. Ha a szerveroldali előkészítés már létezik, kizárólag annak megőrzött original/stage és original/manifest adataiból, az eredeti build/CA/Access ellenőrzésével egyeztethető a helyi receipt. Az aktuális olvasói stage másolása nulla baseline-ként tilos. Ez dokumentált kézi helyreállítás, automatikus javítást nem állítunk.

## 2026-10-11 17:15 UTC — ellenőrzött és telepített előkészítés

72da446 pontos audit/CI, 52 Linux eset, három tényleges inert váltási hibaút, telepített Daily-archívumszabály és friss capture/offsite restore sikeres. A server inspect az eredeti, három szolgáltatásos owner-állapotot és reader-state hiányát igazolta. Ez az eszköz technikai előkészítésének bizonyítéka; címlista, tényleges Cloudflare-readback, meghívók és Auth-párok hiányában valódi prepare/apply nem történt. Az első valódi prepare után az eredeti és candidate reader-fájlokat tartalmazó napi mentést és helyi offsite restore-t is ellenőrizni kell az apply előtt; a jelenlegi 55 fájlos owner-restore ezt nem állítja.

## Lejárt, alkalmazatlan előkészítés archiválása

**Állapot: a fejlesztés review-ra kész, éles telepítés és alkalmazás NEM történt.** A production-állapotot (egy lejárt, alkalmazatlan candidate a szerveren) a javítás nem érinti, amíg a pontos commit audit/CI/célpróbája, a daily eszköz frissítése és az alábbi külön kiadási lépések meg nem történnek.

### Miért kell

Az `apply-readers` csak legfeljebb 900 másodperces (`READER_PREPARATION_SECONDS`) előkészítést fogad el, új `prepare-readers` viszont meglévő előkészítési állapot mellett elutasít. Lejárt, alkalmazatlan candidate mellett ezért egyik kapu sem vezet tovább. A `disable` stop-first és az állapotot megőrzi, ezért nem megoldás. Az új mód a lejárt állapotot törlés nélkül, ellenőrizhető archívumba helyezi.

### Mód: `--archive-expired-readers`

A név a meglévő `prepare-readers`/`apply-readers` stílusát követi, a szerveroldali mód neve `archive-expired-readers`. Csak explicit kérésre fut, hiba után sosem fut implicit. Ugyanazt az audit/fixture/CI kaput kéri, mint a prepare/apply, a fixture proofnak ezen felül `expiredPreparationArchivePassed: true` kell. Az eredeti nulla receipt (`personal-beta-readers-zero-proof.json`) változatlan marad. Szerveroldali végrehajtása a meglévő napi és aktiválási lockokat ugyanabban a sorrendben, várakozás nélkül foglalja.

Elfogadási feltételek, mind fail-closed:

1. **Pontosan egy teljes, alkalmazatlan előkészítés**: a `personal-beta-readers` könyvtár neve, tartalma és `original/` alkönyvtára a szerződés szerinti hét + hat fájl. Journal, részleges promotion, `.upgrade-*` ideiglenes fájl, ismeretlen név, symlink, hardlink, nem root-tulajdonú vagy nem 0600/0700 elem esetén elutasít. A journal hiánya önmagában nem bizonyíték: az egész fa szerkezetét ellenőrizzük.
2. **Pontos prepared receipt**: a szerveren lévő `prepared.json` sémája (kulcskészlet, hash-ek, 40 hexa commit), kanonikus bájtjai és a kérésben kapott helyi `preparedProof` megegyeznek; a candidate, original, `readers.json` és `access.json` hash-ek egyeznek.
3. **Lejárat**: a `preparedAt` pontos UTC alakú (`+00:00`), nem jövőbeli, és a szerver órájához képest **szigorúan több mint 900 másodperces**. A 900 s-os apply kapu változatlan; 900 s-nál az apply még elfogadná, ezért az archiválás nem. A `prepared.json` fájlidejének legfeljebb 300 s-ra kell esnie a `preparedAt`-tól, és nem lehet a szerverórához képest jövőbeli (óraeltérés ellen).
4. **Serving = eredeti nulla**: az `original/` bájtjai az eredeti build/CA/Access/owner-receipt ellenőrzésen átmennek (`zero_baseline`), a serving fájlok ezekkel azonosak, nincs `personal-beta` (funded) állapot, a három futó saját szolgáltatás az eredeti image/konfiguráció, és a runtime policy `owner` módú.
5. **Konténerek érintetlenek**: a mód nem indít, nem állít le és nem restore-ol szolgáltatást, nem ír éles adatbázist, nem hív providert és nem módosít Access policyt. A saját és idegen konténer-állapot a mozgatás előtt és után azonos kell legyen.

### Adatmodell és megőrzés

Az archiválás nem másol és nem töröl: a `personal-beta-readers` könyvtárat atomikusan átnevezi (`rename`, ugyanazon fájlrendszeren) a `personal-beta-readers-archive/<archiveId>/state` alá, így a bájtok, hash-ek, jogosultságok és időbélyegek megmaradnak. Az `archiveId` determinisztikus: `expired-<preparedAt UTC>-<a prepared receipt SHA-256 első 16 hexa karaktere>`.

Egy archívum három része: `intent.json` (a mozgatás előtt, fsyncelve, a fájlok teljes hash-listájával, a prepared és az archiváló commit külön rögzítésével), `state/` (az átnevezett, érintetlen előkészítés) és `complete.json` (a mozgatás utáni ellenőrzés és fsync után). Az archívum nem authority: az `apply` kizárólag az aktív útvonalat olvassa, és pontosan megegyező `preparedProof`-ot és commitot kér.

**Provenance**: a régi `preparedAt` és `sourceCommit` változatlan marad az archivált `prepared.json`-ban. Az archiváló eszköz új commitja csak az `intent.json` `archiverSourceCommit` mezőjébe kerül, így az új commit a régi bizonyítékot nem írja át. Az archiválás nem követeli meg, hogy a prepared commit megegyezzen az archiválóéval (az apply igen).

**Megőrzés**: az archívum nem évül és nem törlődik. A napi eszköz legfeljebb 8 archívumot fogad el (ez korlát, nem megőrzési idő); ennél több, ismeretlen név vagy megtévesztő útvonal esetén a napi capture fail-closed hibázik, amíg külön felülvizsgált szabály nem készül. Új megőrzési idő nincs kitalálva. A `disable`: archivált állapot mellett nincs aktív előkészítés, ezért a `disable` a szolgáltatások érintése előtt elutasít (`No prepared original reader receipt`), a nulla baseline marad a serving állapot.

### Megszakítás és egyeztetés

A sorrend: archive-root/könyvtár létrehozás → `intent.json` (fsync) → atomikus átnevezés (a szignálok ekkor tiltottak) → könyvtár-fsync → bájt-ellenőrzés és konténer-állapot összevetés → `complete.json` (fsync). Új `prepare` csak akkor indulhat, ha **minden** archívum befejezett (`complete.json`) és bájtjai az `intent.json` szerint ellenőrzöttek; hiányos vagy sérült archívum mellett elutasít.

| Megszakadás helye | Állapot | Teendő |
|---|---|---|
| intent előtt/után, átnevezés előtt | aktív előkészítés + üres vagy csak intentes archívum | ugyanaz a mód újra; a rögzített intentet használja, nem írja át |
| átnevezés után, `complete.json` előtt | nincs aktív előkészítés; archívum `intent.json` + `state/` | ugyanaz a mód újra: ha a helyi prepare-proof még az aktív helyén van, argumentum nélkül; ha a helyi lépés már áthelyezte, `--archive-expired-readers <archiveId>` (lásd alább). Ellenőrzi a bájtokat, majd befejezi |
| befejezés után ismételt futtatás | kész archívum | `alreadyArchived: true`, semmit nem ír |
| aktív előkészítés újra megjelenik kész archívum mellett | ütközés | elutasít, kézi felülvizsgálat |
| másik hiányos archívum | bizonytalan állapot | elutasít |
| konténer-állapot változott a mozgatás közben | archívum befejezetlen marad | `prepare` blokkolva; külön vizsgálat |

A helyi loader az `--archive-expired-readers` sikere után a megfelelő `personal-beta-readers-prepare-proof.json`-t a `.local/reader-preparation-archive/<archiveId>/` védett könyvtárba mozgatja (`prepare-proof.json`), és mellé írja az `archive-proof.json`-t (kizárólagos írás, fsync). **Retry (RRA-01 javítás):** a loader az archiválás bemenetét kizárólag a `resolveArchivePreparedProof` feloldással kapja. Ha az aktív prepare-proof megvan (a helyi áthelyezés előtti megszakadás), azt használja; az opcionális `<archiveId>` ilyenkor csak egyezést ellenőriz. Ha az aktív proof már nincs ott (a helyi áthelyezés után megszakadt a futás, vagy elveszett a kimenet), **kötelező a pontos archiveId**: `node scripts/contabo-personal-beta-readers.mjs --archive-expired-readers <archiveId>`. Az azonosító a megszakadt futás kimenetéből, a `.local/reader-preparation-archive/` mappanevéből vagy a szerver `personal-beta-readers-archive/` könyvtárából olvasható. A feloldás az `archive-proof.json` és az archivált `prepare-proof.json` alapján csak akkor fogad el, ha az azonosító a receipt kanonikus hash-éből újraszámolva egyezik, az archive-proof kész (`archived: true`) és hash-e egyezik, a receipt egy privát, egy hardlinkes, korlátos szabályos fájl (nem symlink), és a `previousManifestSha256` az aktív owner receipttel egyezik. Archiveid nélkül, több archívum mellett, sérült, aliasolt vagy nem egyező receipt esetén, illetve ha az aktív és az archivált példány egyszerre létezik, a loader fail-closed marad; sosem választ „legutóbbit” és sosem másol vissza az aktív útvonalra. A szerver ezután `alreadyArchived`-et válaszol, és a helyi lépés idempotensen befejeződik. A helyi `prepare-readers` addig elutasít, amíg régi prepare-proof van a `.local/contabo-release` alatt. Az eredeti nulla receipt és az owner proofok változatlanok. Régi zero/prepare/apply proof így nem lehet új ciklus aktuális authorityja.

Ha a szerveroldali archiválás kész, de a helyi prepare-proof hiányzik vagy nem olvasható, a loader nem tud biztonságosan egyeztetni, és nem is próbálkozik vakon. Ilyenkor a szerveren az archívum érvényes (`complete.json`, hash-ellenőrzött `state/`), a helyi egyeztetés dokumentált kézi lépés: a hibás helyi példány külön védett karanténba kerül, a pontos `preparedProof` az archivált `prepared.json`-ból ellenőrizhető, és új helyi receipt nem hozható létre találgatással. Az eredeti nulla receipt ekkor is érintetlen marad.

### Napi mentés és restore

Az archívum fájllistáját a telepített napi eszköz `READER_PREPARATION_ARCHIVE_POLICY_VERSION = 1` szabálya fogja fel (külön verzió, a funded operátor `READER_ARCHIVE_POLICY_VERSION`/`PERSONAL_ARCHIVE_POLICY_VERSION` értéke és ellenőrzése változatlan). Pontos lista: `intent.json`, `complete.json`, `state/` alatt a hét előkészítési fájl, `state/original/` alatt a hat eredeti fájl; mind root-tulajdonú, 0600, egy hardlinkes, a könyvtárak 0700. A reader eszköz `prepare`, `apply` és `archive` módban ezt a verziót is megköveteli, így archívum nem kerülhet ki a titkosított mentésből. Az archivált fájlok hash-ei bekerülnek a backup manifest `configFiles` listájába, és az izolált restore proof a teljes listát ellenőrzi.

### Teljes menet új ciklushoz (implementált parancsok)

Egyszeri kiadási lépések (külön engedély és bizonyítékok után, nem része ennek a fejlesztésnek): a javítás merge-e; az új pontos commitra értékelt audit, Verify/Container CI és izolált Linux/root célpróba; a Windows operátori main erre állítása; új audit- és fixture-proof (`expiredPreparationArchivePassed`); majd a napi eszköz frissítése `node scripts/contabo-daily.mjs --update`-tel, hogy a szerver telepítse az új archívumszabályt. Ezután:

```powershell
node scripts/contabo-personal-beta-readers.mjs --inspect
node scripts/contabo-personal-beta-readers.mjs --archive-expired-readers
node scripts/contabo-personal-beta-readers.mjs --inspect
```

Az archiválás sikere után, **egy 15 percen belüli, egyben futtatott menetben**: friss kulcsmentes Cloudflare-readback és új, védett selection; majd

```powershell
node scripts/contabo-personal-beta-readers.mjs --prepare-readers .local/personal-beta-operator/readers.json
node scripts/contabo-daily.mjs --backup
node scripts/contabo-daily.mjs --sync
node scripts/contabo-daily.mjs --restore-latest
node scripts/contabo-personal-beta-readers.mjs --apply-readers
node scripts/contabo-personal-beta-readers.mjs --inspect
node scripts/contabo-daily.mjs --monitor
```

Az `--apply-readers` helyi kapuja ellenőrzi, hogy a legutóbbi restore proof **ennek az előkészítésnek** a mentésére vonatkozik: azonos `runId`, a backup a prepare után készült, a restore a backup után, a manifest `configFiles` hash-ei megegyeznek a most előkészített original/candidate fájlokkal, `readers.json`-nal, `access.json`-nal és a `prepared.json` kanonikus hash-ével, a restore-számok (fájl, tábla, sor, ciphertext) egyeznek, és még a 900 másodperces ablakon belül vagyunk. Régi candidate vagy régi restore proof így nem használható; a szerver a végső 900 s-os kaput változatlanul érvényesíti.

A hibás helyi kapuk statikus, titokmentes okot írnak (`Reader operation refused: …`); a távoli hibák a korábbiak szerint általános üzenettel zárnak, ezek okát a szerver journalja és a védett proof adja.

### Ismert nyitott üzemeltetési észrevétel (nem része a javításnak)

A 2026-10-12-i első backup-kísérlet `proxy-config-capture` fázisban bukott el, amikor a Caddy `issue_cert_*.lock` fájljai folyamatosan változtak (a mérés szerint 4 másodpercenként 2–5 fájl); a második kísérlet lefutott. A feltételezett ok (a mentés kétszeres beolvasásának versenye a Caddy lockfájlokkal) nem bizonyított. Caddy-t, `smartflowdigest.com` domaint, DNS-t vagy idegen alkalmazást ez a javítás nem módosít; külön üzemeltetési feladat.
