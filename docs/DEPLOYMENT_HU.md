# alterward — helyi fejlesztés és későbbi Contabo-telepítés

2026-10-04 · [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Contabo Compose](../deploy/compose.contabo.yaml) · [Előkészítési riport](CONTABO_PREPARATION_REPORT_HU.md).

## Elfogadott környezet

A felhasználó meglévő Contabo szerverén lesz az éles alkalmazás; domaint később vesz. Most helyi fejlesztés és tesztelés folyik, a GitHub main tárolja az ellenőrzött változtatásokat. Render-előfizetés nincs és nem szükséges; a korábbi render.yaml javaslat eltávolítva. A 2026-10-04-i [belső szerveraudit](CONTABO_SERVER_AUDIT_HU.md) a második belépési párossal sikeres: Ubuntu 24.04.4, 4 vCPU, körülbelül 8 GB RAM, 4,91 GiB elérhető memória és 71 GiB szabad tárhely. Korlátozott bétára megfelelőnek tűnik; Azóta a kulcsos SSH/jelszavas tiltás és védett konfigurációmentés kész; tűzfal/TLS, teljes backup/restore és karbantartás rendezendő. Élesítés nem történt.

A web, API és folyamatos worker egy szerveren, külön Docker Compose szolgáltatásban futhat. Az adatbázis és Auth továbbra Supabase; az AI külső OpenAI API, ezért GPU nem szükséges. A szerverről OpenAI/Supabase Auth és a projekt CA-jával Supabase DB TLS elérhető. A tényleges alterward futás- és terhelésmérés még hiányzik. Hoston Node 22 van; a Node 24 konténer használata miatt más alkalmazások hostos runtime-ját nem kell átállítani. [Next.js saját szerver](https://nextjs.org/docs/app/guides/self-hosting), [Compose éles környezet](https://docs.docker.com/compose/how-tos/production/).

## Előkészített fájlok és ellenőrzési határ

Gyökér Dockerfile: Node 24, rögzített pnpm a packageManager mezőből, frozen lockfile, teljes production build; runtime nem root felhasználó. Egy közös kezdeti image őrzi a monorepo modulkapcsolatait; méretoptimalizálás később mérhető. A .dockerignore kizárja a helyi env/.env/.local, Git, build és kulcsfájlokat. Csak a három publikus NEXT_PUBLIC érték build argument, admin/OpenAI kulcs soha.

deploy/compose.yaml: web/API/worker + Caddy proxy, automatikus restart, web/API healthcheck, forgó méretkorlátos konténernapló, CA-fájl csak read-only mount. Kizárólag a proxy 80/443 portja nyilvános. API/worker titkos környezete külön, a web nem kap admin-, DB- vagy OpenAI-kulcsot. AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD alapértéke nulla; új fizetős generálás addig tiltott.

A helyi Windows-környezetben nincs Docker parancs; Linux CI-ben az image-build és a kibővített web/API/worker/proxy futáspróba sikeres. Külön PostgreSQL/TLS fixture, 001–009 és megismételt migráció, valós Shared slot/tag verseny és átfedő fióktörlés, verified HTTPS/DB TLS, API 401 és üres queue-poll, worker megállás SIGKILL nélkül; valós adat/kulcs vagy AI-költség nincs. [Aktuális CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37229799920), 195 teszttel. A tényleges Supabase, Caddy domain/HTTPS, külső kliensazonosítás és kapacitás továbbra a későbbi szerveres kapu.

A Contabo gépen a meglévő Caddy 2.11.3 konténer foglalja a 80/443 portokat, hat hostname szerepel a lemezes konfigurációjában; az eredeti auditban három lejárt origin-tanúsítvány és egy kézfogási hiba szerepelt. Két név publikus proxys HTTPS-e működik, a többi négy kívülről nem elérhető; a storage/ACME javítás és az aktív domainek tisztázása szükséges. A Contabohoz a `deploy/compose.contabo.yaml` használatos: csak web/API/worker, saját proxy nélkül, 2816 MiB összmemória-, 2,75 CPU- és forgó naplókorlátokkal. A web/API az `alterward_proxy` külső hálózaton kap stabil aliasokat, a worker külön bridge hálózaton működik. Nyilvános 3000/4000 port nincs. API/worker secret-határok és verified CA-mount megmaradnak.

A [Caddy route-minta](../deploy/Caddyfile.contabo.example) és [proxy Compose-kiegészítés](../deploy/compose.proxy-attachment.example.yaml) a meglévő proxyhoz tartozik. A szerveren helyettesítő env-es preflight sikeres, a proxy-kiegészítés megtartja mindkét régi hálózatot és az összes többi beállítást, a kombinált Caddyfile adaptálható. Route/hálózat nincs aktiválva, konténer nem indult. A standalone `compose.yaml` saját 80/443 portjai ezen a gépen ütköznének. [Konkrét eredmények](CONTABO_PREPARATION_REPORT_HU.md).

## Későbbi telepítés menete

1. A működő kulcsos SSH-hozzáférés, olvasási audit és jelszavas SSH tiltása megvan. Tűzfal/TLS, teljes backup/restore és egyeztetett karbantartás még szükséges. A meglévő Docker Engine/Compose plugin használható; nincs indok automatikus csomagcserére. Kijelölt /opt/alterward checkout a GitHub main konkrét commitján, elkülönített web/API/worker; saját domain és éles AI-keret után aktiválható. A jelenlegi fejlesztői DB-hez próbaként indított worker az ottani jobokat is felvehetné, ezért futáspróba csak izolált fixture-rel végezhető.
2. A deploy/server.env.example alapján külön, checkouton kívüli /etc/alterward/runtime.env. Csak jogosult üzemeltető olvashatja; nem commitoljuk és nem másoljuk fel a fejlesztői .env-t. A Supabase CA ellenőrzött példánya legyen a DATABASE_SSL_CA_HOST_FILE helyen (például /etc/alterward/supabase-ca.crt) és olvasható a konténer 1000-es UID-jének; nincs rejectUnauthorized=false. A mintában szereplő CA-útvonal a tényleges elhelyezéshez igazítandó.
3. Publikus hostname, DNS a szerverhez, elérhető 80/443 és Caddy HTTPS. Meglévő saját domain/aldomain vagy választott ideiglenes hostname is használható. A vásárlás későbbi döntés. A Caddyfile automatikusan kezeli a HTTPS-t megfelelő hostname és hálózati feltételek mellett. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
4. A protected env fájlt a parancsok --env-file kapcsolója választja ki. Secretet tartalmazó docker compose config kimenetet ne másoljunk naplóba/chatbe; ellenőrzéshez config --quiet. A web publikus Supabase értékei build-time értékek; módosításkor új image kell. Az API címe /api/v1, a proxy egy origin alatt szolgálja ki a webet és API-t.
5. A Contabo-csomag ellenőrzése és buildje az alábbi parancsokkal történik. A Compose relatív extends-útvonalait a fájl könyvtárához hagyjuk igazodni; nincs eltérő --project-directory. Az image-build a három runtime memória/CPU-korlátjától függetlenül terheli a gépet, ezért a meglévő alkalmazások mellett egyeztetett időben, mérve fut. A már sikeres CI-build nem éles Supabase publikus értékkel készült; önmagában nem éles image.
6. API_TRUST_PROXY=1 csak a zárt API-port és az egyetlen Caddy-hop mellett. A Caddy által továbbított klienscímet és rate-limitet ténylegesen ellenőrizzük. Közvetlen Node/API portot nem publikálunk, proxyhops nincs korlátlan true-ra állítva. Supabase Auth Site URL és redirect allowlist a tényleges HTTPS címet kapja.
7. Külön éles AI-keret, hozzáférési/generálási limitek, mentés/visszaállítás és visszajelzés-áttekintési felelős. Pozitív env keret nem emeli meg automatikusan a már tárolt DB-limiteket. A fejlesztői 5 USD OpenAI/5 USD Claude naplók megmaradnak helyben; nem az éles keret és nem a tárhely kerete.
8. Éles URL, commit, image-tag, smoke és visszaállítási próba rögzítése. Először korlátozott privát angol béta. Discovery/public a saját snapshot/privacy/moderáció/törlés/fork kapuja után.

A következő parancsok későbbi éles lépések, most nem futottak le. Az első preflight valódi env nélkül működik. Az `alterward_proxy` hálózatnak a migráció/API futtatás előtt léteznie kell. A migráció előtt cél-Supabase és backup/restore igazolás kell; alkalmazott migrációt nem írunk át.

```sh
cd /opt/alterward
node scripts/verify-deployment.mjs
docker network create alterward_proxy
docker compose --env-file /etc/alterward/runtime.env -f deploy/compose.contabo.yaml config --quiet
docker compose --env-file /etc/alterward/runtime.env -f deploy/compose.contabo.yaml build web
docker compose --env-file /etc/alterward/runtime.env -f deploy/compose.contabo.yaml run --rm --no-deps api pnpm db:migrate
docker compose --env-file /etc/alterward/runtime.env -f deploy/compose.contabo.yaml up -d --no-build web api
```

Meglévő hálózat esetén azt inspecttel ellenőrizzük, nem hozunk létre másodikat. A hálózat legyen külön alterward bridge; más alkalmazások nem kapnak hozzáférést az API-hoz. A worker csak a célkörnyezet, külön éles AI-keret és migráció után indul ugyanazzal a Compose paranccsal, `up -d --no-build worker` végződéssel. A web/API csak a közös Caddy megfelelő bekötése után érhető el kívülről.

A jelenlegi proxy forrásfájlját megőrzött példányhoz képest ellenőrizzük. A `deploy/compose.proxy-attachment.example.yaml` mutatja a hozzáadandó külső hálózatot; tartósan a tényleges proxy Compose-forrásában is legyen benne. Az élő hálózatbekötés és az esetleges Compose-konténercsere hatását külön mérjük. A meglévő Caddyfile-ba a valódi domainnel kitöltött site-blokk kerül, minden régi route megőrzésével. Adapt/validate után Caddy reload használatos; a reload nem szükségeltet proxy-leállítást, a hálózati konténer-újralétrehozás ettől külön művelet. [Caddy parancsok](https://caddyserver.com/docs/command-line).

Indulási smoke: web és API health, egyazon HTTPS origin, certificate-lánc/hostname, kétfiókos Auth és ownership, proxy kliens-IP/rate-limit, új élet/döntés/folytatás/visszatérés, export/törlés és tényleges worker-leállítás/drain. Pozitív keret nélkül fizetett generálást nem indítunk. P50/P95 késleltetés, memória/CPU és más VPS-szolgáltatások állapota közben mérendő. A fejlesztői Supabase-on 001–009 alkalmazva és ismétléssel ellenőrizve; üres célon 001–009 fut le. A Shared feature továbbra kikapcsolt, a későbbi éles cél migrációja előtt külön backup/restore és célkörnyezet-ellenőrzés szükséges.

## Frissítés és helyreállítás

Helyben fejlesztés → tesztek/production build → GitHub main → kijelölt időben új image/tag → szerveres smoke. Megőrizzük az előző image-et. Additív DB-migráció után régi image visszaállítása csak kompatibilitási ellenőrzéssel; migrációt nem törlünk vagy fordítunk vissza automatikusan. A Supabase-backup tényleges hozzáférése/retenciója és visszaállítása külön igazolandó. Export nem teljes adatbázis-backup, törölt felhasználók adatait nem hozzuk vissza egy kontrollálatlan restore-ral.

2026-10-04: a 298bdca kódcommit GitHub ellenőrzése sikeres: frozen install, formázás, típusok, 159 teszt, teljes build, séma-drift; a Linux konténer buildje és production web indítása/healthcheck is sikeres. [CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37164982359). Ez nem éles Contabo-telepítés.

A fenti `298bdca` futás a korábbi, csak webes runtime-ellenőrzés. A korábbi privát referencia `a69e3b3e03343082a7f728bbae0e6a0930d82737`, [CI 37194453326](https://github.com/Muzsy/future_flow/actions/runs/37194453326). Az aktuális S0 referencia `a20302f05a9eb7f4d474766d38f1199b2ec5a4e5`, [CI 37229799920](https://github.com/Muzsy/future_flow/actions/runs/37229799920): verify és teljes izolált container job is sikeres, 195 teszttel. Ez továbbra nem Contabo-élesítés.
