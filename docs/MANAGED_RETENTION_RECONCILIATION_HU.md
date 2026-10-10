# alterward — összehangolt managed mentéskezelés

2026-10-10 · [Kiadási sorrend](NEXT_STEPS.md) · [Szerveres lejárat](MANAGED_BACKUP_RETENTION_HU.md) · [Helyi lejárat](LOCAL_MANAGED_BACKUP_RETENTION_HU.md).

A [közös operátori futtató](../scripts/supabase-managed-retention.mts) a szerver és a helyi gép teljes, projektkötött managed jegyzékét egyezteti. Kizárólag a külön Auth/Storage-adatmentés két ciphertextje és manifestje a hatásköre. A napi alkalmazásmentések, régi archívumok és JSON-ba ágyazott ciphertext-másolatok külön feladatok.

## Megvalósított viselkedés

- `--check`: olvasási leltár; a friss szerveres, helyben hiányzó példányokat megszámolja. Nem tölti le vagy törli a mentést.
- `--sync`: a hiányzó friss példányt védett SSH-csatornán, egyenként letölti; a helyi író ismét ellenőrzi a ciphertext méretét/hashét. A már későbbi mentésre mutató latest pointert egy régebbi példány letöltése nem állítja vissza.
- `--apply`: előbb egyeztetés és teljes ellenőrzés, majd külön naplózott helyi és szerveres lejárat. Egy megszakítás után az eredeti manifestek a megmaradó metadata-naplókban elérhetők; hiányzó eredeti fájl folytatható, újrateremtett/lecserélt fájl nem kap törlési jogot.
- Lejárt szerveres példány ciphertextjét nem tölti le. A teljesen ellenőrzött szerveres manifestet önálló helyi metadata-bejegyzésként megőrzi, hogy a szerveroldali lejárat egyeztethető maradjon.
- A szerver és a helyi gép manifesteltérése, idegen/torn bejegyzés vagy menet közben megváltozott jegyzék megállítja a műveletet. Ez biztonságos megállás, nem automatikus sérülésjavítás.

A törléshez eredeti célkönyvtár és fájlazonosság, pontos projekt/scope, hét napos UTC lejárat és két friss, legfeljebb öt perccel eltérő óra szükséges. A teljes friss és lejárt batch ellenőrzése megelőzi az első unlinket. A szerver tartós deletion-intent naplója a fájl és mindkét szülőkönyvtár fsyncjével megelőzi az első törlést; a ciphertext után a manifest, végül az üres archívumkönyvtár tűnik el. Nincs rekurzív törlés. A helyi lejárat teljes újrahash-elése három batch-ellenőrzésre korlátozott, majd közvetlen fájlonkénti ellenőrzés történik: nem nő négyzetesen a lejárt példányok számával.

Az eszköz minden forrását és függő helperét a pontos Git-commit ellenőrzi import/ACL-módosítás előtt. A helyi Python kötelező eredeti abszolút executable, `-I` izolációval és binárishash-bizonyítékkal. A távoli Python is izolált. Archívum/kulcs nem kerül shell argumentumba vagy nyers hibakimenetbe; ciphertext csak belső csatornán mozog. Age-kulcsot, adatbázist, SMTP-t vagy AI-szolgáltatót a futtató nem használ, béta-jogot nem aktivál.

## Bizonyíték és hátralévő kapuk

A c12ae7e szerveres naplószelet tényleges Contabo-próbáján 21 szerveres és 23 helyi eset sikeres, kihagyás nélkül; a kilenc futó konténer teljes állapota/image/port/restart változatlan, a szintetikus fixture eltakarítva, valódi archívumtörlés nulla. A Claude forrásaudit scope/frissességi hibát nem talált; a proof-mező és fsync/többnaplós/alteráltnaplós tesztek pontosítását kérte. Ezek és a közös egyeztető új regressziói elkészültek; a pontos új kiadás CI/audit/célpróbája külön igazolandó.

**Automatikus managed ütemezés még nincs.** A batch legfeljebb száz ismert run és összesen 512 MiB deklarált ciphertext; a megmaradó metadata-naplók összehangolt ritkítása és a korlát elérésének riasztása még kapu. Tartósan blokkolt expiry, hiányos capture vagy sérült napló operátori incidens. A régi/ágyazott példányok retentionje, a teljes hosted Auth-visszaállítás és a writer-fence/privacy-promotion szintén megmarad.

## Külön kulcspéldány és külső monitor

A felhasználó által megadott cserélhető D: adathordozóra elkészült a byte-ra azonos age-identitás másolata. A felhasználó megerősítette a leválasztást és külön megőrzést. A FAT32 adathordozón nincs fájlrendszeri ACL; a példányt fizikai védelemmel tárolja. Kulcsérték vagy kulcshash nem került dokumentációba/auditba/chatbe. A független kulcspéldány kapuja ezzel lezárható.

A külső monitor első tényleges schedule-eseménye [sikeres](https://github.com/Muzsy/future_flow/actions/runs/38066884612), 279d4d7 forrással. Ez az ütemezett HTTPS/web/API-határ ellenőrzésének bizonyítéka; worker/DB/backup-frissesség mérését önmagában nem igazolja. A külön hibaemail Inbox-kézbesítését a felhasználó korábban megerősítette.

Tesztelők még nincsenek. A felhasználó a műszakilag kész béta után kívánja meghívni őket. A hozzáférés és a 30 napos költségidőszak a tényleges résztvevők/használat ellenőrzéséhez kötődik; a műszaki készenlét nem automatikus meghívó vagy keretaktiválás.
