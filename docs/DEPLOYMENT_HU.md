# alterward — helyi fejlesztés és későbbi Contabo-telepítés

2026-10-04 · [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Compose](../deploy/compose.yaml).

## Elfogadott környezet

A felhasználó meglévő Contabo szerverén lesz az éles alkalmazás; domaint később vesz. Most helyi fejlesztés és tesztelés folyik, a GitHub main tárolja az ellenőrzött változtatásokat. Render-előfizetés nincs és nem szükséges; a korábbi render.yaml javaslat eltávolítva. A felhasználó 2026-10-04-én szerverauditot kért és hozzáférési fájlt adott. A [részleges audit](CONTABO_SERVER_AUDIT_HU.md) szerint SSH/80/443 elérhető, Caddy válaszol, de a megadott SSH-belépés elutasított; belső kapacitás/biztonság még nem igazolt. Élesítés nem történt.

A web, API és folyamatos worker egy szerveren, külön Docker Compose szolgáltatásban futhat. Az adatbázis és Auth továbbra Supabase; az AI külső OpenAI API, ezért GPU nem szükséges. A végleges kapacitás a szerver OS/CPU/RAM, szabad hely és más futó szolgáltatások ellenőrzése után dönthető el. A tényleges futásmérés még hiányzik. [Next.js saját szerver](https://nextjs.org/docs/app/guides/self-hosting), [Compose éles környezet](https://docs.docker.com/compose/how-tos/production/).

## Előkészített fájlok és ellenőrzési határ

Gyökér Dockerfile: Node 24, rögzített pnpm a packageManager mezőből, frozen lockfile, teljes production build; runtime nem root felhasználó. Egy közös kezdeti image őrzi a monorepo modulkapcsolatait; méretoptimalizálás később mérhető. A .dockerignore kizárja a helyi env/.env/.local, Git, build és kulcsfájlokat. Csak a három publikus NEXT_PUBLIC érték build argument, admin/OpenAI kulcs soha.

deploy/compose.yaml: web/API/worker + Caddy proxy, automatikus restart, web/API healthcheck, forgó méretkorlátos konténernapló, CA-fájl csak read-only mount. Kizárólag a proxy 80/443 portja nyilvános. API/worker titkos környezete külön, a web nem kap admin-, DB- vagy OpenAI-kulcsot. AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD alapértéke nulla; új fizetős generálás addig tiltott.

A helyi Windows-környezetben nincs Docker parancs; Linux CI-ben az image-build és production web indulás/healthcheck már sikeres. A teljes Compose/API/worker együttműködés, Caddy HTTPS, külső kliensazonosítás és kapacitás továbbra a későbbi szerveres kapu. A működő Node production build és Linux web healthcheck nem teljes Contabo smoke.

A megadott Contabo címen a 80-as porton már Caddy válaszol, 443/tcp is elérhető. A jelenlegi saját proxy ugyanazokat a portokat publikálná, ezért a változatlan Compose indítása előtt a tényleges foglalást fel kell mérni. Meglévő host- vagy konténeres Caddy mellé külön, belső/loopback upstream megoldás tervezendő; más szolgáltatásokat nem állítunk le automatikusan. [Audit és lehetőségek](CONTABO_SERVER_AUDIT_HU.md).

## Későbbi telepítés menete

1. Működő SSH-hozzáférés, lezárt belső audit, ellenőrzött Linux szerver, Docker Engine + Compose v2, kijelölt /opt/alterward checkout a GitHub main konkrét commitján. Meglévő szolgáltatások és 80/443 használata előbb ellenőrizendő; nincs automatikus felülírás. Az audit engedélyezett, a telepítés külön későbbi lépés.
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
