# alterward — hosztolt Supabase helyreállítási határ

2026-10-10 · [Mentési eljárás](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Privacy-replay](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) · [Bétaütemezés](BETA_ROLLOUT_SEQUENCE_HU.md).

## Tényleges, változtatás nélküli leltár

A [read-only operátori eszköz](../scripts/supabase-recovery-inventory.ts) sikeresen lefutott. Az Auth és a PostgreSQL projektazonosságát külön ellenőrzi, TLS-t követel, az adatbázist read-only tranzakcióban olvassa; nem készít Auth-mentést, nem töröl fiókot, nem küld levelet és nem indít AI-t. A lapozott Auth-lista azonosítói és emailjei csak memóriában vannak; a védett proof összesítést és hash-t tartalmaz.

| Ellenőrzés                            | 2026-10-10-i eredmény                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Alkalmazástáblák                      | 97, mind a 97 RLS-védett                                                                  |
| Közvetlen anon/authenticated táblajog | 0 érintett tábla                                                                          |
| Auth                                  | 8 fiók, teljes egyoldalas leltár, 0 aktuálisan tiltott fiók                               |
| Alkalmazási fiókok                    | 7 aktív, mindegyiknek van Auth-párja; a különbség nem törlési utasítás                    |
| Storage                               | 0 bucket, 0 objektum                                                                      |
| Függő fióktörlési marker              | 0                                                                                         |
| Shared                                | 0 aktív személyes tagság, 0 megtanult személyes emlék                                     |
| Biztonsági metaadat                   | 3 séma, 1358 grant-bejegyzés, 27 alkalmazási függvény, 66 trigger; privát digest rögzítve |

A közvetlen böngészős hozzáférés tiltása miatt az alkalmazástáblákon a nulla policy szándékos default-deny állapot. A grant-bejegyzések teljes száma nem böngészős hozzáférések száma. A metaadat-digest eltérésjelző, nem önmagában visszaállítható teljes schema/role/grant-mentés. A fiókleltár időponti megfigyelés, nem writer-fence vagy replay-engedély.

