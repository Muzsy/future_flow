# alterward — Contabo szerveraudit

2026-10-04 · [Telepítési terv](DEPLOYMENT_HU.md) · [Aktuális állapot](STATUS_HU.md).

**Történeti auditpillanatkép:** ez a 2026-10-04 08:30–08:36 UTC közötti, kizárólag olvasási vizsgálat eredménye. Az alábbi jelszavas SSH- és csomagolási hiányok azóta részben megoldódtak: kulcsos SSH/jelszavas tiltás, védett config/storage mentés, Contabo Compose/proxy preflight és teljes izolált runtime CI kész. [Végrehajtott előkészítés és jelenlegi nyitott feladatok](CONTABO_PREPARATION_REPORT_HU.md). Az audit mért értékeit nem írjuk át későbbi állapotra; éles alterward még nem fut.

## Az auditkori következtetés

**A szerver kapacitása megfelelőnek tűnik az alterward korlátozott angol bétájához; az éles indulás üzemeltetési feltételekhez kötött.** A felhasználó által megadott második belépési párossal sikeres SSH-kapcsolat és belső, kizárólag olvasási audit történt. A pillanatnyi erőforrásadatok alapján most nem látunk indokot nagyobb VPS vásárlására. Ez mérési adatokból levont mérnöki következtetés, nem terhelésteszt vagy rendelkezésreállási garancia.

Indulás előtt a meglévő Caddyhez illesztett telepítést, SSH/tűzfal-védelmet, tanúsítványkezelést és mentés/visszaállítást rendezni kell. A szerveren több más alkalmazás és ügynök is működik; az alterward elkülönített konténerekben, a meglévő szolgáltatások megőrzésével kerülhet ide. **Az eredeti saját proxy 80/443 portkötése itt ütközne.**

Nem történt telepítés, frissítés, restart, tűzfalmódosítás vagy fizetős AI-hívás. A jelentés nem élesítési engedély és nem jelenti a teljes web/API/worker működés kipróbálását.

## Ellenőrzött erőforrások

Belső mérés: 2026-10-04, körülbelül 08:30–08:36 UTC / 10:30–10:36 Europe/Budapest. Rövid, terhelést nem generáló mintavétel; a megadott szerveren kívül más gépet nem szkenneltünk.

| Terület | Tényleges eredmény | Értékelés |
|---|---|---|
| OS | Ubuntu 24.04.4 LTS, x86_64, KVM | Támogatott Linux/Docker platform |
| CPU | 4 vCPU, AMD EPYC | A kezdeti három alkalmazásfolyamathoz megfelelőnek tűnik |
| Memória | 8 326 955 008 byte, körülbelül 7,76 GiB; elérhető 5 268 434 944 byte, körülbelül 4,91 GiB | Jelenleg érdemi tartalék a meglévő munkaterhelések mellett |
| Swap | Nincs | Nem közvetlen telepítési akadály; nagy helyi build és memóriaugrás külön kockázat |
| Tárhely | Root ext4: 145 GiB összesen, 74 GiB használt, 71 GiB szabad | Image-ekhez, előző release-hez és korlátozott naplókhoz jelenleg elég tartalék |
| Inode | Körülbelül 5% használt | Nem látszik inode-hiány |
| Load | 0,41 / 1,01 / 1,35 | A 4 vCPU-hoz viszonyítva a méréskor nem túlterhelt |
| Rövid CPU-minta | 88–93% idle, 0% steal a két egy másodperces mintában | Pillanatnyi adat; nem bizonyít tartósan szabad kapacitást |
| Memórianyomás | 10/60/300 másodperces PSI átlag: 0 | A méréskor nem látszott memórianyomás |
| Uptime / idő | 159 nap; NTP szinkronizált; Europe/Berlin | Függő karbantartást külön figyelembe kell venni |

