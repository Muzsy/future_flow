# alterward — helyi fejlesztés és későbbi Contabo-telepítés

2026-10-04 · [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Compose](../deploy/compose.yaml).

## Elfogadott környezet

A felhasználó meglévő Contabo szerverén lesz az éles alkalmazás; domaint később vesz. Most helyi fejlesztés és tesztelés folyik, a GitHub main tárolja az ellenőrzött változtatásokat. Render-előfizetés nincs és nem szükséges; a korábbi render.yaml javaslat eltávolítva. A 2026-10-04-i [belső szerveraudit](CONTABO_SERVER_AUDIT_HU.md) a második belépési párossal sikeres: Ubuntu 24.04.4, 4 vCPU, körülbelül 8 GB RAM, 4,91 GiB elérhető memória és 71 GiB szabad tárhely. Korlátozott bétára megfelelőnek tűnik; SSH/tűzfal/TLS, mentés és karbantartás rendezendő. Élesítés nem történt.

A web, API és folyamatos worker egy szerveren, külön Docker Compose szolgáltatásban futhat. Az adatbázis és Auth továbbra Supabase; az AI külső OpenAI API, ezért GPU nem szükséges. A szerverről OpenAI/Supabase Auth és a projekt CA-jával Supabase DB TLS elérhető. A tényleges alterward futás- és terhelésmérés még hiányzik. Hoston Node 22 van; a Node 24 konténer használata miatt más alkalmazások hostos runtime-ját nem kell átállítani. [Next.js saját szerver](https://nextjs.org/docs/app/guides/self-hosting), [Compose éles környezet](https://docs.docker.com/compose/how-tos/production/).

## Előkészített fájlok és ellenőrzési határ

Gyökér Dockerfile: Node 24, rögzített pnpm a packageManager mezőből, frozen lockfile, teljes production build; runtime nem root felhasználó. Egy közös kezdeti image őrzi a monorepo modulkapcsolatait; méretoptimalizálás később mérhető. A .dockerignore kizárja a helyi env/.env/.local, Git, build és kulcsfájlokat. Csak a három publikus NEXT_PUBLIC érték build argument, admin/OpenAI kulcs soha.

deploy/compose.yaml: web/API/worker + Caddy proxy, automatikus restart, web/API healthcheck, forgó méretkorlátos konténernapló, CA-fájl csak read-only mount. Kizárólag a proxy 80/443 portja nyilvános. API/worker titkos környezete külön, a web nem kap admin-, DB- vagy OpenAI-kulcsot. AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD alapértéke nulla; új fizetős generálás addig tiltott.

A helyi Windows-környezetben nincs Docker parancs; Linux CI-ben az image-build és production web indulás/healthcheck már sikeres. A teljes Compose/API/worker együttműködés, Caddy HTTPS, külső kliensazonosítás és kapacitás továbbra a későbbi szerveres kapu. A működő Node production build és Linux web healthcheck nem teljes Contabo smoke.

A Contabo gépen a meglévő Caddy 2.11.3 konténer foglalja a 80/443 portokat, hat hostname szerepel a lemezes konfigurációjában; három lejárt tanúsítvány és egy kézfogási hiba rendezendő. Az alterward saját proxyját ezen a gépen közös Caddy-route és külön proxy-hálózat váltja ki, nyilvános 3000/4000 port nélkül. A meglévő proxy forrás-Compose fájlja is rögzítse az új hálózatot. Más szolgáltatásokat nem állítunk le automatikusan. A jelenlegi YAML a szerver Compose v5.1.4 pluginjával helyettesítő env mellett parszolható, de változatlan portpublikálással nem indítható. [Audit és konkrét indulási pontok](CONTABO_SERVER_AUDIT_HU.md).

## Későbbi telepítés menete

1. A működő SSH-hozzáférés és olvasási audit már megvan; a rendezendő SSH/tűzfal/TLS, backup és karbantartási pontok lezárása kell. A meglévő Docker Engine/Compose plugin használható; nincs indok automatikus csomagcserére. Kijelölt /opt/alterward checkout a GitHub main konkrét commitján, elkülönített web/API/worker és közös proxyhoz illesztett konfiguráció. Az audit engedélyezett, a szervermódosítás/telepítés külön későbbi lépés.
2. A deploy/server.env.example alapján külön, checkouton kívüli /etc/alterward/runtime.env. Csak jogosult üzemeltető olvashatja; nem commitoljuk és nem másoljuk fel a fejlesztői .env-t. A Supabase CA ellenőrzött példánya legyen a DATABASE_SSL_CA_HOST_FILE helyen (például /etc/alterward/supabase-ca.crt) és olvasható a konténer 1000-es UID-jének; nincs rejectUnauthorized=false. A mintában szereplő CA-útvonal a tényleges elhelyezéshez igazítandó.
3. Publikus hostname, DNS a szerverhez, elérhető 80/443 és Caddy HTTPS. Meglévő saját domain/aldomain vagy választott ideiglenes hostname is használható. A vásárlás későbbi döntés. A Caddyfile automatikusan kezeli a HTTPS-t megfelelő hostname és hálózati feltételek mellett. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
4. A protected env fájlt a parancsok --env-file kapcsolója választja ki. Secretet tartalmazó docker compose config kimenetet ne másoljunk naplóba/chatbe; ellenőrzéshez config --quiet. A web publikus Supabase értékei build-time értékek; módosításkor új image kell. Az API címe /api/v1, a proxy egy origin alatt szolgálja ki a webet és API-t.
5. A szerverhez illesztett proxy/Compose konfiguráció elkészülte után a sorrend: docker compose --env-file /etc/alterward/runtime.env -f deploy/compose.yaml config --quiet; majd build web; majd run --rm api pnpm db:migrate. Meglévő közös proxy esetén a végleges fájlok/parancsok eltérhetnek; az eredeti csomagot nem indítjuk portütközésre. A meglévő migrációkat nem írjuk át. A 007 már a fejlesztői Supabase-on alkalmazva; üres környezetben 001–007 fut le. Migráció és mentési terv ellenőrzése után up -d, health és valódi kétfiókos Auth/UI smoke.
6. API_TRUST_PROXY=1 csak a zárt API-port és az egyetlen Caddy-hop mellett. A Caddy által továbbított klienscímet és rate-limitet ténylegesen ellenőrizzük. Közvetlen Node/API portot nem publikálunk, proxyhops nincs korlátlan true-ra állítva. Supabase Auth Site URL és redirect allowlist a tényleges HTTPS címet kapja.
7. Külön éles AI-keret, hozzáférési/generálási limitek, mentés/visszaállítás és visszajelzés-áttekintési felelős. Pozitív env keret nem emeli meg automatikusan a már tárolt DB-limiteket. A fejlesztői 5 USD OpenAI/5 USD Claude naplók megmaradnak helyben; nem az éles keret és nem a tárhely kerete.
8. Éles URL, commit, image-tag, smoke és visszaállítási próba rögzítése. Először korlátozott privát angol béta. Discovery/public a saját snapshot/privacy/moderáció/törlés/fork kapuja után.

## Frissítés és helyreállítás

Helyben fejlesztés → tesztek/production build → GitHub main → kijelölt időben új image/tag → szerveres smoke. Megőrizzük az előző image-et. Additív DB-migráció után régi image visszaállítása csak kompatibilitási ellenőrzéssel; migrációt nem törlünk vagy fordítunk vissza automatikusan. A Supabase-backup tényleges hozzáférése/retenciója és visszaállítása külön igazolandó. Export nem teljes adatbázis-backup, törölt felhasználók adatait nem hozzuk vissza egy kontrollálatlan restore-ral.

2026-10-04: a 298bdca kódcommit GitHub ellenőrzése sikeres: frozen install, formázás, típusok, 159 teszt, teljes build, séma-drift; a Linux konténer buildje és production web indítása/healthcheck is sikeres. [CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37164982359). Ez nem éles Contabo-telepítés.
