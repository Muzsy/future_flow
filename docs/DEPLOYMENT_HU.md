# alterward — helyi fejlesztés és későbbi Contabo-telepítés

2026-10-04 · [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Compose](../deploy/compose.yaml).

## Elfogadott környezet

A felhasználó meglévő Contabo szerverén lesz az éles alkalmazás; domaint később vesz. Most helyi fejlesztés és tesztelés folyik, a GitHub main tárolja az ellenőrzött változtatásokat. Render-előfizetés nincs és nem szükséges; a korábbi render.yaml javaslat eltávolítva. Contabo-hozzáférést vagy élesítést még nem kértünk és nem végeztünk.

A web, API és folyamatos worker egy szerveren, külön Docker Compose szolgáltatásban futhat. Az adatbázis és Auth továbbra Supabase; az AI külső OpenAI API, ezért GPU nem szükséges. A végleges kapacitás a szerver OS/CPU/RAM, szabad hely és más futó szolgáltatások ellenőrzése után dönthető el. A tényleges futásmérés még hiányzik. [Next.js saját szerver](https://nextjs.org/docs/app/guides/self-hosting), [Compose éles környezet](https://docs.docker.com/compose/how-tos/production/).

## Előkészített fájlok és ellenőrzési határ

Gyökér Dockerfile: Node 24, rögzített pnpm a packageManager mezőből, frozen lockfile, teljes production build; runtime nem root felhasználó. Egy közös kezdeti image őrzi a monorepo modulkapcsolatait; méretoptimalizálás később mérhető. A .dockerignore kizárja a helyi env/.env/.local, Git, build és kulcsfájlokat. Csak a három publikus NEXT_PUBLIC érték build argument, admin/OpenAI kulcs soha.

deploy/compose.yaml: web/API/worker + Caddy proxy, automatikus restart, web/API healthcheck, forgó méretkorlátos konténernapló, CA-fájl csak read-only mount. Kizárólag a proxy 80/443 portja nyilvános. API/worker titkos környezete külön, a web nem kap admin-, DB- vagy OpenAI-kulcsot. AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD alapértéke nulla; új fizetős generálás addig tiltott.

A helyi Windows-környezetben nincs Docker parancs, ezért itt a tényleges Linux image-build és konténeres indulás még nincs igazolva. A YAML formátum ellenőrizhető, de ez nem Docker/Contabo smoke. Az image-build, Caddy HTTPS, külső kliensazonosítás és kapacitás a későbbi szerveres kapu. A működő Node production build ettől külön bizonyíték.

## Későbbi telepítés menete

1. Ellenőrzött Linux szerver, Docker Engine + Compose v2, kijelölt /opt/alterward checkout a GitHub main konkrét commitján. Meglévő szolgáltatások és 80/443 használata előbb ellenőrizendő; nincs automatikus felülírás. SSH-hozzáférést a tényleges telepítéskor kérünk.
2. A deploy/server.env.example alapján külön /opt/alterward/secrets/runtime.env. Csak jogosult üzemeltető olvashatja; nem commitoljuk és nem másoljuk fel a fejlesztői .env-t. A Supabase CA ellenőrzött példánya legyen a DATABASE_SSL_CA_HOST_FILE helyen és olvasható a konténer 1000-es UID-jének; nincs rejectUnauthorized=false.
3. Publikus hostname, DNS a szerverhez, elérhető 80/443 és Caddy HTTPS. Meglévő saját domain/aldomain vagy választott ideiglenes hostname is használható. A vásárlás későbbi döntés. A Caddyfile automatikusan kezeli a HTTPS-t megfelelő hostname és hálózati feltételek mellett. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
4. A protected env fájlt a parancsok --env-file kapcsolója választja ki. Secretet tartalmazó docker compose config kimenetet ne másoljunk naplóba/chatbe; ellenőrzéshez config --quiet. A web publikus Supabase értékei build-time értékek; módosításkor új image kell. Az API címe /api/v1, a proxy egy origin alatt szolgálja ki a webet és API-t.
5. Sorrend: docker compose --env-file /opt/alterward/secrets/runtime.env -f deploy/compose.yaml config --quiet; majd build web; majd run --rm api pnpm db:migrate. A meglévő migrációkat nem írjuk át. A 007 már a fejlesztői Supabase-on alkalmazva; üres környezetben 001–007 fut le. Migráció és mentési terv ellenőrzése után up -d, health és valódi kétfiókos Auth/UI smoke.
6. API_TRUST_PROXY=1 csak a zárt API-port és az egyetlen Caddy-hop mellett. A Caddy által továbbított klienscímet és rate-limitet ténylegesen ellenőrizzük. Közvetlen Node/API portot nem publikálunk, proxyhops nincs korlátlan true-ra állítva. Supabase Auth Site URL és redirect allowlist a tényleges HTTPS címet kapja.
7. Külön éles AI-keret, hozzáférési/generálási limitek, mentés/visszaállítás és visszajelzés-áttekintési felelős. Pozitív env keret nem emeli meg automatikusan a már tárolt DB-limiteket. A fejlesztői 5 USD OpenAI/5 USD Claude naplók megmaradnak helyben; nem az éles keret és nem a tárhely kerete.
8. Éles URL, commit, image-tag, smoke és visszaállítási próba rögzítése. Először korlátozott privát angol béta. Discovery/public a saját snapshot/privacy/moderáció/törlés/fork kapuja után.

## Frissítés és helyreállítás

Helyben fejlesztés → tesztek/production build → GitHub main → kijelölt időben új image/tag → szerveres smoke. Megőrizzük az előző image-et. Additív DB-migráció után régi image visszaállítása csak kompatibilitási ellenőrzéssel; migrációt nem törlünk vagy fordítunk vissza automatikusan. A Supabase-backup tényleges hozzáférése/retenciója és visszaállítása külön igazolandó. Export nem teljes adatbázis-backup, törölt felhasználók adatait nem hozzuk vissza egy kontrollálatlan restore-ral.
