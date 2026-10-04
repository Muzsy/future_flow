# alterward — Contabo üzemeltetési előkészítés

2026-10-04 · Az [olvasási audit](CONTABO_SERVER_AUDIT_HU.md) utáni végrehajtott változások. [Telepítési útmutató](DEPLOYMENT_HU.md) · [Következő lépések](NEXT_STEPS.md).

## Elvégzett szervermódosítás

A felhasználó engedélyezte a folytatást, és megerősítette, hogy más személy vagy automatizmus nem használ jelszavas SSH-belépést. Külön Ed25519 üzemeltetői kulcs készült a helyi, checkouton kívüli védett titokmappában. A szerver authorized_keys fájljába atomikusan került be, a meglévő kulcs megőrzésével. Az új kulcshoz agent-, port- és X11-forwarding tiltás tartozik; normál terminálhasználat lehetséges.

A `/etc/ssh/sshd_config.d/00-alterward-ops.conf` kikapcsolja a PasswordAuthentication, KbdInteractiveAuthentication és X11Forwarding beállításokat; PermitRootLogin prohibit-password. A root belépés kulccsal megmarad. Konfigurációellenőrzés és háromperces automatikus visszaállítási időzítő után csak SSH reload történt. Friss SSH-kapcsolaton a kulcsos belépés sikeres, a korábban működő jelszavas belépés elutasított; az időzítőt ezután leállítottuk. További új kulcsos kapcsolat és sshd -t is sikeres. Nem volt SSH-restart, VPS-reboot vagy tűzfalmódosítás.

Privát kulcs: `%LOCALAPPDATA%\FutureFlow\secrets\contabo_alterward_ed25519`. Hostpin: ugyanitt `contabo_known_hosts`; kulcsfingerprint `SHA256:+XzYZuYmN0uURJuCSrZL8o4burqsWeO+zmuuV8aeXxs`. A privát kulcs nem kerül Gitbe, Docker-image-be vagy a dokumentációba. A hostpin első használatkor rögzített; Contabo/VNC felületen végzett független hostfingerprint-ellenőrzés még nincs. Eltérő hostkulcsot nem fogadunk el automatikusan.

Windows OpenSSH-ból a védett kulccsal és pinfájllal lehet belépni; a SERVER_IP helyére a saját fájlban szereplő IP kerül:

```powershell
ssh -i "$env:LOCALAPPDATA\FutureFlow\secrets\contabo_alterward_ed25519" -o "UserKnownHostsFile=$env:LOCALAPPDATA\FutureFlow\secrets\contabo_known_hosts" -o StrictHostKeyChecking=yes root@SERVER_IP
```

A privát kulcs jelszó nélküli, helyi Windows ACL védi. A gép elvesztése esetére külön biztonságos kulcsmentés és Contabo-konzolos hozzáférés szükséges. Az SSH-jelszavas tiltás nem változtatta meg a rendszer jelszavát; szükség esetén a szolgáltató konzolja a helyreállítási út. Külön, korlátozott üzemeltetői felhasználó bevezetése további lépés.

## Mentés és telepítési fájlok

Hat meglévő konfigurációfájl első állapotú másolata, hash-ekkel és manifesttel, a helyi védett `contabo_ops_baseline_20261004` könyvtárba került. Tartalmazza a meglévő Caddy/Compose és SSH-konfigurációt; az eredeti authorized_keys külön mentése is megvan. Ez konfigurációmentés, nem teljes VPS-, adatbázis- vagy offsite-mentés, és nem bizonyított restore.

Az [elkülönített Contabo Compose](../deploy/compose.contabo.yaml) a meglévő alapból csak a web/API/worker szolgáltatásokat veszi át. Saját proxy és nyilvános alkalmazásport nincs. A web/API az `alterward_proxy` külső hálózaton, stabil DNS-aliasokkal érhető el; a worker külön bridge hálózaton kap kifelé elérést. Az opcionális ALTERWARD_PROXY_NETWORK a CI-ben külön teszthálózatot választ, éles alapértéke alterward_proxy.

| Szolgáltatás | Memória maximum | CPU maximum | Node heap maximum |
|---|---:|---:|---:|
| web | 1024 MiB | 1 | 512 MiB |
| API | 768 MiB | 0,75 | 384 MiB |
| worker | 1024 MiB | 1 | 512 MiB |