A dashboardban a future_flow projekt **Free**, és a Scheduled backups felület szerint nincs szolgáltatói projektmentése. Az alkalmazás napi titkosított `public` mentése ettől függetlenül működik. A Supabase a Free projektekhez saját exportot/offsite mentést javasol; a DB-mentés a Storage fájljait nem tartalmazza. [Hivatalos mentési dokumentáció](https://supabase.com/docs/guides/platform/backups).

## 2026-10-10: tényleges titkosított managed-mentés és izolált restore

A [Windows operátori indító](../scripts/supabase-managed-recovery.mts) és a [szerveroldali végrehajtó](../scripts/ops/contabo-managed-recovery.py) cdab90bb4c34ad5b30fbb5660bbf5c97eff707cb main forrással **ténylegesen sikeres** mentést és visszaállítási próbát készített. Capture 2026-10-10T14:17:10Z, manifest expiry 2026-10-17T14:17:10Z; a run-specific manifest és proof védett, Gitből kizárt helyen marad.

| Ellenőrzés   | Eredmény                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forrás       | PG17, ellenőrzött TLS/CA, read-only repeatable-read exportált snapshot; hosted adatírás 0                                                                            |
| Managed adat | 27 Auth + 8 Storage tábla, 171 megőrzött sor; mind a 35 táblán pontos sor- és tartalomösszeg-egyezés                                                                 |
| Tokenhatár   | 15 ephemerális Auth-adatkészlet és két multipart upload tábla adatai kihagyva; auth.users natív token- és függő változtatási mezői csak a mentés vetületében törölve |
| Séma         | 97 public tábla adat nélkül; public columns/grants/policies/functions/triggers/indexes/constraints digest, RLS és anon/authenticated táblajoghatár egyezik           |
| Titkosítás   | Eredeti daily age-recipient/image egyezik; mindkét helyi ciphertext hash/méret egyezik; mindkét sérült ciphertext elutasítva                                         |
| Cél          | Új PG17, network none, publikált port 0, tmpfs adat; Auth-szerver nem indul                                                                                          |
| Takarítás    | Ideiglenes konténer és plaintext eltávolítva; mind a 10 meglévő konténer állapota változatlan                                                                        |
| Mellékhatás  | Levél, provider AI, live restore vagy aktiválás 0                                                                                                                    |

A mentés **bizalmas**: fiókazonosítót, emailt/telefont, jelszóhash-t és tartós MFA/SSO/OAuth-konfigurációs titkot is őriz titkosítva. Nem titokmentes archívum, és nem a tartós MFA-titkok kizárása a cél. Új Auth-tábla, új auth.users oszlop/generált mező vagy új Storage-tábla privacy-felülvizsgálatig megállítja a capture-t. A 35 oszlop és a táblalisták a hosted projekt csak olvasó leltárából származnak. Az éles fiókok/tokenek nem módosulnak; a sanitized vetület csak az izolált másolaté.

A source-binding öt követett operátori fájl pontos Git-byte-egyezését ellenőrzi; a database/core buildtermékek hash-e megfigyelt artifact, nem reprodukálható buildattestation. A meglévő daily és owner lock ugyanabban a sorrendben, non-blocking módon véd. A kézi capture nem telepít új timert, és a daily 03:15 UTC futástól távol végzendő. Windows MSIX esetén az ALTERWARD_SSH_SECRETS_DIR az eredeti védett fizikai könyvtárra mutasson; kulcsot nem másolunk a projektbe vagy a VPS-re.

Öt Python határteszt sikeres, köztük új oszlop/tábla, pozitív ephemeral sor, idegen manifest/container, lejárt/future idő és source-projekt tiltása. A Windows CRLF és a storage nevek számjegyeinek olvasási hibáját a tényleges első próbák alapján javítottuk. A sikeres proof a cdab90b capture/rehearsal source hash-eit külön őrzi. A pontos [cdab90b verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38058979012) és a dokumentációs/értesítési [15d206d CI](https://github.com/Muzsy/future_flow/actions/runs/38059381577) sikeres. A Claude Cloud pontos cdab90b source-deltát visszaellenőrizte: MR-07/08 javítva, új konkrét finding nincs, capture/izolált rehearsal nem blokkolt. A Claude nem futtatta a próbát és nem olvasott production/adat/kulcsfájlt; a runtime proof önálló végrehajtási bizonyíték. A megmaradó retention/full-hosted/promotion kapukat nem zárta le.

**Megmarad:** hosted GoTrue/jelszó/MFA-login próba, ownership és globális role-attribútumok, Auth/Storage teljes security-katalógus, Vault-kulcsok, külső fájlobjektumok, projekt-/SMTP-konfiguráció; writer-fence, független törlési/visszavonási authority és kiszolgálási promotion. A proofban fullHostedAuthRecoveryVerified és restoreOrActivationAllowed false. Az encrypted manifest hét napos expiryje az elavult rehearsal tiltása, **nem automatikus szerver/helyi fájltörlés**. Managed retention és SIGKILL utáni incomplete/scratch-fixture cleanup még nincs telepítve; külön kulcspéldány sincs. A teljes Supabase-helyreállítási kapu nyitott.

Kézi indítás Node24/Windows alatt, eredeti védett SSH/age-kulccsal:

```powershell
node --env-file=.env --import tsx scripts/supabase-managed-recovery.mts --capture-and-rehearse
node --env-file=.env --import tsx scripts/supabase-managed-recovery.mts --rehearse-existing
```

A második művelet a helyi, hash-ellenőrzött két ciphertextet használja; az eredeti run-specific manifestet nem írja felül. Éles visszaállítást egyik sem végez.

## Helyreállítás meghibásodási típus szerint

1. **Csak a Contabo kiesett, Supabase ép.** A legutóbbi ellenőrzött titkosított konfigurációból saját, elkülönített szerverpéldány készül. A még aktuális hosztolt Auth és adatbázis az alap, nem régi Auth-rekordok importja. SSH/TLS/Origin/Access, változatlan saját táblajogok és zárt worker/keret ellenőrzése után külön, felülvizsgált kiszolgálási lépés kell. Új VPS tényleges előállítása és hostkiesési próba még nincs igazolva.
2. **Alkalmazási DB-adat sérült vagy régi mentés kell.** Izolált karantén, friss független Auth és megállított írók, a régi mentéshez kötött privacy-authority, törlés/visszavonás replay, tényleges szolgáltatói költés egyeztetése, teljes migráció/függvény/trigger/RLS/ownership/grant ellenőrzés. Hiányzó aktuális költségszámlánál a replay megáll; nincs régi vagy nulla költéssel automatikus újrakezdés. A másolatból nem indul szolgáltatás.
3. **Auth vagy teljes Supabase-projekt veszett el.** A mostani `public` dump és a listUsers összesítés nem állítja vissza a jelszavakat vagy a hosztolt Auth-azonosságot. Free csomagban szolgáltatói mentést nem feltételezünk. Külön, titkosított Auth-adat/séma és szükséges projektkonfiguráció mentés, valamint új, izolált célon megismételhető próba szükséges. Korábbi törlések, tiltások és visszavonások független egyeztetése nélkül régi fiók vagy session nem aktiválható; teljes aktuális állapot elvesztésekor zárva maradunk. Ezt a kaput a mostani leltár nem zárja le.
4. **Storage-objektum veszett el.** Jelenleg nincs alkalmazási objektum. A következő Storage-funkció előtt külön objektummentés, megőrzés, visszavonás/törlés replay és jogosultsági próba kell. DB-metadata helyreállítása nem állítja vissza a fájlokat.
5. **SMTP/dashboard konfiguráció veszett el.** A hitelesített domain, dedikált SMTP2GO-felhasználó és titkos jelszó a szolgáltatóknál marad. Visszaállításkor az üzemeltető egyezteti a szolgáltatói hozzáférést; a [nyolc angol levélsablon](../deploy/supabase-auth/en/README.md), a HTTPS `/account-access`, a signup tiltása és a pontos redirectek újra ellenőrzendők. Új levél csak engedélyezett címzettnek küldhető, tényleges kézbesítési próbával.

A szolgáltatói logikai költözés külön role-, schema- és data-exportot, valamint az Auth/Storage saját változásainak és esetleges titkosítási kulcsainak kezelését igényli. A managed szerepköröket és jelszavakat nem másoljuk vakon egy másik projektbe. [Hivatalos backup/restore eljárás](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Történeti megőrzés, kulcs és riasztás

A külön [managed lejáratkezelés szerveroldali operátori szelete](MANAGED_BACKUP_RETENTION_HU.md) elkészült; peer-clock, tizenöt tényleges sikeres Linux-eset, egy valódi archívum olvasási checkje, pontos Claude-delta és zöld verify/container CI kész. Nem telepítettünk automatikus expiry-t és nem töröltünk valódi archívumot. A teljes helyi/történeti/ágyazott másolatkezelés, megszakítási recovery és ütemezés külön megmarad.

A managed capture előtti célgépi, csak olvasó ciphertext-leltár 14 age-fájlt talált, ebből 4 a managed daily határon kívüli történeti mentés. Egyik történeti ciphertext sem régebbi hét napnál. Fájl nem lett törölve. Az új managed capture két további ciphertextje külön scope és külön expiry; a korábbi leltár nem a capture utáni teljes darabszám. Ezekre a meglévő daily expiry nem vonatkozik: külön pontos manifest/hash/útvonal-regiszter és ellenőrzött expiry kell. A mtime önmagában nem engedély a törlésre, a regiszterhez a valódi capture-idő és scope is szükséges. A helyi történeti másolatokat is rendezni kell.

A capture utáni, csak olvasó regiszter **16 szerveroldali ciphertextet** ellenőrzött manifest/hash/scope egyezéssel. A három operátori helyi mentési könyvtár 186 age/JSON fájljának olvasási leltára **20 titkosított példányt** talált: 16 fájlos és négy JSON-ba ágyazott base64 másolatot; minden hash egy regisztrált szerverciphertexthez tartozik. A JSON-ba ágyazott ciphertext megmaradna pusztán az age-fájl törlése után, ezért a külön expirynek ezt is kezelnie kell. Nyers ciphertext/adat nem került Gitbe; fájltörlés nulla. A három régi operation manifest nem tárol tényleges capturedAt időt, csak eredeti run-start nevet: ez jelölt időhatár, nem igazolt pontos capture vagy automatikus törlési engedély. A regiszter nem lejárati végrehajtó, nem teljes .local személyes adatleltár, és nem terjeszti ki a daily törlési scope-ját.

Külön második gép/tárhely jelenleg nincs. A visszafejtő kulcs eredeti védett helyi fájlja megvan; független jelszókezelős vagy offline adathordozós példány még nem igazolt. Kulcsot nem írunk chatbe vagy Gitbe. A kulcs és a ciphertext egyetlen gépen tartása nem teljes gépvesztés elleni védelem.

A [külső elérhetőség-ellenőrzés](EXTERNAL_AVAILABILITY_MONITOR_HU.md) konfigurációja aktív, a kézi GitHub-futás sikeres; schedule még nem igazolt; a külön szándékos hibaemail a felhasználó szerint Inboxba érkezett. A szerver saját napi mentési és negyedórás ellenőrzése aktív. A teljes hosted Auth-recovery, managed/történeti retention, független kulcspéldány és működő külső értesítés nyitott kiadási kapu marad; a leltár nem bétaindítás.