Ubuntu 24.04 LTS standard biztonsági támogatása 2029 májusáig tart; a Docker hivatalosan támogatja ezt a 64 bites Ubuntu-verziót. [Ubuntu támogatási ciklus](https://ubuntu.com/about/release-cycle), [Docker platformok](https://docs.docker.com/engine/install/ubuntu/).

Az alkalmazás Next web, Nest API és folyamatos worker szerepe külön konténerben futhat. Az adatbázis/Auth Supabase, az AI OpenAI API; nincs helyi modellfuttatás vagy GPU-igény. A későbbi felhasználószámot és párhuzamosságot tényleges futásmérésből kell meghatározni. Kezdetben egy worker, korlátozott generálás, memóriafigyelés és lehetőleg CI-ben épített image javasolt.

## Futó környezet és csomagolás

- Docker Engine 29.1.3; Docker Compose plugin v5.1.4; a jelenlegi YAML-t a tényleges szerver `docker compose config --quiet` parancsa hibamentesen elfogadta, kizárólag helyettesítő env-értékekkel.
- Hoston Node 22.22.2 van. Ez közvetlen hostos alterward-indításhoz eltér a projekt Node 24 követelményétől; a tervezett Node 24 Docker image ezt önállóan biztosítja. Más alkalmazások Node-verzióját nem cseréltük le.
- Hat futó Docker-konténer, köztük web/backend, két PostgreSQL és két Caddy; ezen kívül hostos ügynök- és háttérszolgáltatások működnek.
- Docker image-ek összesen körülbelül 6,78 GB, két aktív volume körülbelül 542 MB. Nem történt image/cache/volume takarítás.
- A futó konténerek automatikus restart policyval rendelkeznek. Docker daemon engedélyezett; SSH socket aktív és engedélyezett. A külön `ssh.service` disabled állapota itt nem jelenti a socketes indulás hiányát.
- Konténerenkénti memória/CPU-korlát nem volt beállítva a meglévő konténereken. A hostos ügynökök jelentős memóriát használnak, így az alterward számára megmaradó tartalékot később is figyelni kell.

A YAML-ellenőrzés csak konfigurációparszolás: nem épített vagy indított konténert, nem alkalmazott migrációt, és nem ellenőrizte a még nem telepített alterward runtime-ot. A `298bdca` runtime commit Linux image-buildje és production web healthcheckje külön, már sikeres [GitHub CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37164982359).

## Proxy és HTTPS

A 80/tcp és 443/tcp portokat a meglévő publikus Caddy konténer publikálja IPv4-en és IPv6-on. Verzió: Caddy 2.11.3. A proxy a `ghost_default` és `web_proxy` Docker-hálózatokhoz csatlakozik; konfigurációja és tanúsítványtára hoston tartós bind mount. A hostos Caddy bináris hiánya ezért nem telepítési hiányosság.

A lemezen lévő Caddyfile strukturális ellenőrzése hat konfigurált hostname-et talált. Ezeknél a helyi 443-as porton, a megfelelő SNI-névvel, normál tanúsítvány-ellenőrzéssel végzett próba eredménye:

| Anonim azonosító | TLS-eredmény |
|---|---|
| existing-host-1 | Lejárt tanúsítvány |
| existing-host-2 | Hostname és lánc érvényes; tanúsítvány lejárata 2026-10-31 |
| existing-host-3 | Lejárt tanúsítvány |
| existing-host-4 | TLS-kézfogási belső hiba |
| existing-host-5 | Hostname és lánc érvényes; tanúsítvány lejárata 2026-10-31 |
| existing-host-6 | Lejárt tanúsítvány |

A konkrét domainnevek külön helyi, Gitből kizárt operatív jegyzetben maradtak; a verziózott riport anonimizált. A konfigurált nevek nem feltétlenül mind aktívan használt oldalak. Az eredmény nem az adott alkalmazások teljes funkcionalitásának vizsgálata.

Az elmúlt 48 órából kiválasztott utolsó 600 strukturált Caddy naplósorban 144 TLS warning/error szerepelt, köztük certificate/renewal, challenge és unauthorized jelzések. Ez korlátozott naplóminta, nem az összes hibák száma vagy bizonyított gyökérok. A használt domainnevek DNS/ACME feltételeit és a megújulási hibák okát rendezni kell; az elhagyott nevekről külön döntés szükséges. Tanúsítvány-ellenőrzést nem kapcsoltunk ki. [Caddy automatikus HTTPS](https://caddyserver.com/docs/automatic-https).

**Javasolt alterward-topológia:** a meglévő publikus Caddy kapjon új hostname-route-ot; alterward web/API egy külön proxy-hálózaton kapcsolódjon hozzá, hostos 3000/4000 publikálás nélkül. A workernek nem kell a proxy-hálózatra csatlakoznia. Az új hálózatot a meglévő proxy forrás-Compose konfigurációjában is tartósan rögzíteni kell; egy kézi network connect önmagában nem elég egy későbbi konténer-újralétrehozáshoz.

A jelenlegi [Compose](../deploy/compose.yaml) saját Caddy szolgáltatását ezen a gépen ki kell váltani a közös proxyval. A megfelelő fájlok elkészítése és ellenőrzése későbbi telepítési lépés; audit közben a meglévő hálózat/route nem változott. Az `API_TRUST_PROXY=1` egyetlen Caddy-hop és kizárólag zárt upstream mellett maradhat; a tényleges klienscím/rate-limit éles próba szükséges. [Caddy proxybeállítások](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Hálózat és külső függőségek

| Ellenőrzés | Eredmény | Határ |
|---|---|---|
| Kívülről 22/80/443 | TCP elérhető; HTTP 308/Caddy | Nem rendelkezésreállási mérés |
| Kívülről 3001 | TCP elérhető | Egy meglévő második Caddy HTTP-portja közvetlenül nyilvános |
| Kívülről 8000/8085 | Kapcsolat elutasított | Ezek a helyi listener-inventárban loopbackre kötöttek; nem találtunk nyilvános elérést |
| Szerver → OpenAI API | Normál TLS-ellenőrzéssel HTTP 401 | Kulcs nélküli elérhetőségi próba, nem fizetős generálás |
| Szerver → Docker registry | Normál TLS-ellenőrzéssel HTTP 401; CDN root 403 | DNS/TLS/HTTP elérhető; tényleges image-pull nem történt |
| Szerver → Supabase Auth | DNS/TCP és TLSv1.3, lánc/hostname ellenőrzés sikeres; kulcs nélküli HTTP 401 | Nem valódi bejelentkezés |
| Szerver → Supabase DB | 5432/tcp és PostgreSQL SSLRequest; a projekt ellenőrzött Supabase CA-jával TLSv1.3 és hostname/lánc sikeres | Nem SQL-hitelesítés vagy DB-írás |

A Supabase DB a host alap CA-tárával nem volt ellenőrizhető; a projekt saját, korábban ellenőrzött CA-jával működött. A későbbi `DATABASE_SSL_CA_HOST_FILE` read-only mount ezért szükséges. Kizárólag a publikus CA-tanúsítvány került a vizsgálati folyamat memóriájába; DB-jelszó, admin- vagy AI-kulcs nem lett átadva a szervernek. Nincs `rejectUnauthorized=false` vagy TLS-megkerülés.

## Indulás előtt rendezendő üzemeltetési pontok

| Prioritás | Megállapítás | Következő lépés |
|---|---|---|
| P1 | `PermitRootLogin yes`, `PasswordAuthentication yes`; publikus SSH elérhető | Külön üzemeltetői account és kipróbált SSH-kulcs, majd a szükséges root/jelszavas hozzáférés szűkítése hozzáférésvesztés nélkül |
| P1 | UFW inaktív; IPv4/IPv6 INPUT alap policy ACCEPT; DOCKER-USER lánc üres; fail2ban nem található | Docker- és Tailscale-kompatibilis, ténylegesen ellenőrzött bejövő szabályozás; a Contabo oldali firewall állapota nem ismert |
| P1 | Három lejárt TLS-tanúsítvány és egy kézfogási hiba a konfigurált nevek között | Használt/elhagyott domainleltár, DNS/ACME hibaok, megújulás és tanúsítvány-monitorozás |
| P1 | Meglévő publikus proxy foglalja a portokat | Közös Caddy route, külön alterward hálózat és konténerek; a saját proxy portkötését nem indítjuk el |
| P1 | VPS teljes külső mentése és Supabase restore nem igazolt | Külön mentési terv, checkouton kívüli secret/config backup és tényleges visszaállítási próba |
| P2 | REBOOT_REQUIRED; futó kernel 6.8.0-110, újabb 6.8.0-142 már telepítve; 66 cached upgradable csomag | Egyeztetett karbantartás az összes jelenlegi alkalmazás figyelembevételével; nincs automatikus reboot/update |
| P2 | Két meglévő unit failed: ügynök healthcheck és network wait-online | Hibaok vizsgálata és a tervezett újraindítás utáni helyreállás igazolása; önmagában nem alterward-kódhiba |
| P2 | Meglévő Docker json-file logoknál konténerenként nem látható rotációs opció; journal körülbelül 1,8 GiB | Daemon-szintű korlát tisztázása, saját alkalmazásnál a meglévő 10 MiB ×3 policy megtartása, diszkmonitorozás |

A Docker portpublikálás UFW-szabályokat megkerülhet; ezért önmagában az UFW bekapcsolása nem zárja le a konténerportokat. A 3001-es port korlátozása csak a jelenlegi proxyútvonal ismeretében történhet, hogy ne törjön el egy másik oldal. [Docker tűzfal-dokumentáció](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Automatikus frissítési szolgáltatás és apt-timerek működnek, de ez nem bizonyítja minden csomag és a futó kernel frissességét. A 66 csomag a pillanatnyi helyi apt-cache eredménye; audit közben apt update/upgrade nem futott. Docker live-restore nincs bekapcsolva, ezért egy daemon-frissítés más konténerek működését is érintheti.

## Mentés, megfigyelés és korlátok

Két alkalmazásspecifikus backup timer utolsó futása 2026-10-04-én sikeres exit statusú volt; helyi mentési könyvtár is található. Ez **nem** igazol teljes VPS/offsite backupot, a tartalom teljességét vagy sikeres restore-t. A `/var/backups` csomagadatbázis-mentései sem helyettesítik az alkalmazásadatok mentését. Contabo snapshot/backups előfizetést/panelt nem vizsgáltunk.

Alterwardhoz még kell külső uptime/TLS-ellenőrzés, web/API health, worker job/lease/queue és AI-spend figyelés, riasztási felelős, külön Supabase mentés/retenció és kipróbált restore. A felhasználói JSON-export nem teljes DB-backup. Restore során a már törölt fiókok adatai nem kerülhetnek vissza kontrollálatlanul.

Nem futott alterward image-build/pull ezen a szerveren, teljes Compose vagy új alkalmazásfolyamat, migráció, valódi Auth/AI smoke, hosszabb kapacitás/terhelésmérés, backup restore vagy reboot-próba. Egy szerver önmagában nem magas rendelkezésreállás; ezek a későbbi telepítés ellenőrzési kapui.

## Titokkezelés és hozzáférési előzmény

A megadott `env/contabo_auth.txt` Git- és Docker-kizárás alatt áll. Ellenőrzött helyi ACL: öröklés kikapcsolva, csak az aktuális Windows-felhasználó, SYSTEM és helyi rendszergazdák jogosultak. A korábbi védelem a fájl bővítése után is megmaradt. A jelszavak memóriából kerültek az SSH-hitelesítésbe; nem kerültek parancssori argumentumba, jelentésbe, Gitbe vagy remote env-be.

Az SSH-hostkulcs minden új kapcsolatkor egyezett a repón kívüli védett titokmappában rögzített kulccsal. Az első rögzítés első használatkor létrejött bizalom volt; külön Contabo/VNC csatornából származó ujjlenyomattal még nem hasonlítottuk össze. Hostkulcsváltozás nem kerül automatikusan elfogadásra.

Előzmény: az eredeti fájlbeli belépési páros, majd külön felhasználói kérésre az akkori jelszó és `root` neve egyszer-egyszer elutasított hitelesítést kapott. A felhasználó által később megadott „felhasználói név2” és „jelszó2” párossal a kapcsolat sikeres, UID 0 jogosultság igazolt. Az audit tehát már nem hozzáférés miatt áll; a korábbi részleges riportot ez a belső vizsgálat váltja fel.

## Következő telepítési sorrend

1. A fenti SSH/tűzfal/TLS és karbantartási pontok rendezése kijelölt üzemeltetési időben, a meglévő szolgáltatások megtartásával.
2. Közös Caddyhez illesztett alterward Compose és elkülönített hálózat, erőforrás/logkorlát, rögzített image/commit és rollback-terv.
3. Választott hostname, DNS, ellenőrzött HTTPS és Supabase Auth Site URL/redirect allowlist. Domainvásárlás továbbra későbbi felhasználói döntés.
4. Éles titkok checkouton kívül, például `/etc/alterward/runtime.env`; ellenőrzött CA és külön production AI-keret. A fejlesztői OpenAI/Claude 5–5 USD naplók nem production allowance.
5. Mentés/visszaállítás, teljes web/API/worker indulás és restart/recovery, klienscím/rate-limit, korlátozott valódi Auth/AI UI-próba.
6. Korlátozott angol béta, majd tényleges használói és kapacitásmérés alapján további lépések.
