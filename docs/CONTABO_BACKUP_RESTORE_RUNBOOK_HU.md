# alterward — Contabo mentés és izolált visszaállítás

2026-10-10-i managed-kiegészítés: [külön titkosított Auth/Storage capture és valódi izolált PG-restore](SUPABASE_RECOVERY_COVERAGE_HU.md) sikeres. A public daily/config mentés külön scope; teljes hosted login/jogosultság/fence/promotion és managed/történeti retention még kapu. [Külső monitor](EXTERNAL_AVAILABILITY_MONITOR_HU.md) konfigurációja aktív, kézi futása sikeres, schedule/új hibaemail még nem igazolt. Az alábbi korábbi proofok a megjelölt forrás/időpont állapotai.

2026-10-10-i új checkpoint: [karanténos törlés/visszavonás replay](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) implementált és célgépen/Claude/CI-ben ellenőrzött, mindig zárt eredménnyel. Teljes Auth/grant/promóciós és történeti retention megmarad. [Hosztolt helyreállítás/leltár](SUPABASE_RECOVERY_COVERAGE_HU.md). Shared személyes próza kapuja a [későbbi öt páros kör](BETA_ROLLOUT_SEQUENCE_HU.md) előtt kötelező; az első tízfős személyes kör minden Shared-funkció nélkül indulhat a többi kiadási kapu lezárása után.

2026-10-08 · [Zárt kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Szerver-előkészítés](CONTABO_PREPARATION_REPORT_HU.md) · [Fióktörlés](ACCOUNT_DELETION_RUNBOOK_HU.md).

## Elvégzett próba

A `20261008T213621Z-06645147` mentés a `c18a9231869972c892e3de590f847f1c1d287eff` main állapot mellett készült. A valódi Contabo visszaállítási próba 2026-10-08T21:40:25Z-kor sikeres. A 2026-10-08T21:41:51Z utóellenőrzés szerint mind a hat korábban futó konténer azonos azonosítóval és restart-számmal fut; ideiglenes konténer és plaintext scratch könyvtár nincs.

| Bizonyíték             | Eredmény                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Supabase forrás        | PostgreSQL 17, `public` séma, 97 `ff_`/`aw_` alkalmazási tábla                                                                |
| Konzisztencia          | Read-only repeatable-read tranzakcióból exportált snapshot; a `pg_dump` ugyanazt importálta                                   |
| Visszaállított adat    | Mind a 97 tábla, összesen 1632 sor; táblánként sorösszeg és rendezett JSON-rekordok ellenőrzőösszege egyezik                  |
| Adatbázis-restore      | Új, hálózat nélküli PostgreSQL 17 konténer; egy tranzakció, hibánál megállás; nincs éles DB-írás                              |
| Proxy/config           | 24 fájl visszaállítva saját sandboxba, minden SHA-256 egyezik; a visszaállított Caddyfile adaptálása és validálása sikeres    |
| Offsite példány        | A titkosított fájlok helybe letöltve, SHA-256 és méret egyezik; a próba ezt a helyi példányt küldte vissza és fejtette vissza |
| Sérülés elleni védelem | Mindkét age archívum módosított ciphertextjének visszafejtése elutasított                                                     |
| Takarítás              | Ideiglenes DB-konténer és a teszt plaintext/credential/identity fájljai eltávolítva; a mentési archívumok megmaradtak         |
| Mellékhatás            | Nyilvános port, alkalmazás-/workerindítás, proxy reload/restart, meghívó, AI-hívás és bétaaktiválás: nulla                    |

Az adatbázis-archívum titkosítva 1 315 522 byte, a config archívum 8591 byte. Az adategyezés táblánként MD5-alapú rendezett tartalom-összeg; az egész dump, config és titkosított archívum sértetlenségét külön SHA-256 ellenőrzi, a titkosítás hitelesítését az age végzi. Ezek egy visszaállítási próba bizonyítékai, nem folyamatos mentési vagy rendelkezésre állási garanciák.

