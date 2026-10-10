# alterward — összehangolt managed mentéskezelés

2026-10-10 · [Kiadási sorrend](NEXT_STEPS.md) · [Szerveres lejárat](MANAGED_BACKUP_RETENTION_HU.md) · [Helyi lejárat](LOCAL_MANAGED_BACKUP_RETENTION_HU.md).

A [közös operátori futtató](../scripts/supabase-managed-retention.mts) a szerver és a helyi gép teljes, projektkötött managed jegyzékét egyezteti. Kizárólag a külön Auth/Storage-adatmentés két ciphertextje és manifestje a hatásköre. A napi alkalmazásmentések, régi archívumok és JSON-ba ágyazott ciphertext-másolatok külön feladatok.

## Megvalósított viselkedés

- `--check`: olvasási leltár; a friss szerveres, helyben hiányzó példányokat megszámolja. Nem tölti le vagy törli a mentést.
- `--sync`: a hiányzó friss példányt védett SSH-csatornán, egyenként letölti; a helyi író ismét ellenőrzi a ciphertext méretét/hashét. A már későbbi mentésre mutató latest pointert egy régebbi példány letöltése nem állítja vissza.
- `--apply`: előbb egyeztetés és teljes ellenőrzés, majd külön naplózott helyi és szerveres lejárat. Egy megszakítás után az eredeti manifestek a megmaradó metadata-naplókban elérhetők; hiányzó eredeti fájl folytatható, újrateremtett/lecserélt fájl nem kap törlési jogot.
- Lejárt szerveres példány ciphertextjét nem tölti le. A teljesen ellenőrzött szerveres manifestet önálló helyi metadata-bejegyzésként megőrzi, hogy a szerveroldali lejárat egyeztethető maradjon.
- A kétoldalt igazoltan befejezett törlések eredeti naplói külön metadata-archívumba kerülnek. A tartós másolat megelőzi az aktív napló törlését, a tombstone megmarad; nem teremtjük újra a lejárt ciphertextet. Egy félbeszakadt naplóarchiválást mindkét oldalon tud folytatni, és egy új helyi gépre húszas metadata-batchekben pótolja a történetet.
- A szerver és a helyi gép manifesteltérése, idegen/torn bejegyzés vagy menet közben megváltozott jegyzék megállítja a műveletet. Ez biztonságos megállás, nem automatikus sérülésjavítás.

A törléshez eredeti célkönyvtár és fájlazonosság, pontos projekt/scope, hét napos UTC lejárat és két friss, legfeljebb öt perccel eltérő óra szükséges. A teljes friss és lejárt batch ellenőrzése megelőzi az első unlinket. A szerver tartós deletion-intent naplója a fájl és mindkét szülőkönyvtár fsyncjével megelőzi az első törlést; a ciphertext után a manifest, végül az üres archívumkönyvtár tűnik el. Nincs rekurzív törlés. A helyi lejárat teljes újrahash-elése három batch-ellenőrzésre korlátozott, majd közvetlen fájlonkénti ellenőrzés történik: nem nő négyzetesen a lejárt példányok számával.

Az eszköz minden forrását és függő helperét a pontos Git-commit ellenőrzi import/ACL-módosítás előtt. A helyi Python kötelező eredeti abszolút executable, `-I` izolációval és binárishash-bizonyítékkal. A távoli Python is izolált. Archívum/kulcs nem kerül shell argumentumba vagy nyers hibakimenetbe; ciphertext csak belső csatornán mozog. Age-kulcsot, adatbázist, SMTP-t vagy AI-szolgáltatót a futtató nem használ, béta-jogot nem aktivál.

## Bizonyíték és hátralévő kapuk

A c12ae7e szerveres naplószelet tényleges Contabo-próbáján 21 szerveres és 23 helyi eset sikeres, kihagyás nélkül; a kilenc futó konténer teljes állapota/image/port/restart változatlan. A Claude forrásaudit scope/frissességi hibát nem talált; a proof-mező és fsync/többnaplós/alteráltnaplós tesztek pontosítását kérte. Az e50be94 audit ezeket elfogadta; a megmaradó byte-cap/metadata-provenance/orchestration jelzéseket a következő szelet kezeli.

