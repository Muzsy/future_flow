# alterward — védett domainbekötés és tulajdonosi indulás

2026-10-09 · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Végrehajtás és rollback](CONTABO_OWNER_ACTIVATION_RUNBOOK_HU.md) · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).

**Az alterward.com és www.alterward.com HTTPS-bekötése aktív, a katalógus tulajdonosi Cloudflare Access-belépés mögött marad.** A felhasználó külön jóváhagyta az egyéves Origin CA tanúsítványt és a két proxied DNS-rekordot. A bekötés utáni [pozitív tulajdonosi UI-próba](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md) mind a 16 élet/48 fejezet és öt Scenario tényleges olvashatóságát igazolta; a külön Supabase Auth/email út még nyitott. Tesztelő meghívva nincs, fizetett UUID-lista üres, a 30 napos ablak és minden AI-allowance inaktív. Az alkalmazási image a már auditált `35f9889`; az indító ops állapot `44e22e5`, sikeres [CI-vel](https://github.com/Muzsy/future_flow/actions/runs/37894534132).

## Tanúsítvány és DNS

- Saját, root-only szerverkey maradt a Contabón; csak a publikus CSR került Cloudflare-hez. RSA Origin CA cert pontosan két SAN-nal, wildcard nélkül, **2027-10-09T07:15:00Z** lejárattal. Hivatalos RSA CA-aláírás, key/CSR-egyezés, hostname és harmincnapos érvényességi kapu ellenőrzött.
- A Cloudflare kézi **Full (strict)** módja újra visszaolvasva. A közvetlen szerverpróba is a hivatalos Origin CA-val és bekapcsolt cert/hostname ellenőrzéssel dolgozott; TLS-védelem nem lett lazítva.
- Proxied apex **A**, a rögzített Contabo IPv4-célra; proxied **www CNAME → alterward.com**, Auto TTL. Két új webrekord mellett mind a kilenc SMTP2GO/Cloudflare levelezési rekord tartalma, proxyállapota, TTL-je és MX-prioritása változatlan. Külön origin AAAA rekord nem készült.
- Root-only inventory: megújítási előkészítés **2027-08-10**, harmincnapos hibakapu **2027-09-09**, pontos UTC-időkkel. Ugyanaz az OpenSSL expiry-ellenőrzés az érvényes, egynapos szintetikus certet ténylegesen elutasította; a fixture saját kulcsa/certje eltávolítva. Automatikus megújítás/riasztás és valódi új CA-certtel végzett rotáció még nincs késznek állítva.

## Szerver és visszaállítás

A közös Caddy konfigurációhoz kizárólag a már ellenőrzött Alterward snippet került. A valódi közös Compose YAML megőrzi a korábbi szolgáltatásokat, környezeti hivatkozásokat és hálózatokat; csak a Caddy új `alterward_proxy` kapcsolata és annak külső hálózatdefiníciója változott. Render-diffben kizárólag ez a két kiegészítés engedélyezett. A korábbi hat route definíciója és tényleges HTTP/TLS válasza változatlan. A korábban is fennálló négy legacy TLS-hiba továbbra külön karbantartási feladat; két korábbi TLS-kapcsolat hitelesített.

A meglévő Caddy bind-mountja miatt a Caddyfile frissítése az ellenőrzött eredeti fájl inode-jának megtartásával, hash-kapu és fsync mellett történt. A konténerből visszaolvasott fájl egyezett. Validate és explicit reload után ugyanaz a proxykonténer fut; újralétrehozás/restart nem történt. A régi `ghost_default` és `web_proxy` hálózatok azonosak maradtak. Az Alterward három szolgáltatásának portja továbbra nincs publikálva.

**DNS aktiválás előtt tényleges proxy/alkalmazási rollback történt:** korábbi Caddy validate/reload és forrásfájl, közös Compose tartós hálózatkiegészítésének visszavonása, kizárólag az új proxyhálózat detach, saját három szolgáltatás stop/down, worker exit 0 és üres saját hálózat. Ezután hash-kötött launch, teljes image/env/health/resource/port és queue/TLS ellenőrzés, majd az ellenőrzött scoped proxy-merge/connect/reload ismét sikeres. Hat legacy konténer ID/restart/állapot és route változatlan. Éles adatbázis-visszaállítás vagy DNS-rekordtörlés nem része a próbának; Access védelmet nem kapcsoltunk ki. Valódi SSH-disconnect, hostkiesés és későbbi általános upgrade továbbra külön operációs feladat.

Az új TLS/owner konfiguráció külön age-titkosított mentést kapott: **36 fájl, 18 049 byte ciphertext**, benne Origin key/cert, közös proxy/Compose, root-only owner env/frozen config/manifest és CA-k. A helyi offsite ciphertext hash-e egyezett; abból az izolált restore mind a 36 fájlt visszaellenőrizte, a hibás ciphertext elutasított, a cert/key és CA-lánc hitelesített, a rögzített Caddy image hálózat nélküli fixture-ben validált. Ideiglenes plaintext és age-identity eltávolítva. Ez új config-restore bizonyíték, nem új adatbázismentés vagy teljes hosztolt Supabase Auth/grant/privacy-replay. A korábbi [97 táblás alkalmazási DB-próba](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) határa megmarad.

## Tényleges külső próbák

A böngészőn látható tulajdonosi login kapu és az angol Account access oldal mellett **20 külön, credential nélküli HTTP-contract próba** sikeres, hitelesített HTTPS-kapcsolatokkal:

| Terület | Bizonyíték |
| --- | --- |
| Anonim történetkiszolgálás | Főoldal, Discover, Scenarios, API config/Discovery, sitemap és healthz: hét út Cloudflare loginra irányít; történetadat nem szolgáltatott. |
| Hamis azonosság | Hibás Access assertion/cookie és szintetikus email mellett Discover továbbra loginra irányít. |
| Szűk nyilvános felület | Account access és Privacy 200, `no-store`, `noindex`, Cloudflare cache HIT nélkül. |
| Saját export | GET `/api/v1/me/export`: 401 `AUTH_REQUIRED`, `no-store`; Access bypass nem vált ki alkalmazási hitelesítést. |
| Kivétel bővítési kísérlete | GET `/api/v1/me`, export leszármazott útja, Account access leszármazottja és export OPTIONS: négy origin 403, `no-store`. |
| WWW | A nyilvános privacy kivételen tényleges 308 → pontos HTTPS apex út. A későbbi pozitív owner-próba a védett www Discover HTTPS apex átirányítását és betöltését is igazolta. |
| Közvetlen publikus origin | Apex, www, Account access és Discovery API a Contabo publikus címén, hamis CF/IP/assertion fejlécekkel is 403. Az Origin CA lánc és a szerverhostname végig ellenőrzött. |

A tényleges Cloudflare peer/API átjárás működik, amit az export 401 és a pontos origin-tiltások igazolnak; a kliens-IP konkrét értékének és a limiter partíciójának pozitív bizonyítéka még szükséges. A későbbi tulajdonosi UI-betöltés a már kiadott originellenőrzésen keresztül sikeres; utána 27 névtelen kérés továbbra loginra irányított, cache HIT nélkül. Cookie/JWT nem lett kiolvasva; a pozitív válaszok konkrét cache-headerje és a rossz audience/issuer/lejárt token külön éles köre továbbra külön bizonyíték. Az API 401/403 válaszai `no-store` védettek, de a vizsgált `/api/v1/…` hibaválaszokon nincs `X-Robots-Tag`; ez alacsony, következetes API-header hardening feladat, nem történet- vagy sajátadat-kiszolgálás. A webkivétel `noindex` ellenőrzése sikeres; az anonim védett API-t Cloudflare nem engedi olvasni. Az első HTTP-probe túl általános API `noindex` elvárását a tényleges, dokumentált válaszhatárra pontosítottuk; alkalmazási védelmet nem módosítottunk.

## Következő kapuk

1. **Tulajdonosi Access/UI lezárult:** a felhasználó belépett; 16 Official élet/48 fejezet és öt Scenario minden külön oldala, mobil/asztali felület, idővonal és védett www út ellenőrzött. Kód/cookie/JWT nem került kiolvasásra, chatbe vagy Gitbe. [Későbbi UI és 27 anonim kérés](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md).
2. Owner Supabase-fiók/meghívó és angol Auth email, HTTPS callback, friss saját hitelesítés/joggyakorlás, spam/alignment és válaszút külön ellenőrzése. A Codex e bekötés során nem küldött Auth-meghívót vagy emailt.
3. Pozitív owner/origin/cache/IP/limiter próbák, tényleges monitoring/pending-recovery és privacy/retention/replay, majd paid-job concurrency/repair/restart kapuk a tesztelők előtt. API robots-header egységesítése ugyanebbe a későbbi hardening körbe kerül.
4. Tesztelők kiválasztása, név szerinti jogosultság és Auth UUID, majd a felhasználó által engedélyezett **10 USD** plafon tényleges 30 napjának aktiválása. Ez a domainbekötéssel nem indul el. A teljes P01–P13 / Shared S0–S7 terv megmarad; Shared továbbra kikapcsolt.

A publikus riport nem tartalmaz privát belépési címet, raw token/meta URL-t, VPS kulcsot/IP-t vagy secretet. A konkrét proofok, végrehajtási források és képernyőképek védett, Gitből kizárt helyi fájlokban maradnak. Új provider API-költség e bekötés során **0 USD**; a korábbi Cloud-audit végső **19,68 USD** kijelzése és a külön promóciós keret változatlan.
