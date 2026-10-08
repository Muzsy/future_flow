# alterward — izolált célkörnyezeti telepítési próba

2026-10-09 · [Éles kiadás](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Mentés/restore](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Mentett Access-konfiguráció](CLOUDFLARE_ACCESS_CONFIGURATION_HU.md).

## Előkészített végrehajtó

[Windows operátori indító](../scripts/contabo-target-rehearsal.mjs), [szerveroldali build/runtime próba](../scripts/ops/contabo-target.py), [HTTP/TLS ellenőrző](../scripts/ops/contabo-target-check.mjs). A próba nem aktiválja a DNS-t, meglévő Caddyt, éles adatbázist vagy AI-keretet. **A jelen checkpoint a végrehajtó előkészítése; sikeres célkörnyezeti futás még nincs rögzítve.**

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
- Mindhárom runtime internetes TCP-próbája blokkolt; provider credential csak használhatatlan fixture-érték, élő Supabase/AI-kapcsolat nincs. Fizetett UUID-lista üres, béta-időszak inaktív, minden termék feature alapértéken false.
- Üres queue mellett worker SIGTERM-leállás 0 kilépési kóddal, OOM nélkül; csak a saját Compose-projekt/network/fixture takarítása.
- A korábbi konténerek azonos ID-val, restart-számmal és futó állapottal maradnak meg a build és a runtime-próba után.

A source-archívum öt biztonsági próbája a normál Git-directory és fájl esetét, private pathok, alias/abszolút út, links/device és duplicate fájlok tiltását vizsgálja. Az eredeti nyolc backup-teszttel együtt **13 célzott próba** helyben sikeres; CI verify ugyanazokat futtatja. Titkos helyi fájl és symlink nem kerülhet a buildforrásba. A privát eredmény a Gitből és buildből kizárt `.local/contabo-release/` alatt marad; siker után titokmentes összegzés kerül ide.

## Az éles kapu megmarad

Az izolált próba nem valódi Access OTP-belépés, Supabase invite/recovery, kifelé működő origin DNS/TLS, kliens-IP/rate-limit, valódi AI vagy aktív job drain. Ezek a védett élesítés külön próbái. Retention/törlésvédett restore és a végleges kiadási flag-mátrix után kötelező a konkrét main commit [részletes Claude Cloud-auditja](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md). A CI tesztkörnyezetet a végrehajtó nem állítja be hamisan: ez külön, kifejezetten a Contabo célgépre készített próba.
