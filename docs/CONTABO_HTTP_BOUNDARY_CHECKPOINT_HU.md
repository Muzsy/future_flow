# alterward — éles klienscím, cache és kéréskorlát

2026-10-10 · [Kiadási sorrend](NEXT_STEPS.md) · [Külső monitor](EXTERNAL_AVAILABILITY_MONITOR_HU.md).

## Valódi HTTPS-próba

2026-10-10T14:33:07Z: a Contabóról, IPv4-en, szokásos CA/hostname-ellenőrzéssel hat kérés ment az alterward.com címre a Cloudflare-en keresztül. A próba saját operátori folyamatban futott; proxy, alkalmazás, Access és DNS nem változott. Nyers IP/cookie/token/levéllink nem kerül a riportba.

- Három saját-export kérés Auth nélkül 401 AUTH_REQUIRED, no-store és Cloudflare DYNAMIC választ adott. A draft-8 RateLimit-Policy partition key a tényleges Contabo kliens-IPv4 SHA-256-alapú, telepített limiter szerinti értékével egyezett.
- Hamis egy- és többtagú X-Forwarded-For/Forwarded cím nem hozott létre új partitiont; a három válasz számlálója egyenként csökkent ugyanabban a percben.
- Külön hamis CF-Connecting-IP kérést a HTTPS-út 403-mal elutasított, API-limiter header nélkül. E megfigyelésből a pontos elutasító komponensre nem következtetünk; hamis API-partition nem jött létre.
- A két publikus saját-fiókos/adatkezelési oldal 200 HTML és no-store választ adott. Cache HIT/STALE/UPDATING nem volt.
- A kilenc előzőleg futó konténer ID/restart/állapota változatlan. Alkalmazási adatírás, levél, providerhívás és bétaaktiválás nulla; a limiter memóriaszámlálója a kérések természetes hatásaként változott.

A tényleges API-limit 120 kérés/perc/klienspartition. Nem merítettük ki az éles keretet, és nem végeztünk éles terheléses tesztet. A korábbi közvetlen-origin hamis-header tiltások külön bizonyítékok, ez a pozitív Cloudflare→Caddy→API út ellenőrzése.

## Elkülönített API-próba

A [három új regresszió](../tests/api-rate-limit.test.ts) valódi helyi HTTP-kérésekkel a tényleges API-middleware-t teszteli:

1. Egy megbízható proxy mögötti IPv4 kliens első 120 kérésénél Auth-kapu, majd 429 RATE_LIMIT és pozitív Retry-After; másik kliensnek marad saját kerete.
2. Közvetlen, nem megbízható peer esetén a változó X-Forwarded-For címek nem kerülik meg a korlátot.
3. Egy IPv6 /56 külön címei közös korlátot kapnak, másik /56 saját keretet.

Mindhárom próba sikeres. Az adatbázis és Auth-provider hívására hibát dobó fixture külön igazolja, hogy egyik sem futott. A 401 és 429 válaszokon a normál, CDN és Cloudflare no-store fejlécek is ellenőrzöttek. Az API app/main és lockfile a 9eb7732 éles forrással megegyezik; ez új ellenőrzés, alkalmazási viselkedésmódosítás nélkül.

## Megmaradó határ

A saját felhasználói böngésző IPv6/címtovábbítását, belépett személyes válaszainak cache-jét, elosztott/többprocesszes limiterét, worker aktív-job leállását, hostkiesést és provider-hibautat ez nem igazolja. A limiter folyamatonkénti memória; restart esetén a percenkénti számláló nem tartós pénzügyi korlát. A tartós AI-budget és admission ettől külön, továbbra inaktív. A worker/provider és teljes recovery-kapuk megmaradnak.
