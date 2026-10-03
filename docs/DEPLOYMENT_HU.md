# alterward — az angol béta telepítése

2026-10-03 · Előkészített konfiguráció, még nincs éles telepítés. [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Beállítás](SETUP.md) · [Render Blueprint](../render.yaml).

## Javasolt tárhely

Render: külön Node webes felület, API és folyamatos háttérworker; a meglévő Supabase marad adatbázis/Auth. Egy szolgáltatónál kezelhető a három folyamat és a GitHub-main telepítése. A saját domain az első béta feltétele helyett később is hozzáadható, a szolgáltató HTTPS-es `onrender.com` címe használható. [Next.js telepítés](https://render.com/docs/deploy-nextjs-app), [szolgáltatástípusok](https://render.com/docs/service-types), [Blueprint-referencia](https://render.com/docs/blueprint-spec).

A három `0.5c-512mb` alap példány mai listaára körülbelül **3 × 7 = 21 USD/hó**, további AI, Supabase, adatforgalmi/build és domain költség nélkül. Kis béta induló kapacitása, nem terheléssel igazolt végleges méret. Az ingyenes web példány alvó működése és a folyamatos worker miatt ezt a fizetős induló konfigurációt készítettük elő. A létrehozás előtt az aktuális ár és végösszeg ellenőrizendő. [Render árak](https://render.com/pricing), [ingyenes példányok korlátai](https://render.com/docs/free).

Tárhelyfiók nincs még megadva; fizetős szolgáltatás nem jött létre. A konfiguráció reviewolható a repóban, automatikus deploy kikapcsolva. A korábban engedélyezett 5 USD OpenAI és 5 USD Claude kutatási keret ettől különálló.

## Telepítés menete

1. Render-fiók és GitHub-hozzáférés a privát `Muzsy/future_flow` repóhoz, majd Blueprint a `main` ági `render.yaml` alapján. A három szolgáltatás létrehozása havi költséget indít; ehhez külön tárhelykeret kell.
2. Az API/worker csak szerveroldalon kapja a Supabase `DATABASE_URL`-t; TLS ellenőrzés kötelező. Ha a kapcsolat külön CA-fájlt igényel, Render Secret File és szerveroldali `DATABASE_SSL_CA_FILE` kell. Ne töltsük fel a helyi `.env`-t vagy az `env`/`.local` mappát.
3. API: `SUPABASE_URL`, admin `SUPABASE_SERVICE_ROLE_KEY` és a web pontos HTTPS URL-je `WEB_ORIGIN` néven. Worker: `OPENAI_API_KEY`; Claude-kulcs a termékhez most nem szükséges. A blueprint titkos értékek helyett `sync: false` bevitelt használ.
4. Web: `NEXT_PUBLIC_SUPABASE_URL`, publikus Supabase-kulcs és az API HTTPS URL-je `/api/v1` végződéssel. Ezek build-time értékek, módosításuk után a webet újra kell buildelni. A backend titkai nem kerülhetnek a webbe. A Supabase Auth Site URL és engedett átirányítások a tényleges web URL-t kapják.
5. Egyszeri migráció/infraellenőrzés a kijelölt éles DB ellen, biztonságos szerverkörnyezetből: `pnpm db:migrate`, `pnpm verify:infra`. A meglévő 001–006 migráció nem írható át; éles üres adatbázisra a már létező migrációk futnak. Az API a platform `PORT` értékét és `API_HOST=0.0.0.0` beállítást használja.
6. Előbb API/web health és Auth, majd külön jóváhagyott éles AI-keret. A blueprint `AI_PROJECT_BUDGET_USD=0` és `AI_USER_BUDGET_USD=0` mellett indul: a nyilvános generálás így nem költ automatikusan, meglévő pozitív DB-számlalimit mellett sem. A nulla konfiguráció külön letiltja az új foglalást; pozitív érték nem emeli meg a már tárolt limitet. DB-keret meglévő számlasorát nem emeli meg egy egyszerű környezeti átállítás; az alkalmazás költségőr-szabályát követve kell konfigurálni. A helyi kísérleti ledger és Claude-kutatási keret nem kerül az éles környezetbe.
7. Teljes saját kétfiókos folyamat: belépés, angol onboarding, első fejezet, választás, folytatás, visszatérés, fork, ingyenes export/törlés; idegen adat nem olvasható. Angol HTML/metadata/API régi HU-cookie/fejléc mellett; mobilnézet; hibák és költségstop. Proxy mögötti rate-limit kliensazonosítást a tényleges Render-környezetben ellenőrizni kell.
8. Mentés/visszaállítás és visszajelzési csatorna, majd korlátozott angol béta. Discovery/public csak a külön privacy/moderáció/snapshot/fork kapuk után. Az éles URL és a tényleges smoke eredménye kerüljön a státuszba. A `main` commit önmagában nem deploy.

Node 24 a projekt követelménye; pnpm verzió a gyökér `packageManager` mezőjéből. A konfigurációban szolgáltatásonként explicit runtime/verzió, zárt költséglimit és kézi deploy van. A YAML helyi szintaktikai ellenőrzése nem helyettesít Render-fiókos létrehozást, provider-validációt vagy működő éles próbát. [Node verzióbeállítás](https://render.com/docs/node-version).
