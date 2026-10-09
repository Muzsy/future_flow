# alterward — izolált célkörnyezeti telepítési próba

2026-10-09 · [Éles kiadás](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Mentés/restore](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Mentett Access-konfiguráció](CLOUDFLARE_ACCESS_CONFIGURATION_HU.md).

## Előkészített végrehajtó

[Windows operátori indító](../scripts/contabo-target-rehearsal.mjs), [szerveroldali build/runtime próba](../scripts/ops/contabo-target.py), [HTTP/TLS ellenőrző](../scripts/ops/contabo-target-check.mjs). A próba nem aktiválja a DNS-t, meglévő Caddyt, éles adatbázist vagy AI-keretet. **A korlátozott célgépi build és a teljes izolált web/API/worker próba sikeres, a négy owner-katalógus flag bekapcsolásával is.**

```powershell
node --env-file=.env scripts/contabo-target-rehearsal.mjs
node scripts/contabo-target-rehearsal.mjs --runtime-existing
```

Az első parancs tiszta, commitolt checkoutot igényel; annak Git-archívumát küldi a hostpinnel és külön SSH-kulccsal védett kapcsolaton a Contabóra. Csak három publikus webes buildérték jut az image-be; Supabase admin-, adatbázis-, SMTP- vagy OpenAI-kulcs nem. A publishable/anon szerepkör külön ellenőrzött. A második parancs a korábbi image ID-ra rögzített runtime-próbát ismétli, új build nélkül.

