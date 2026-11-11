# alterward — zárt webhely originvédelme és saját fiókos joggyakorlás

2026-10-08 · [Elfogadott kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Kötelező Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

## Megvalósítás

Külön `@future-flow/access` csomag került a web és API elé. `CLOSED_SITE_ENABLED=true` esetén a védett kiszolgálás Cloudflare által aláírt `Cf-Access-Jwt-Assertion` igazolást kér: kizárólag RS256, konfigurált issuer/AUD, kötelező lejárat/kiállítási idő/subject/email/app típus. A JWK-forrás kizárólag a szerver konfigurált `*.cloudflareaccess.com/cdn-cgi/access/certs` címe; a token `jku`/issuer vagy a kérés Host/email fejléce nem választ kulcsforrást és nem enged be. Hiányos vagy félreérthető konfiguráció hibát ad; hibás igazolás, sikertelen kulcslekérés és lejárt kulcscache esetén a védett kérés tiltott.

Név szerinti origin-engedélylista is szükséges: `CLOSED_SITE_ALLOWED_EMAILS`, legfeljebb egy üzemeltető és tíz tesztelő. Az Access policyval szinkronban tartandó. Ezzel az új konfigurációból eltávolított cím korábbi, még érvényes aláírt tokenje is elutasítható az originben. A konfiguráció folyamatinduláskor töltődik: eltávolítás után **web és API újraindítása, Access policy/session visszavonás, fizetett UUID eltávolítás és az érintett worker újraindítása, majd negatív próba** szükséges. Egy puszta fájlszerkesztés nem jelenti a visszavonás befejezését. Access identitás nem helyettesíti a Supabase tulajdonosi ellenőrzést.

Next 16 `proxy.ts` ellenőriz a renderelés előtt; az API minden route-ja, a dokumentáció és az anonim public reader is a bejárati őr mögött van. Kijelentkezett deep link, RSC/SSR, localhost és közvetlen IP/Host nem kap általános kivételt. A válaszok zárt üzemmódban nem cache-elhetők/indexelhetők. A crawler/OG/sitemap külső projekció külön zárt módban akkor sem készül, ha az external exposure flag véletlenül true; a katalógus rendes olvasása a védett API-n megy. A böngészőből indított anonim katalógus- és readerkérések ugyanazon domainen továbbítják az Access cookie-t; másik originnek nem küldik el.

## Pontos kivételek

| Útvonal | Nyilvánosan elérhető tartalom |
| --- | --- |
| GET/HEAD `/privacy-notice` | Külön adatkezelési és kapcsolattartási felület, `info@alterward.com`, Cloudflare szerepe. A végleges retention/provider tájékoztatás még kiadási feladat. |
| GET/HEAD `/account-access` | Külön angol fiókbelépés, meghívási/jelszóhelyreállítási jelszóbeállítás, saját export/törlés. Nem tölti be a teljes alkalmazási navigációt vagy katalógust. |
| GET/HEAD `/api/v1/me/export`, DELETE `/api/v1/me` | Access-kapu nélkül is a meglévő verified Supabase Auth és friss hitelesítés kell; csak saját adat, külön gépelt törlési megerősítés. |
| GET/HEAD `/healthz` a weben, `/health` az API belső hálózatán | Minimális működésjelzés; a web healthcheck nem a védett kezdőlapot kéri. |
| GET/HEAD `/_next/static/*`, `/favicon.ico` | Inert build assetek a külön rights oldalhoz; nincs `/_next/image`, általános asset/file vagy API bypass. |

A `/login`, `/settings`, a rights útvonalak gyermekei, a különböző metódusok és a teljes `/api/*` nem kivételek. A beta UI nem kínál önregisztrációt. A Supabase saját signup kapcsolóját, SMTP-t és a `/account-access` invite/recovery redirectet élesben külön be kell állítani és valódi levelezéssel ellenőrizni. A választott küldő a meglévő SMTP2GO EU-fiók; a [hosztolt Supabase SMTP útmutatója és operátori sablonja](SMTP2GO_SUPABASE_SETUP_HU.md) kész; a felhasználó dedikált SMTP-t állított be és Gmailbe kézbesített meghívót, spam eredménnyel. A Codex az éles Auth URL-eket és nyolc angol HTML-sablont mentette/újranyitotta; tényleges éles callback/belépés és kézbesítési újrapróba még hátravan. [Pontos bizonyíték](SMTP2GO_DELIVERY_CHECKPOINT_HU.md). Az alkalmazás nem szinkronizál SMTP-beállítást a VPS env-ből.

## Konfigurálás és sorrend

`deploy/server.env.example` és mindkét kiszolgáló Compose-konfigurációja tartalmazza a külön zárási flaget, team hostname-t, AUD-t és email-listát. Ezek runtime szerverértékek, nem `NEXT_PUBLIC` vagy build argumentumok; a worker nem kapja őket. A helyi/izolált alapérték off. **Zárt éles kiszolgálás előtt true, teljes konfiguráció és tényleges Access policy szükséges.** A paid UUID-lista ekkor még üres, az AI-keret nulla és időszaka nem indul el.

Cloudflare oldalon a teljes domain és a `www` lefedése, explicit OTP, üzemeltető Allow, majd a fenti szűk rights/asset kivételek kialakítása következik. Az origin továbbra saját ellenőrzést végez: Cloudflare path policy eltérésből nem lehet teljes alkalmazási bypass. A meglévő Contabo/Caddy alkalmazások nem változtak. A névtelen tiltás mellett valódi pozitív OTP/Cloudflare és külső origin/cache/browser próbák is szükségesek.

## Bizonyíték és hátralévő kapuk

A célzott helyi próbák: 14 sikeres teszt két fájlban, valódi RSA aláírással és determinisztikus JWK-transzporttal; issuer/AUD/claim/signature/expiry/unsigned/size/hamis fejléc, rotáció/cache/kiesés, visszavont email és pontos kivételek. Nest HTTP/DB próba igazolta az API-zárást és dokumentációvédelmet, a signed Access + külön Supabase hitelesítést, a paid UUID visszaellenőrzést, valamint a kizárt fiók saját exportját és tényleges alkalmazási törlését. Másik fiók megmaradt. Ez izolált fixture, nem Cloudflare-éles vagy valódi Supabase/SMTP próba.

A végleges kód teljes helyi checkje sikeres: format/typecheck, 666 sikeres teszt / 63 fájl, két Windows symlink-jogosultság miatt kihagyott korábbi teszt (összesen 668), API/worker/Next production build. Az új production Next HTTP-script 19 sikeres ellenőrzést végzett: névtelen/RSC/hamis belső fejléces tiltás, szűk rights/asset/health kiszolgálás és pontos útvonal/metódushatár. A Next RSC-előtöltési normalizáló átirányítása ugyanazon origin és account-access útvonalon maradt; nem nyitotta meg a teljes alkalmazást. A script külön CI-lépés lett. A b8deeee021d7e4c9d60ae0937160dfad3ef0f011 runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37836085852) verify és container jobja sikeres: Linuxon mind a 668 teszt / 63 fájl kihagyás nélkül, 19 production Next HTTP-próba, típusok/build és séma-drift ellenőrzés; három privát alkalmazásszolgáltatás, 36 migráció és ismétlés, izolált PostgreSQL/HTTPS/verified DB TLS, egress tiltva és paid AI 0.

**Éles Access/Contabo még nincs aktiválva; a részletes Claude Cloud-audit még hátravan.** A login-email rögzítve és a kapcsolati továbbítás felhasználó által megerősítve; teljes privacy/retention/SMTP, restore/rollback/ops és pozitív böngészős próbák továbbra kapuk. Új AI-hívás, meghívó vagy beta-időszak aktiválás nem történt e fejlesztéssel. P01–P13 / Shared S0–S7 teljes scope megmarad, az el nem készült funkciók saját default-off kapukkal.

Friss, kizárólag olvasási [Contabo/DNS előellenőrzés](RELEASE_PREFLIGHT_2026_10_08_HU.md) is készült. Nem telepítési vagy restore-bizonyíték; az üzemeltető belépési címe és a kapcsolati továbbítás azóta [rögzített](OPERATOR_EMAIL_CONFIGURATION_HU.md); automatikus levélküldés és valódi Auth próba még hátravan.