## Eszköz és titokhatár

[Windows üzemeltetői indító](../scripts/contabo-backup-rehearsal.mjs) és [szerveroldali végrehajtó](../scripts/ops/contabo-backup.py). Node 24 és a meglévő, checkouton kívüli SSH-kulcs/hostpin szükséges. `StrictHostKeyChecking=yes`; eltérő hostkulcsot nem fogadunk el.

Az Ubuntu hitelesített csomagtárából letöltött age külön, root-only `/root/alterward-ops/tools` könyvtárba kicsomagolva; nincs hostszintű csomagtelepítés vagy frissítés. Az ellenőrzött CLI-verzió 1.1.1. Külön hivatalos `postgres:17-bookworm` image került letöltésre; a próba az alábbi konkrét image ID-t használta, nem a változó taget:

```text
sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f
postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826
```

A host PostgreSQL 16 kliensét nem használtuk a 17-es forrás mentésére. [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [age](https://github.com/FiloSottile/age).

A Supabase kapcsolat `verify-full` TLS-t és a meglévő ellenőrzött CA-t használ. Jelszó csak root-only, rövid életű `PGPASSFILE` fájlban, nem parancssori argumentumban vagy Docker environmentben. SMTP-jelszó nem kerül a VPS-re. Az age visszafejtő kulcs helye `%LOCALAPPDATA%\FutureFlow\secrets\alterward_backup_identity.txt`, felhasználó/SYSTEM ACL-lel; Gitbe és image-be nem kerül. Tartós szerveroldali kulcspéldány nincs. A restore idejére stdinből külön ideiglenes fájl készül, amelyet a takarítás eltávolít.

A szerver archívumai `/root/alterward-ops/backups/<runId>/`; a letöltött titkosított példányok, manifest és bizonyíték a Gitből és Docker-buildből kizárt, ACL-védett `.local/contabo-release/` helyen vannak. A config archívum más alkalmazások bizalmas proxy/Compose/SSH és ACME/certificate fájljait is tartalmazhatja: nyersen nem publikálható, Cloud-auditba nem tölthető fel. A visszafejtő kulcsot és az archívumot külön védett második helyen is biztosítani kell; a helyi lemez önmagában nem gépvesztés elleni redundancia.

## Újrafuttatás

A projekt gyökerében, Node 24 környezetben:

```powershell
node --env-file=.env scripts/contabo-backup-rehearsal.mjs
node scripts/contabo-backup-rehearsal.mjs --restore-existing
```

Az első parancs új konzisztens alkalmazási mentést és izolált restore-t készít. A második kizárólag az előző helyi titkosított példányt teszteli újra; nem kapcsolódik az éles adatbázishoz. Nem állítja vissza az éles Supabase-projektet vagy a meglévő proxy fájljait, nem kapcsol be feature-t vagy ütemezést. A kimenet csak fázist, darabszámot és összegzett proofot tartalmaz; hibánál provider/SQL napló nem jelenik meg a terminálban.

A kliens 256 MiB/0,5 CPU, a restore DB 512 MiB/0,5 CPU, a Caddy ellenőrző 128 MiB/0,5 CPU korlátot kap. A DB teljesen hálózat nélkül, publikált port nélkül, tmpfs adatkönyvtárral fut. A Caddy image bináris file-capabilityje miatt az izolált tesztnek `NET_BIND_SERVICE` szükséges, a többi capability eldobva; internet és publikált port továbbra nincs. Az első szigorú `cap_drop ALL` teszt emiatt exec-hibával megállt; a javított teszt ugyanazt az offsite archívumot sikeresen használta. Ez nem az alkalmazás runtime-jogainak bővítése.

Nyolc célzott biztonsági próba ellenőrzi a normál restore-t, abszolút/parent/sibling útvonalakat, duplicate archive bejegyzést, dot/parent/dupla-elválasztó/backslash aliasokat, symlink/hardlink/device/FIFO tiltást és meglévő fájl felülírásának tiltását. Helyben mind sikeres; a CI verify job ugyanazokat futtatja. Az alias-tiltás a sikeres eredeti proof után szigorította a végrehajtót; a dátumozott proof a ténylegesen akkor használt script hash-ét őrzi.

A szigorított végrehajtóval 2026-10-09 helyi idő szerint a letöltött titkosított példány ismételt izolált restore-ja is sikeres: ugyanaz a 97 tábla/1632 sor és 24 fájl, minden összehasonlítás és sérülés-tiltás egyezik. E változás `04512015fa251ae2c82ccf946501c0370dc88b8d` main [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37860992061) verify/container sikeres; nyolc Python-próba, a korábbi alkalmazási tesztek és izolált futás ellenőrzött. Következő külön lépés a [célkörnyezeti web/API/worker próba](CONTABO_TARGET_REHEARSAL_HU.md).

## Megmaradó kiadási kapuk

- Ez **alkalmazási `public` séma + proxy/config mentés**. A hosztolt Supabase Auth belső sémái, felhasználói jelszavai, Storage objektumok, globális role/grant, SMTP és dashboard konfiguráció nem részei. A célfixture NOLOGIN szerepköröket kapott; `--no-owner/--no-acl` miatt az éles jogosultságok újraellenőrzése külön szükséges. Nem teljes Supabase-projekt visszaállítás.
- Éles restore kizárólag karanténban előkészítve engedhető: worker/AI/exposure kikapcsolva; újabb fiók-/élet-/publikációtörlés és visszavonás visszajátszása, Shared adatvédelmi vetület és Auth-egyeztetés, RLS/grant és saját-jog ellenőrzés szükséges **a kiszolgálás visszakapcsolása előtt**. E próba ezt a törlésvédelmi eljárást még nem implementálja vagy igazolja.
- A felhasználó 2026-10-09-én **hét nap** megőrzést hagyott jóvá a napi titkosított alkalmazásmentésekhez. Automatikus napi mentés, archívum- és lokális másolat-expiry, külön redundáns kulcs/offsite tárolás, monitor és aktív job drain még hátravan. Nincs automatikus mentési időzítő aktiválva. Ez nem a hosztolt Supabase Auth vagy szolgáltatói backup automatikus megőrzési beállítása; a történeti proxy/config-próbák törlése külön, ellenőrzött határ.
- A Caddy-config visszaállítható, de az eredetileg hiányzó certificate privátkulcsokat a mentés nem teremti vissza. A hat meglévő hostname közül két origin-TLS ellenőrzés sikeres és kettőhöz teljes lemezes cert/kulcs/metaadat van. A négy másik route és az újraindítás utáni állapot külön vizsgálandó; nincs jogosultság vak globális proxy/VPS-restartjára.
- Host UFW inaktív; a rögzített IPv4/IPv6 input alap policy accept. Docker külön NAT/forward szabályokat használ, a Contabo oldali tűzfal nem ellenőrzött. Az alterward alkalmazás portjai továbbra nem publikálhatók. Teljes tűzfalváltoztatás csak a többi alkalmazás és az SSH-helyreállítás ismeretében végezhető. [Docker tűzfalhatár](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

A két failed unit közül az egyik más alkalmazás ellenőrzése (11 passed, 3 warnings, 0 errors, de exit 1), a másik bootkori hálózati várakozás. A jelenlegi `eth0` routable, de configuring; a failed jelzés puszta törlése nem javítás. A reboot-required jelzés megmaradt. Ezek vizsgálata nem indított újra más alkalmazást és nem módosított tűzfalat.

## Új TLS/owner konfiguráció mentése és izolált restore-ja

2026-10-09T07:37:15Z: az éles Origin CA cert/key, közös proxy/Compose és root-only owner env/frozen config/manifest külön age-titkosított config-archívumba került. **36 fájl, 18 049 byte ciphertext**, helyi offsite visszaolvasott hash, tényleges sérülés-tiltás, mind a 36 restore-hash, CA/key/expiry és pinned Caddy hálózat nélküli validate sikeres. Ideiglenes plaintext/age-identity eltávolítva, hat korábbi konténer és saját három szolgáltatás változatlan. Nyers Origin key nem hagyta el a szervert. [Teljes bekötési bizonyíték](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md).

Ez új konfigurációs mentés és restore, nem új DB-snapshot. A korábbi 97 táblás/1632 soros DB és 24 fájlos config-próba külön történeti bizonyíték; hosztolt Auth/grant/storage és törlés/visszavonás replay továbbra hiányzó kapu. A napi alkalmazásmentés hét napos retentionja jóváhagyott, végrehajtása még hiányzik. A proxy/alkalmazási rollback ténylegesen sikeres; automatikus backup/expiry/monitor, redundáns kulcs/offsite tárolás és aktív paid-job drain továbbra nyitott.

## Tulajdonosi upgrade utáni config-mentés

A 9eb7732 éles image apply/rollback/újra-apply után új, 47 fájlos titkosított config/upgrade-archívum készült: aktuális runtime-fájlok, előző/candidate fájlok és prepared/applying/applied journal is része. Offsite hash és ugyanabból az izolált restore, ciphertext-sérülés tiltás, cert/key/CA/expiry és hálózat nélküli Caddy validate sikeres; mind a kilenc éles konténer változatlan. Ez nem új DB-snapshot vagy teljes Supabase restore, napi timer/7 napos expiry/privacy-replay még nyitott. [Pontos bizonyíték](CONTABO_OWNER_UPGRADE_REPORT_HU.md).

## 2026-10-10: aktív napi mentés és helyi titkosított másolat

A [napi eszköz és audit](CONTABO_DAILY_BACKUP_MONITOR_HU.md) df7550e szerverforrással, 2eb9a50 helyi transporttal aktív: hét napos managed retention, napi 03:15 UTC backup, negyedórás monitor és óránkénti current-user helyi sync. A 20261010T092255Z-ca2becbc offsite példányból 97 tábla / 1633 sor / 55 configfájl memóriában kezelt kulcsú izolált restore-ja egyezett; tamper elutasítva, ideiglenes adatok/konténerek eltávolítva. Hiányzó-könyvtár és mesterséges kulcsírás SIGKILL/monitor cleanup célpróba sikeres, host-reboot nélkül. 24 új Linux eset mind sikeres, 65 helyi Python esetből 64 sikeres + egy Windows-korlát; hat Node-retention és két valós helyi pin-negatív próba sikeres. A valódi Windows task kézi és első automatikus futása eredmény 0; a pontos [verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38041820645) zöld.

Claude elfogadta a napi és transportjavításokat; a 12 új findinggel összesen 55 megfigyelés, nem 55 igazolt hiba. DLY-05/06/07/10/11/12 határai és a külön UPG-10 low feladat megmaradnak. Forrásaudit, célpróba és jövőbeli üzembiztonság külön bizonyíték. App 9eb7732 / egy owner / eredeti Access/CA és nulla paid allowance változatlan; hat idegen futó konténer a korábbi baseline-nal egyezik. Új provider-költés 0 USD. A mentés nem zárja le a deletion/revocation replay, történeti retention, hosztolt Auth/Storage/grants, külső riasztás/független kulcsmentés vagy teljes worker-/host-/providerhibaút kapuját. A teljes P01–P13 / Shared S0–S7 és az inaktív 10 USD/tízfős béta megmarad.


## Következő privacy-kapu: friss független állapot

A [részletes replay-terv](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) a jelen forrásban igazolja: az account marker a végső ff_users törléssel cascade eltűnik, az élettörlési nyugta pedig a saját accounttal együtt törlődik. Ezek nem mentés utáni teljes adatvédelmi naplók. Friss, a dumpból függetlenül ellenőrzött állapot hiányában nincs kiszolgálás/worker/AI újranyitás; a tényleges replay és A/B/C célpróba még következik.