Összesen 2816 MiB és 2,75 CPU felső korlát. Mindhárom szolgáltatás init folyamatot, 256-os PID-korlátot, cap_drop ALL és no-new-privileges beállítást kap; a Dockerfile nem root runtime-ját használja. A naplókorlát szolgáltatásonként 10 MB ×3 fájl. Ezek kezdeti korlátok, nem mért terhelési garanciák; az image-build csúcsmemóriáját nem korlátozzák.

A [Caddy site-minta](../deploy/Caddyfile.contabo.example) és [proxy-hálózat kiegészítés](../deploy/compose.proxy-attachment.example.yaml) a meglévő proxyhoz illeszkedik. A példa hostname nem aktiválható. A hálózat, route és kiegészítés még nincs bekapcsolva. A proxy Compose up módosítása konténer-újralétrehozást okozhat; a bekötést és tartós konfigurációt együtt, a többi alkalmazás megőrzésével kell végrehajtani. [Docker hálózatok](https://docs.docker.com/compose/how-tos/networking/).

## Ellenőrzés és annak határa

A Contabo Docker 29.1.3 / Compose v5.1.4 pluginjával a [deployment preflight](../scripts/verify-deployment.mjs) sikeres. Csak helyettesítő értékeket használt: három szolgáltatás, nulla publikált alkalmazásport, 2816 MiB összkorlát, külön secret-határok, verified DB TLS/CA-mount, nulla kezdeti AI-keret. A szerver root-only előkészítő könyvtárában kis konfigurációs fájlok maradtak; image-build vagy konténerindítás nem történt.

A jelenlegi proxy forrás-Compose fájljával összeolvasztott hálózatkiegészítés parszolható. Mindkét korábbi hálózat megmarad, a többi normalizált beállítás pontosan egyezik. A jelenlegi Caddyfile és a példaroute együtt sikeresen adaptálható, de nem lett betöltve. Az adaptálás szerkezeti ellenőrzés; nem certificate-kiadás vagy élő upstream-próba. [Caddy adapt/reload](https://caddyserver.com/docs/command-line).

A [CI container job](../.github/workflows/ci.yml) új [futáspróbája](../scripts/smoke-deployment.mjs) az alkalmazás-image-et, web/API/worker/Caddy együttműködést, 001–007 migrációkat és megismételt checksum-ellenőrzést vizsgálja. Külön, üres PostgreSQL 16 fixture és rövid életű teszt-CA van; DB- és HTTPS-lánc/hostname ellenőrzés végig bekapcsolva. A teszthálózatokból kimenő internetelérés tiltott, nincs valódi Supabase/Auth/AI-kulcs vagy felhasználói adat, nincs generálási job. Ellenőrzi az API 401 választ a proxyn keresztül, a worker mindkét üres queue-pollját és kényszerleállítás nélküli megállását; végül takarít. Az új CI-futás eredményét külön rögzítjük. Ez nem éles Contabo-smoke vagy valódi Auth/AI-próba.

## Nyitott operatív döntések

A friss Caddy-naplók hiányzó certificate privátkulcs- és metaadatfájlokat, ALPN challenge 403 és egy ACME connection-refused hibát mutatnak. Nincs manuális certificate-loader a lemezes konfigurációban. Az aktív domainnevek, a certificate storage teljessége és a DNS/proxy/ACME útvonal tisztázandó. A szolgáltatói/proxys DNS más IP-je önmagában nem bizonyít hibás DNS-t. A domainnevek és részletes leltár csak helyben találhatók `.local/server-audit/PRIVATE_TLS_FINDINGS_HU.md` alatt; más oldalak route-ját nem töröltük.

Függő kernel-reboot és csomagkarbantartás, két korábbi failed unit és több meglévő alkalmazás miatt üzemeltetési időablak kell. A Docker és Tailscale miatt a helyi tűzfalszabályokat a jelenlegi szolgáltatások és provider firewall leltárával kell megtervezni; egyszerű UFW-enable nem igazolt védelem. [Docker és tűzfal](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Az alterward domain, éles secret-/Supabase-környezet, külön éles AI-keret, teljes backup/restore, karbantartási ablak és élő kliens-IP/rate-limit/terheléspróba még hiányzik. A fejlesztői 5–5 USD AI-keretekből ebben a munkában nem költöttünk. Alkalmazás-élesítés nem történt.