A **b5c23f1** javított forrás **62 tényleges Linux-célpróbája** sikeres, kihagyás nélkül; szintetikus fixture eltakarítva, kilenc futó konténer teljes állapota/image/port/restart változatlan. Windows alatt 67 kapcsolódó Python-esetből 47 sikeres és húsz Linux-specifikus kihagyás; tíz közös orchestration-próba és egy tényleges Python-izolációs próba sikeres, scripts typecheck sikeres. A 101 befejezett capture archiválása után új friss mentés tárolható; az aktív százrunos korlát nem telik meg a régi tombstone-októl. A még jelen lévő ciphertext byte-ja számít az 512 MiB limitbe; a metadata-only tombstone deklarált mérete nulla tényleges fájlnál nem fogyasztja ezt a keretet.

A 2026-10-10T16:51–16:52Z tényleges `check`, `sync` és `apply` mind sikeres: szerver/helyi eredeti jegyzék egy-egy run, friss komplett egy, hiányzó helyi nulla, lejárt/törölt nulla, egyezés true, metadata-only server-attestation nulla. Kulcsolvasás/decryption/DB-írás/levél/alkalmazási AI/aktiválás nulla. A javított helper változatlan byte-jaival a 6c7893e checkpoint 17:18Z `check/sync` újrafutása is teljes egyezést és nulla törlést igazolt. A [b5c23f1 teljes verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38070377455) sikeres; a Claude pontos delta visszaellenőrzése új forráshibát nem talált.

Az operátori logika [külön, pontos forrással kötött modulban](../scripts/lib/managed-retention.ts) ellenőrizhető. A [tíz mock-operátori próba](../tests/managed-retention-orchestration.test.ts) eltérő/menet közben változó jegyzékre, hiányzó friss másolatra, kétoldali archiválási megszakításra, részleges helyi expiryre, utólagos jegyzékeltérésre és a helyi expiry utáni szerverhibára vonatkozik; a fizikai fájl/napló/hash/törlés szabályait a külön [valódi helperpróbák](../tests/ops/test_managed_reconciliation.py) ellenőrzik. A CLI saját kontrollált incidensproofot ír. Az első helyi apply megkezdésétől minden későbbi hibánál igaz a „helyi törlés történhetett” jelzés; korábbi általános hibánál az állapot ismeretlen, nem hamis. Az ismétlés az eredeti metadata-naplókból folytatható.

A 40c74c5 audit R1 elavult pointerét, R2 félreérthető hibajelzését és R3 clock-boundary attestationjét a b5c23f1 javította. A pointer csak teljesen lejárt, kétoldalt nyugtázott run esetén, ellenőrzött azonossággal, a naplók archiválása előtt törlődik. Az attestation is a két friss óra közül a korábbit használja. Az R4 bootstrap minden húszas batch előtt új peer-órát és változatlan eredeti archívummetadata-t kér; 23 rekorddal tesztelt. A határok skálázhatósági korlátok maradnak, nem végtelen archívum ígérete. Claude statikus forrásellenőrzést végzett; a tényleges célpróbák és CI külön Codex-bizonyítékok.

## Megszakítás és sérült metadata kezelése

