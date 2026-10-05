# alterward — helyi fejlesztés és későbbi Contabo-telepítés

2026-10-05 · [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Contabo Compose](../deploy/compose.contabo.yaml) · [Előkészítési riport](CONTABO_PREPARATION_REPORT_HU.md).

## Elfogadott környezet

A felhasználó meglévő Contabo szerverén lesz az éles alkalmazás; a domain **alterward.com**, Cloudflare-nél aktív. Most helyi fejlesztés és tesztelés folyik, a GitHub main tárolja az ellenőrzött változtatásokat. Render-előfizetés nincs és nem szükséges; a korábbi render.yaml javaslat eltávolítva. A 2026-10-04-i [belső szerveraudit](CONTABO_SERVER_AUDIT_HU.md) a második belépési párossal sikeres: Ubuntu 24.04.4, 4 vCPU, körülbelül 8 GB RAM, 4,91 GiB elérhető memória és 71 GiB szabad tárhely. Korlátozott bétára megfelelőnek tűnik; Azóta a kulcsos SSH/jelszavas tiltás és védett konfigurációmentés kész; tűzfal/TLS, teljes backup/restore és karbantartás rendezendő. Élesítés nem történt.

A web, API és folyamatos worker egy szerveren, külön Docker Compose szolgáltatásban futhat. Az adatbázis és Auth továbbra Supabase; az AI külső OpenAI API, ezért GPU nem szükséges. A szerverről OpenAI/Supabase Auth és a projekt CA-jával Supabase DB TLS elérhető. A tényleges alterward futás- és terhelésmérés még hiányzik. Hoston Node 22 van; a Node 24 konténer használata miatt más alkalmazások hostos runtime-ját nem kell átállítani. [Next.js saját szerver](https://nextjs.org/docs/app/guides/self-hosting), [Compose éles környezet](https://docs.docker.com/compose/how-tos/production/).

## Előkészített fájlok és ellenőrzési határ

Gyökér Dockerfile: Node 24, rögzített pnpm a packageManager mezőből, frozen lockfile, teljes production build; runtime nem root felhasználó. Egy közös kezdeti image őrzi a monorepo modulkapcsolatait; méretoptimalizálás később mérhető. A .dockerignore kizárja a helyi env/.env/.local, Git, build és kulcsfájlokat. Csak a három publikus NEXT_PUBLIC érték build argument, admin/OpenAI kulcs soha.

deploy/compose.yaml: web/API/worker + Caddy proxy, automatikus restart, web/API healthcheck, forgó méretkorlátos konténernapló, CA-fájl csak read-only mount. Kizárólag a proxy 80/443 portja nyilvános. API/worker titkos környezete külön, a web nem kap admin-, DB- vagy OpenAI-kulcsot. AI_PROJECT_BUDGET_USD és AI_USER_BUDGET_USD alapértéke nulla; új fizetős generálás addig tiltott.

2026-10-05: a worker konténer közvetlenül `node apps/worker/dist/main.js` paranccsal indul, hogy a SIGTERM az alkalmazás saját graceful-stop kezelőjéhez jusson. A pnpm köztes indítófolyamat korábbi időzítésfüggő hibás kilépési kódja megszűnt; az izolált konténeres próba immár 0-s kilépést követel. Ez a helyi telepítési csomag módosítása, a Contabón futó alkalmazások nem változtak. [Aktuális bizonyíték](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

A helyi Windows-környezetben nincs Docker parancs; Linux CI-ben az image-build és a kibővített web/API/worker/proxy futáspróba sikeres. Külön PostgreSQL/TLS fixture, 001–009 és megismételt migráció, valós Shared slot/tag verseny és átfedő fióktörlés, verified HTTPS/DB TLS, API 401 és üres queue-poll, worker megállás SIGKILL nélkül; valós adat/kulcs vagy AI-költség nincs. [Aktuális CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37236552164), 260 teszttel, párhuzamos Shared enqueue/claim és lease-reclaim próbával. A tényleges Supabase, Caddy domain/HTTPS, külső kliensazonosítás és kapacitás továbbra a későbbi szerveres kapu.

A Contabo gépen a meglévő Caddy 2.11.3 konténer foglalja a 80/443 portokat, hat hostname szerepel a lemezes konfigurációjában; az eredeti auditban három lejárt origin-tanúsítvány és egy kézfogási hiba szerepelt. Két név publikus proxys HTTPS-e működik, a többi négy kívülről nem elérhető; a storage/ACME javítás és az aktív domainek tisztázása szükséges. A Contabohoz a `deploy/compose.contabo.yaml` használatos: csak web/API/worker, saját proxy nélkül, 2816 MiB összmemória-, 2,75 CPU- és forgó naplókorlátokkal. A web/API az `alterward_proxy` külső hálózaton kap stabil aliasokat, a worker külön bridge hálózaton működik. Nyilvános 3000/4000 port nincs. API/worker secret-határok és verified CA-mount megmaradnak.

A [Caddy route-minta](../deploy/Caddyfile.contabo.example) és [proxy Compose-kiegészítés](../deploy/compose.proxy-attachment.example.yaml) a meglévő proxyhoz tartozik. A szerveren helyettesítő env-es preflight sikeres, a proxy-kiegészítés megtartja mindkét régi hálózatot és az összes többi beállítást, a kombinált Caddyfile adaptálható. Route/hálózat nincs aktiválva, konténer nem indult. A standalone `compose.yaml` saját 80/443 portjai ezen a gépen ütköznének. [Konkrét eredmények](CONTABO_PREPARATION_REPORT_HU.md).

## Későbbi telepítés menete

1. A működő kulcsos SSH-hozzáférés, olvasási audit és jelszavas SSH tiltása megvan. Tűzfal/TLS, teljes backup/restore és egyeztetett karbantartás még szükséges. A meglévő Docker Engine/Compose plugin használható; nincs indok automatikus csomagcserére. Kijelölt /opt/alterward checkout a GitHub main konkrét commitján, elkülönített web/API/worker; saját domain és éles AI-keret után aktiválható. A jelenlegi fejlesztői DB-hez próbaként indított worker az ottani jobokat is felvehetné, ezért futáspróba csak izolált fixture-rel végezhető.
2. A deploy/server.env.example alapján külön, checkouton kívüli /etc/alterward/runtime.env. Csak jogosult üzemeltető olvashatja; nem commitoljuk és nem másoljuk fel a fejlesztői .env-t. A Supabase CA ellenőrzött példánya legyen a DATABASE_SSL_CA_HOST_FILE helyen (például /etc/alterward/supabase-ca.crt) és olvasható a konténer 1000-es UID-jének; nincs rejectUnauthorized=false. A mintában szereplő CA-útvonal a tényleges elhelyezéshez igazítandó.
3. Publikus hostname, DNS a szerverhez, elérhető 80/443 és Caddy HTTPS. Meglévő saját domain/aldomain vagy választott ideiglenes hostname is használható. Az alterward.com vásárlása elkészült; főcím https://alterward.com, a www változat erre irányítva. A Caddyfile automatikusan kezeli a HTTPS-t megfelelő hostname és hálózati feltételek mellett. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
4. A protected env fájlt a parancsok --env-file kapcsolója választja ki. Secretet tartalmazó docker compose config kimenetet ne másoljunk naplóba/chatbe; ellenőrzéshez config --quiet. A web publikus Supabase értékei build-time értékek; módosításkor új image kell. Az API címe /api/v1, a proxy egy origin alatt szolgálja ki a webet és API-t.
5. A Contabo-csomag ellenőrzése és buildje az alábbi parancsokkal történik. A Compose relatív extends-útvonalait a fájl könyvtárához hagyjuk igazodni; nincs eltérő --project-directory. Az image-build a három runtime memória/CPU-korlátjától függetlenül terheli a gépet, ezért a meglévő alkalmazások mellett egyeztetett időben, mérve fut. A már sikeres CI-build nem éles Supabase publikus értékkel készült; önmagában nem éles image.
6. API_TRUST_PROXY=1 csak a zárt API-port és az egyetlen, megbízható Caddy-hop mellett. Cloudflare-proxy esetén a Caddy trusted-proxy/kliens-IP feldolgozását és a tényleges rate-limitet külön ellenőrizzük; a Cloudflare peremcímet nem tekintjük automatikusan végfelhasználói címnek. A Caddy által továbbított klienscímet és rate-limitet ténylegesen ellenőrizzük. Közvetlen Node/API portot nem publikálunk, proxyhops nincs korlátlan true-ra állítva. Supabase Auth Site URL és redirect allowlist a tényleges HTTPS címet kapja.
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

A fenti `298bdca` futás a korábbi, csak webes runtime-ellenőrzés. A korábbi privát referencia `a69e3b3e03343082a7f728bbae0e6a0930d82737`, [CI 37194453326](https://github.com/Muzsy/future_flow/actions/runs/37194453326). A korábbi S0 referencia `a20302f05a9eb7f4d474766d38f1199b2ec5a4e5`, [CI 37229799920](https://github.com/Muzsy/future_flow/actions/runs/37229799920). A korábbi S1 referencia `4e377159fe37e8d0ffdf4d0c477594731797de49`, [CI 37233779884](https://github.com/Muzsy/future_flow/actions/runs/37233779884): verify és teljes izolált container job is sikeres, 231 teszttel, tíz párhuzamos intenttel, egyszeri lezárással és öt context függő döntését érintő törléssel. Ez továbbra nem Contabo-élesítés.

Az aktuális S2 runtime referencia `8b3a4097bbc43b7b28a97adb9dee2cd6f70d5cc9`, [CI 37236552164](https://github.com/Muzsy/future_flow/actions/runs/37236552164): verify/container sikeres, 260 teszt és 37 schema drift nélkül. A Shared job-, lease-, intent- és deletion-versenypróbák valódi izolált PostgreSQL/TLS-en sikeresek. API/worker Shared flag-jei a Compose mintában is false; valódi kulcs/AI-költség/Contabo-változás a CI-ben nincs.


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: alterward.com Cloudflare-domain

Aktuális helyi/main runtime: `14caf62`, [sikeres verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/37328921024), 311 teszt és 44 schema. 001–014 alkalmazása/ismétlése, izolált PostgreSQL review-verseny/RLS/törlés, korábbi S0–S3 proof, verified web/API HTTPS és worker-stop sikeres. A valódi hostname-et tartalmazó helyi Caddy-minta egress nélküli adapt-tal elfogadott. Ez nem élő route-aktiválás vagy domain/origin TLS-smoke; azok a későbbi élesítés részei.

A felhasználó az alterward.com domaint adta meg és megnyitotta a bejelentkezett Cloudflare-fiókot. Olvasási vizsgálat: domain/registrar aktív, DNS-rekordlista üres, SSL/TLS Full. Nem történt DNS/TLS-változás, API-token létrehozás vagy éles deploy. A bejelentkezett felület a későbbi manuális bekötéshez elegendő; tartós automatizáláshoz külön, kizárólag erre a zónára korlátozott token később választható.

Előkészített hostname: **alterward.com**; **www.alterward.com** → HTTPS főcím, 308 és megőrzött útvonal/query. Tervezett DNS: proxied A az apexhez a védetten ismert Contabo IPv4-re, proxied CNAME www → alterward.com. IPv6/AAAA csak ellenőrzött origin-elérés esetén. A meglévő Caddy site-blokkjai megmaradnak; a [helyi route-minta](../deploy/Caddyfile.contabo.example) nem aktív szerverkonfiguráció. [Caddy átirányítás](https://caddyserver.com/docs/caddyfile/directives/redir).

HTTPS: az origin érvényes, hostname-egyező tanúsítványa és a 443-as elérés után Cloudflare **Full (strict)**. [Cloudflare feltételek](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/). A Supabase Site URL/redirect allowlist, web build-time cím, kliens-IP/rate-limit és a dinamikus privát/API útvonalak cache-határa éles smoke-ban ellenőrizendő. Backup/restore, email, tűzfal/karbantartás, valós kiesés és külön éles AI-keret továbbra kapu.


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).
