# alterward — az első védett indítás és visszaállítás

2026-10-09 · [Kiadási mátrix](CLOSED_SITE_OWNER_RELEASE_MATRIX_HU.md) · [Célpróba](CONTABO_TARGET_REHEARSAL_HU.md) · [Audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

Ez a konkrét végrehajtási sorrend; a három szolgáltatás és az alterward.com HTTPS domain/TLS/Caddy route már aktív, kizárólag tulajdonosi Cloudflare Access mögött. [Tényleges bekötés, rollback és húsz külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md). Az első indítás üzemeltetői olvasás, nem a fizetett tízfős béta. A 15 új élet mellett a külön korábbi pilot is megmarad, ezért 16 olvasható Official élet és öt Scenario várható; a [későbbi pozitív UI-próba](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md) mind a 16 élet/48 fejezet és öt Scenario olvashatóságát igazolta. A saját Supabase-belépés és friss-auth export később ellenőrzött; a meghívó spambe érkezett, recovery és fejlécek/válaszút még külön kapu.

## Indítás előtt

1. A teljes hatrészes Claude Cloud-audit és Codex finding-értékelés lezárása; kiadást érintő közepes jelzések ellenőrzött kezelése. Végső alkalmazási commit, valódi célimage ID és az ettől eltérő operátori/config commit/hash külön rögzített. A main CI verify/container és a pontos image teljes célpróbája sikeres.
2. A védett owner env új image-tagjának egyeztetése; az OpenAI-kulcs használhatatlan placeholder, minden paid allowance 0, UUID-lista és 30 napos ablak üres. Supabase admin/DB/link kulcsok kizárólag root-only, checkouton kívüli env-ben. SMTP-jelszó nincs a VPS-en.
3. A [valódi owner preflight](../scripts/contabo-owner-preflight.mjs) a tényleges védett env-et ellenőrzi a célgépi Compose-renderben, nem dummy fixture-rel. Minden owner overlay-érték, a web/API pontos team/AUD/egy email, kikapcsolt Shared/review/fork/exposure, nulla paid konfiguráció és rögzített image ID vizsgált. Az image override mindhárom szolgáltatásnál a korábban ellenőrzött helyi image ID-t használja, `pull_policy: never`; portpublikálás nincs. Hibánál nincs indítás. A preflight csak ideiglenes root-only fájlokat ír, utána eltávolítja őket; nem kapcsolódik DB-hez és nem indít konténert.

```powershell
node scripts/contabo-owner-preflight.mjs
```

4. A [hash-kötött indító](../scripts/contabo-owner-activate.mjs) `--stage` művelete a szerver `/root/alterward-ops/owner` könyvtárában root-only env/manifest/frozen Compose fájlokat készít; a már létező eltérő fájlt nem írja felül. A nyilvános, ellenőrzött DB CA külön read-only mount alapja. A stage nem kapcsolódik DB-hez és nem indít konténert. A `--launch` a szerver saját fájljait a védett helyi stage-proofhoz, a kiadott image-hez, teljes matrixhoz és új renderhez köti. Compose a pontos frozen JSON-t használja, ezért nincs második env-interpoláció; a literális dollárjel is megmarad. Egy operátori lock megakadályozza a párhuzamos indítást.

```powershell
node scripts/contabo-owner-activate.mjs --stage
node scripts/contabo-owner-activate.mjs --launch
```

Az első éles launch előtt read-only DB/TLS-próba ellenőrzi mind az öt generálási/review queue ürességét: régi jobot a nulla-budget worker sem claimelhet el. A sikeres `up` után a futó web/API/worker tényleges image ID, teljes deklarált feature-env, publikus portok hiánya, `node` user, CA mount, egészség, restart/OOM és erőforráskorlátok ellenőrzöttek. Négy anonim web/API kérés a proxy-hálózatról 403/no-store eredményt kell adjon. Indulás közbeni env/source/CA/config módosítás is hibakapu. Hibánál csak az `alterward-owner` projekt `down` művelete fut, a közös proxy/DNS változatlan. A stage és a tényleges launch/post-start próba sikeres: három futó szolgáltatás, ellenőrzött image/env/health/korlátok, négy anonim 403/no-store, hat régi konténer változatlan. Az első belső próba idején DNS/Caddy még nem volt aktiválva; a későbbi tényleges bekötés az új domainriportban szerepel. Az indító, jelkezelés és pooler TLS-probe három Cloud-delta auditja a 44e22e5 commitig lezárult; az utolsó nem adott új findingot.

5. A közös Caddy tényleges fájljának és Compose-konfigurációjának root-only/hash-ellenőrzött mentése. A korábbi hat konténer ID/restart/állapot, hálózatok és hostonkénti route-válasz rögzített. A már hibás négy régi origin TLS nem az új kiadás hibája, és nem javítjuk őket a tulajdonos jóváhagyása nélkül.

## Origin TLS és DNS

A kijelölt megoldás **Cloudflare Origin CA**, kizárólag `alterward.com` és `www.alterward.com` névre, a szerveren készített privát kulccsal és publikus CSR-rel. A privát kulcs nem kerül a Cloudflare űrlapjába, chatbe vagy Gitbe. A meglévő Caddy `/data` bind-mountján külön védett alterward-könyvtárban tároljuk; új bind-mount miatti közös proxy-újralétrehozás nem szükséges. A kiadott cert csak e két site blokkban `tls <cert> <key>` beállítással töltődik be. Nincs ACME/Access bypass vagy ideiglenes DNS-only szakasz.

A Cloudflare **Full (strict)** kézi mód 2026-10-09-én elmentve és dashboardon visszaolvasva; az automatikus Full mód kikapcsolva. Aktiválás előtt a cert lánca/nyilvános kulcsa/SAN/lejárata és a kulcshoz tartozása ellenőrzendő. A lejárat root-only inventoryba és az operátori figyelési listába kerül; 30 napon belüli lejárat indítási/üzemeltetési hiba. Az egyéves cert kiadva/telepítve, lejárata 2027-10-09T07:15:00Z. A valódi OpenSSL harmincnapos kapu az egynapos, még érvényes szintetikus certet elutasította; a saját fixture-kulcs/cert eltávolítva. Automatikus riasztás és új CA-certtel végzett rotáció még nyitott. [Cloudflare hivatalos útmutató](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).

Az Origin CA-t a böngésző közvetlenül nem bízza meg: a publikus apex/www rekordok végig **proxied** állapotban működnek, a látogató a Cloudflare publikus certjét kapja. A közvetlen origin-próba a hivatalos Origin CA gyökérrel, bekapcsolt cert/hostname-validálással dolgozik; ez nem böngészős TLS-bypass. A scoped Caddy-szabály továbbra 403-at ad a nem Cloudflare TCP peernek, saját fiókjogoknál is. Cloudflare JWT továbbra szükséges a védett alkalmazásúton, a többi Cloudflare ügyfél IP-je önmagában nem jogosultság.

Csak auditált/ellenőrzött Caddy-merge és működő origin TLS után kerülhet be a proxied apex A és www CNAME rekord. A kilenc meglévő mail-rekord nem változik. IPv6 AAAA nem kerül be külön IPv6-próba nélkül. DNS/route aktiválás nem indítja el a béta-keretet.

## Tanúsítvány-megőrzés és megújítás

A saját Origin CA kulcs **része a meglévő age-titkosított Caddy config-backupnak**. Ez az operátori választás megőrzi a visszaállíthatóságot a korábbi offsite ciphertext/hash/age-hitelesítési határon belül; nem exportálunk nyers kulcsot a helyi gépre, böngészőbe vagy Gitbe. A restore-próba root-only, ideiglenes területére visszafejtett kulcs a többi plaintext configgal együtt eltávolítandó. A kulcsot tartalmazó új mentés nélkül a régi sikeres backup nem bizonyítja az új TLS-állapot helyreállíthatóságát. Az offserver backup-identity továbbra a védett helyi secret-könyvtárban marad.

1. Kiadáskor a cert SHA-256, pontos SAN-ok, nyilvános kulcs hash és UTC lejárat a privát inventoryba kerül. Minden owner használati kör előtt/után a cert ellenőrzendő; 60 napon belül megújítás előkészítése, 30 napon belül hibakapu. Az automatikus értesítés a tesztelők előtti monitorfeladat; jelenleg nem állítunk aktivált ütemezést.
2. Lejárat előtt ugyanarra a két névre a meglévő, szerveren tartott kulcs/CSR segítségével új egyéves Origin CA cert készül. Kulcskompromittálódás esetén külön új kulcs/CSR és a régi cert visszavonása szükséges, nem rutinszerű ugyanazon kulcs újrahasználata.
3. Az új certet előbb külön root-only fájlban ellenőrizzük a hivatalos Origin CA gyökérrel, hostname/SAN, key-match és legalább 30 napnyi hátralévő érvényesség alapján. A korábbi certet és configot hash-ellenőrzött rollback-példány őrzi; csak ezután történik atomikus certcsere.
4. A statikus `tls` fájlcsere után **explicit `caddy reload` szükséges**: a közös proxy újraindítása nem része a megújításnak. Előtte adapt/validate, utána az új kiszolgált cert fingerprint/lejárat, Full (strict) edge és a hat korábbi konténer/route ellenőrzése. Sikertelen reload vagy működési próba esetén a korábbi még érvényes cert/config visszatöltése és validált reload történik.
5. Az új cert inventoryja és age-titkosított backupja frissítendő. Izolált Caddy certrotációs próba — új lejárat tényleges kiszolgálása és szomszédos fixture-route változatlansága — még elvégzendő, az első issuance önmagában nem bizonyít rotációt.

## Közös proxy és működési próba

A Caddy jelenlegi hálózatai megmaradnak. Az `alterward_proxy` hálózat élő csatlakoztatása mellett a közös forrás-Compose **tartós** hálózatkiegészítését is el kell menteni és render-diffben ellenőrizni; nem futtatunk `compose up`-ot a közös proxyn. A következő, külön jóváhagyott újralétrehozáskor az új csatlakozás így nem vész el. Az első kiadás csak `caddy reload`, sikeres adapt/validate után. Sikertelen validáláskor a régi config marad; újratöltés után az összes korábbi route és konténerállapot ellenőrzendő.

Külső negatív próba: login nélküli főoldal/deep link/API nem olvasható; hamis token/email, idegen Host, közvetlen IP és leszármazott/method kivétel tiltott. Pozitív próba: tulajdonosi Access OTP, 16 Official/5 Scenario, no-store/noindex, www átirányítás, mobil/asztali használat. A valódi Cloudflare peer melletti `Cf-Connecting-Ip` → API cím/rate-limit pozitív ága és header nélküli 400 ellenőrzendő. A 22 CIDR aktiváláskor összevetendő a [Cloudflare IPv4](https://www.cloudflare.com/ips-v4) és [IPv6](https://www.cloudflare.com/ips-v6) listával; drift fail-closed hibának számít, automatikus vak configcsere nincs.

Auth-próba: az egy külön jóváhagyott meghívó után a tulajdonos beállította jelszavát és belépett. A saját confirmation/sign-in, belépett felület és friss-auth export ellenőrzött. Recovery/signup, törlés-recovery/replay és támogatási válaszút még külön próba. Spambe érkező levél nem kézbesítési siker minden elfogadási pont szerint; fejlécek/alignment és válasz visszaérkezése külön bizonyíték.

## Megfigyelés és visszaállítás

Owner-próba alatt minden használati kör előtt és után az operátor ellenőrzi a web/API Docker health állapotát, a worker futó/exit/restart/OOM állapotát, a zárt és nulla-budget környezetet, a hat régi konténer változatlanságát és a `privacy:recover` összesített pending számait. Az Access login oldal külső elérhetősége az edge működését bizonyítja, nem a katalógus/backend egészségét; ezek külön saját hitelesített próba és belső health. A workerhez nem állítunk késznek még nem implementált heartbeat-healthchecket. Automatikus monitor/értesítés és pending-recovery figyelés a tesztelői meghívás előtt szükséges.

Hibás első kiadás visszaállítása: csak az alterward szolgáltatásait leállítjuk, az ellenőrzött Caddy előző fájlját visszatöltjük és validálás után reloadoljuk, megőrizzük a hibás kiadás image/config/proofját. A közös proxy nem indul újra, más app nem áll le. Az Access védelmet nem kapcsoljuk ki; a saját API-portok továbbra nem publikáltak. Működő korábbi alterward kiadás még nincs, ezért az első rollback eredménye biztonságos leállított állapot, nem egy régi, auditálatlan alkalmazási image aktiválása.

Későbbi alkalmazási rollback kizárólag a korábban auditált, helyben megőrzött image ID-ra történhet, a jelenlegi hozzáférési és privacy állapot megtartásával, ugyanazzal a teljes render/post-start őrrel. **Adatbázis-visszaállítás nem része ennek:** régi mentés nem állhat kiszolgálásba Auth/törlés/engedély-visszavonás replay nélkül. [Mentési határ](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md).

A DNS-bekötés előtt tényleges korábbi-Caddy reload, tartós proxy-hálózat visszavonás/detach, saját három szolgáltatás stop/down, majd őrzött újralaunch és scoped proxy-újraaktiválás sikeres. A harmincnapos expiry hibakapu valódi fixture-próbája és húsz külső HTTPS-próba is sikeres. A későbbi [pozitív owner Access/UI és 27 névtelen utópróba](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md) is lezárult. Saját Supabase-belépés/export később sikeres. Automatikus észlelés/riasztás, email-fejlécek/válaszút, recovery/signup, pontos IP/limiter és pozitív cache-header még nyitott; az infrastruktúra-próbákat a [domainriport](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) rögzíti.

## Megszakítás, rollback és őrzött újraindítás

Az első `--launch` szándékosan csak hiányzó Alterward-projektet és üres, saját címkéjű proxy-hálózatot enged. Ez az első indítást védi; nem általános rolling upgrade vagy credential-rotációs parancs. A Cloud-delta DELTA-01 jelzésének konkrét owner-eljárása:

1. Az előző Caddy fájl/hash visszatöltése, adapt/validate és reload; az Alterward route eltűnésének és a korábbi route-ok változatlanságának ellenőrzése.
2. SIG-01 kezelése: a közös Compose tartós Alterward-hálózatkiegészítését is visszavonjuk, hash- és render-ellenőrzéssel. Ha a közös config közben más jogos módosítást kapott, csak a saját hálózatkiegészítést távolítjuk el, nem írjuk vakon vissza a teljes régi fájlt. A renderből igazoltan hiányoznia kell az Alterward-csatlakozásnak; így későbbi proxy-recreate sem kapcsolhatja vissza idő előtt. A már rögzített közös Caddy konténert kizárólag az új `alterward_proxy` hálózatról leválasztjuk. A `ghost_default` és `web_proxy` kapcsolat megmarad. Nem indul újra vagy jön létre újra a proxy.
3. Csak az `alterward-owner` projekt áll le; a frozen config és minden privát bizonyíték megmarad:

```text
docker compose --project-name alterward-owner -f /root/alterward-ops/owner/effective-compose.json down --remove-orphans
```

4. A projekt konténereinek hiánya, az új hálózat üressége és a korábbi hat konténer/route ismét igazolt. Változatlan env/image mellett ezután ugyanaz a hash-kötött `--launch` fut; nincs kézi, őr nélküli `up`. Sikeres új post-start proof után a scoped Caddy tartós hálózatmerge, csatlakozás és reload ismét elvégezhető. Ez a teljes hálózatleválasztás és sajátprojekt-stop, majd őrzött újralaunch/proxy-merge/connect/reload a DNS-bekötés előtt ténylegesen sikeres volt; a korábbi hat alkalmazás és route változatlan maradt.

Megváltozott env/image/CA esetén a régi stage külön root-only, hash-ellenőrzött archívumba kerül, nem vak felülírással frissül. Csak teljes új preflight/stage-proof és alkalmazási változásnál új image/audit/célpróba után indulhat új release. Az automatikus upgrade/re-stage jövőbeli ops-fejlesztés, nem az első owner-kiadás előfeltétele.

DELTA-02: a szerveroldali indító SIGHUP/SIGTERM/SIGINT jelzést normál kivétellé alakít, ezért a már elkezdett indítás sajátprojekt-takarítása lefut; a takarítás idejére a további megszakításokat figyelmen kívül hagyja. A jelkezelés és a kivétel utáni cleanup célzott próbái sikeresek; valódi SSH-disconnect-próba még nincs. SIGKILL, hosthiba vagy elveszett végső SSH-válasz után nem feltételezünk leállást: először a projekt állapotát, image/env/health és proof meglétét kell ellenőrizni. Bizonytalan esetben a fenti sajátprojekt-`down`, majd új őrzött launch következik; addig nincs Caddy/DNS aktiválás.

## Valódi Session pooler TLS-bizonyíték

Az első pre-start queue-próba biztonságosan megállt, a saját konténerek eltávolítva: a `pg_stat_ssl` a PostgreSQL által látott belső pooler-kapcsolatot méri, amely itt false; mind az öt queue üres. Ez nem a Contabo → Session pooler kapcsolat TLS-állapota. A javított one-off próba az image saját pg kliensének tényleges TLSSocketjét, encrypted/authorized állapotát, a rögzített CA és `rejectUnauthorized=true` megmaradását, valamint a peer cert hostname-egyezését ellenőrzi. A `pg_stat_ssl` külön tájékoztató mező, nem helyettesíti ezt. A read-only tranzakció és öt queue továbbra kötelező.

A Contabón sikeres: `databaseTlsVerified=true`, `databaseTlsHostnameVerified=true`, `postgresBackendSeesTls=false`, `pendingJobs=0`; ez a saját klienskapcsolat bizonyítéka, nem a Supabase belső hálózatának teljes auditja. A pg belső `client.connection.stream` megfigyelése kizárólag operátori probe, driver-frissítéskor új tényleges próba kell. Az alkalmazási image és adatbázis-kód nem változott. [pg SSL-beállítás és connectionString határ](https://node-postgres.com/features/ssl).

## Korábbi belső checkpoint: alkalmazási rollback és előkészített proxy

2026-10-09T06:42:48Z: kizárólag az Alterward három szolgáltatása leállítva és eltávolítva, worker exit 0 és OOM nélkül; saját proxy-hálózat üres, hat korábbi konténer változatlan. Változatlan image/env/config/CA mellett az őrzött újralaunch és a teljes post-start guard ismét sikeres, négy anonim tiltás és öt üres queue, hitelesített kliens TLS. Ez alkalmazási stop/down/újraindítási próba; közös Caddy reload, tartós hálózatmerge/detach és DNS-rollback még nem történt.

A közös Caddy/Compose eredeti fájlja és hash-e root-only előkészítési mentésbe került; a meglévő route-okhoz hozzáfűzött scoped Alterward candidate syntax-adaptja és a külön tartós hálózat-kiegészítési render sikeres. A tanúsítványos validate, valódi forrásfájl-merge, hálózatcsatlakozás és reload még nincs. A renderelt Compose nem írható vakon a közös YAML helyére: a tényleges merge megőrzi az eredeti más szolgáltatásokat, környezeti hivatkozásokat és hálózatokat.

## Későbbi tényleges domainaktiválás

2026-10-09: Origin CA kiadva/telepítve; a közös Caddyfile inode-megőrzéssel frissítve és explicit reloadolva, a közös Compose-ba csak a saját külső hálózat/csatlakozás került. Tényleges teljes proxy/alkalmazási rollback, majd ismételt guarded launch/merge/connect/reload sikeres; közös proxy restart/recreate nélkül. Proxied apex/www rekordok aktívak, kilenc mail-rekord és hat korábbi konténer/route változatlan. Az új 36 fájlos titkosított TLS/owner config-backup izolált restore-ja és a húsz külső anonim HTTPS-próba sikeres. Pozitív tulajdonosi Access/Auth/UI, cache/IP és levelezés még külön bizonyíték. [Eredmények és megmaradó kapuk](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md).