1. Az operátor megállítja az érintett helyi és szerveres retention-futtatást, majd kizárólag `check`/olvasási leltárral ellenőrzi a problémát. A hibás saját script újrafuttatása vagy a napló törlése nem sérülésjavítás.
2. Tartós törlési intent után a hiányzó eredeti ciphertext folytatható; eltérő hash/azonosságú visszatérő fájlt nem szabad elfogadni vagy automatikusan törölni. Eltérő projekt, scope, manifest vagy óra esetén mindkét oldal zárt marad.
3. Félbeszakadt metadata-archiválásnál a sértetlen aktív és történeti bejegyzéseknek byte-ra/értékre azonos eredeti manifestet és intentet kell adniuk. Érvényes eredeti naplóval a `sync` a befejezett másik oldal alapján, ciphertext nélkül folytatja az archiválást. Az `apply` újrahash-ellenőrzés után folytatja a félbemaradt fájltörlést.
4. Torn, üres vagy megváltozott napló esetén nincs automatikus retry. Az operátor megőrzi a hibás metadata bizonyítékát védett helyen, és csak egy megmaradt, ellenőrzött, teljesen azonos eredeti aktív/történeti naplóból készíthet tartós, ellenőrzött javító példányt. A javító fájl privát tempfájlban készül, fsync után, a hibás eredeti azonosságának ismételt ellenőrzésével cserélhető. Ciphertext/privát kulcs nem kerül a hibariportba. Ha nincs ilyen megbízható eredeti napló, nincs automatikus javítás vagy kiszolgálási promóció.
5. Öt percnél nagyobb óraeltérés vagy lejárat körüli eltérés esetén a friss peer-órát újra kell olvasni, és a két gép helyes UTC-jét ellenőrizni. Nem szabad a lejárati dátumot átírni vagy a clock guardot kikapcsolni. A bootstrap friss órával folytatható a már kész metadata-batchek megőrzésével.
6. A `localExpiryMayHaveCompleted:true` vagy ismeretlen incidensnél mindkét oldalt leltározni kell; a friss eredeti példányokat ellenőrizni, majd a kontrollált `sync/check/apply` utat használni. A sikeres újrafutás proofját a hibapróbával együtt kell megőrizni. Jelenleg a hibapróba még nem küld külső riasztást és felülíródhat a következő hibánál; ezt az ütemezés előtt rendezni kell.

**Automatikus managed ütemezés és külső retention-riasztás még nincs.** Az aktív batch legfeljebb száz run és összesen 512 MiB még jelen lévő deklarált ciphertext. Az archivált metadata külön legfeljebb tízezer run/32 MiB; nem plaintext/ciphertext vagy felhasználói fiókadat. A határokhoz közeledés és a tartósan blokkolt expiry, hiányos capture vagy sérült napló riasztása még kapu. A régi/ágyazott példányok retentionje, a teljes hosted Auth-visszaállítás és a writer-fence/privacy-promotion szintén megmarad.

A server-attested, helyben ciphertext nélkül megismert lejárt run nem független helyi adategyezési bizonyíték. Üres eredeti helyi expiry-file halmaz és capture-napló hiánya különbözteti meg, a proof ennek darabszámát jelzi. A frissen letöltött vagy eredetileg helyben tárolt ciphertext külön hash-ellenőrzést kap.

## Külön kulcspéldány és külső monitor

A felhasználó által megadott cserélhető D: adathordozóra elkészült a byte-ra azonos age-identitás másolata. A felhasználó megerősítette a leválasztást és külön megőrzést. A FAT32 adathordozón nincs fájlrendszeri ACL; a példányt fizikai védelemmel tárolja. Kulcsérték vagy kulcshash nem került dokumentációba/auditba/chatbe. A független kulcspéldány kapuja ezzel lezárható.

A külső monitor első tényleges schedule-eseménye [sikeres](https://github.com/Muzsy/future_flow/actions/runs/38066884612), 279d4d7 forrással. Ez az ütemezett HTTPS/web/API-határ ellenőrzésének bizonyítéka; worker/DB/backup-frissesség mérését önmagában nem igazolja. A külön hibaemail Inbox-kézbesítését a felhasználó korábban megerősítette.

Tesztelők még nincsenek. A felhasználó a műszakilag kész béta után kívánja meghívni őket. A hozzáférés és a 30 napos költségidőszak a tényleges résztvevők/használat ellenőrzéséhez kötődik; a műszaki készenlét nem automatikus meghívó vagy keretaktiválás.