A gépen nincs Buildx és a jelen apt metadata nem kínálja a plugint. A végrehajtó a Docker hivatalos **Buildx v0.38.0** kiadását külön root-only könyvtárba tölti, a release API-ból ellenőrzött, kódba rögzített SHA-256 alapján. A host Docker/Compose változatát és más alkalmazások beállítását nem cseréli. A builder külön Docker-container driver, **2 GiB RAM/swap és 1 CPU**, legfeljebb egy párhuzamos buildlépés; a tényleges limitet inspecttel ellenőrzi, a saját builderét utána eltávolítja. [Hivatalos kiadás](https://github.com/docker/buildx/releases/tag/v0.38.0), [driver és erőforráslimitek](https://docs.docker.com/build/builders/drivers/docker-container/).

## Elfogadási pontok

- Rögzített commit/Git-archive hash/image ID; runtime user `node`; build előtt legalább 4 GiB rendelkezésre álló memória és 12 GiB szabad tárhely.
- A valódi Contabo Compose-csomag web/API/worker szolgáltatásai, összesen 2816 MiB korláttal; nincs publikált alkalmazásport.
- Külön internal Docker-hálózatok és ideiglenes PostgreSQL 17; 001–036 migrációk és ismétlés, a tényleges DB-kapcsolat TLS-e igazolt.
- Külön Caddy csak privát hálózaton, ideiglenes CA-val; HTTPS hostname-validálás és hibás hostname elutasítása. Ez nem az alterward.com origin-tanúsítványának bizonyítéka.
- A dashboardról rögzített fő Access team/AUD és owner-lista az originben; hiányzó/hamis Access token, védett útvonal, leszármazott és tiltott method elutasított. Account access/privacy és tényleges statikus asset olvasható, saját export/törlés Supabase Auth nélkül 401.
- Mindhárom runtime internetes TCP-próbája blokkolt; provider credential csak használhatatlan fixture-érték, élő Supabase/AI-kapcsolat nincs. Fizetett UUID-lista üres, béta-időszak inaktív; Official/Discovery/Collections/Scenarios a tényleges owner-konfiguráció szerint true, a többi termékflag false.
- Indulás előtt a renderelt web/API kapu pontos team/AUD/email egyezése és true állapota ellenőrzött; API/worker nulla keret, üres UUID-lista és inaktív időszak külön ellenőrzött.
- A tényleges előkészített alterward.com/www Caddy-szabály nyolc közvetlen kérést tilt, hamis Cloudflare/IP fejlécekkel is. Más webhely szabályát nem módosítja; a pozitív Cloudflare peer/IP-továbbítás még élő próba.
- Üres queue mellett worker SIGTERM-leállás 0 kilépési kóddal, OOM nélkül; csak a saját Compose-projekt/network/fixture takarítása.
- A korábbi konténerek azonos ID-val, restart-számmal és futó állapottal maradnak meg a build és a runtime-próba után.

A source-archívum öt biztonsági próbája a normál Git-directory és fájl esetét, private pathok, alias/abszolút út, links/device és duplicate fájlok tiltását vizsgálja. A hatodik próba az örökölt host-kulcsok/DB/béta flag-ek kiszűrését igazolja: a Compose környezete nem írhatja felül a dummy fixture-t. A hetedik próba hibás/hiányzó kapu, eltérő email/AUD, pozitív allowance, UUID vagy induló időszak esetén megállítja az owner-indítást. Az eredeti nyolc backup-teszttel együtt **15 célzott próba** helyben sikeres. Titkos helyi fájl és symlink nem kerülhet a buildforrásba. A privát eredmény a Gitből és buildből kizárt `.local/contabo-release/` alatt marad.

## Tényleges célgépi checkpoint

A `5e9ea9fa7ffbd89aa2ad5016f28b0f10984ff122` main commit [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37864212253) verify/container sikeres. Helyi teljes check: 667 sikeres teszt, két korábbi Windows symlink-kihagyás, 63 fájl és production build. Ennek tiszta Git-forrásából a Contabón, a tényleges publikus Supabase buildértékekkel elkészült a `node` useres image, saját 2 GiB/1 CPU builderrel, publikált port nélkül. A builder eltávolítva, a hat meglévő konténer ID/restart/állapot változatlan. Éles DB/admin/AI kulcs nem jutott a buildbe.

Az izolált runtime 001–036 migrációja és ismétlése, web/API és a privát HTTPS elindult. A hibás SNI-t a Caddy már a handshake során elutasította; a próba ezután a normál fixture-SNI mellett külön `checkServerIdentity` hívással teszteli a hibás tanúsítványnevet, új kapcsolatban, változatlan CA/`rejectUnauthorized` validálással. A teljes próba következő körében a worker újraindult: a régi budget parser üres béta-lista és minden allowance 0 mellett is 30 napos ablakot követelt. Ez ütközött az elfogadott, telepítéstől független bétaindulással. A javítás kizárólag e teljesen inaktív konfigurációt engedi időszak nélkül; UUID, pozitív allowance vagy inicializált költés esetén a korábbi szigorú időszak-kapu megmarad. A foglalás üres listán provider/DB-hívás előtt elutasított mindkét providernél.

Az első sikertelen próba után új alkalmazási image és ismételt runtime-próba volt szükséges; ezek eredménye az alábbi checkpointban szerepel. A saját fixture-konténerek/hálózat/ideiglenes kulcsok takarítása a sikertelen próba után is lefut; privát hibadiagnosztika mentett, nyers napló nem kerül a dokumentációba.

## Sikeres ismétlések és verzióhatár

Az 5e9 image ID: `sha256:771553f10a90a0f3bc89d84c054bf421c5ff1344a426933e2d9a83977a00ef15`. Az új image teljes runtime-próbája, majd a négy valós katalógusflaggel ismételt próba sikeres. A Caddy-peer-védelem hozzáadása után a harmadik próba is sikeres: 36 migráció és ismétlés, DB TLS, 11 Access-tiltás, 8 közvetlen alterward/www kérés tiltása, két rights oldal/három asset, két sajátadat-kérés Auth nélkül 401, hibás cert-hostname elutasítás, három egress-tiltás, worker SIGTERM 0 és teljes fixture-takarítás. Fizetett AI-hívás és éles DB-kapcsolat 0; meglévő hat konténer változatlan. Előkészített Caddy fájl SHA-256: `d686de994ef2a950b6fec6be1a484b5b67f88940787d46a155613c3fc9918a33`.

E bizonyíték az 5e9 alkalmazási image-hez és a privát proofban rögzített operátori script/config hash-ekhez tartozik. A Cloud-auditban később javított fióktörlési hiba új alkalmazási commit/image és ismételt célpróba előtt még nem élesíthető. A végső image-et a végső auditált kóddal kell egyeztetni.

## Az éles kapu megmarad

Az izolált próba nem valódi Access OTP-belépés, Supabase invite/recovery, kifelé működő origin DNS/TLS, kliens-IP/rate-limit, valódi AI vagy aktív job drain. Ezek a védett élesítés külön próbái. Retention/törlésvédett restore és a végleges kiadási flag-mátrix után kötelező a konkrét main commit [részletes Claude Cloud-auditja](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md). A CI tesztkörnyezetet a végrehajtó nem állítja be hamisan: ez külön, kifejezetten a Contabo célgépre készített próba.

## Végső alkalmazási image és teljes owner-őr

2026-10-09: az Auth recovery javítását tartalmazó `35f9889818a5a86d1c8059d1bdb5af70ced527cc` [main CI-je](https://github.com/Muzsy/future_flow/actions/runs/37866916470) verify/container sikeres. Teljes helyi check 669 sikeres + két Windows symlink-kihagyás / 63 fájl. A valódi Contabo image ID `sha256:77153dc07658c5172304dfaebaf1bc859fb02947f240de2e8a70cc69afc238f9`; clean Git-forrás, builder 2 GiB/1 CPU, eltávolítva. A teljes izolált próba az új image-en sikeres, majd a teljes owner-feature őrrel és explicit origin cert/key snippet mellett megismételve is sikeres, ugyanazon 11+8 tiltással és nulla AI-költéssel. A legújabb snippet SHA-256 `a16179023f01cbfbef1957a96d01148bb85cf6e8a3a584d305e4f5b7cfd683ac`; csak a cert forrása helyettesített fixture-ben, a valódi cert még nincs kiadva. Mind a hat régi konténer változatlan, fixture-takarítás kész.

A külön [valódi owner preflight](../scripts/contabo-owner-preflight.mjs) az aktuális védett env-et renderelte a célgépen: minden owner-mátrix érték egyezik, mindhárom szolgáltatás image ID-ra rögzített, automatikus pull tiltva, port nincs, providerkulcs használhatatlan, időszak inaktív. Konténerindítás/DB/provider hívás 0, átmeneti credential-fájlok törölve. A bővített parser/mátrix és eredeti backup/source határok 17 próbája sikeres. Az alkalmazási image a 35f9889 forrásból készült, az új ops-code külön betöltött és hash-elt; nem állítjuk, hogy e két source-verzió azonos. [Aktiválás és rollback](CONTABO_OWNER_ACTIVATION_RUNBOOK_HU.md) · [Audit és határok](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).
