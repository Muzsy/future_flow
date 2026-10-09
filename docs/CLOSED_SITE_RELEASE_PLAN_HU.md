# alterward — zárt Contabo-indulás és későbbi tesztelői meghívás

2026-10-09 · Elfogadott kiadási terv; a teljes P01–P13 / Shared S0–S7 terv kiegészítése. [Éles telepítés](DEPLOYMENT_HU.md) · [Meglévő AI-hozzáférés](CLOSED_BETA_ADMISSION_REPORT_HU.md) · [Keret](AI_PRODUCTION_BUDGET_HU.md) · [Kötelező részletes Claude Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

**Aktuális checkpoint:** [Új Contabo appimage/CI/célpróba és valódi owner preflight](CONTABO_TARGET_REHEARSAL_HU.md) sikeres, nulla AI-költéssel. [Cloud-audit mind a hat része és önálló értékelés](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md) kész; az összegzés feltételes owner-only indulást támogat, élő ellenőrzési kapukkal. Új őrzött stage/launch és tényleges server-env staging elkészült; külön delta-audit és launch-próba még szükséges. [Konkrét cert/DNS/aktiválás/rollback runbook](CONTABO_OWNER_ACTIVATION_RUNBOOK_HU.md) kész, Full (strict) mentett, root-only saját CSR előkészített. Cert/éles runtime/DNS/route és élő Access/Auth/email/UI bizonyíték még nincs; béta-időszak inaktív.

## Elfogadott indulási sorrend

Üzemeltető: **Müller Ákos**, hivatalos kapcsolati és értesítési cím: **info@alterward.com**. A cím Cloudflare Email Routing útján Gmailre továbbít, ezt a felhasználó megerősítette. A külön üzemeltetői belépési cím megadva és a helyi védett konfigurációban rögzítve; ebből készül az első Access/origin engedélylista és a tervezett Supabase-fiók. A kapcsolati cím szerepel a termék angol adatkezelési/Settings felületén. Küldőszolgáltató: meglévő **SMTP2GO EU-régiós fiók**, hitelesített alterward.com domain; a felhasználó beállította a dedikált SMTP-t és meghívót kézbesített, amely spambe érkezett. Auth-feladó **`Alterward <info@alterward.com>`**, külön Reply-To nincs. A Codex az éles HTTPS `/account-access` alapértelmezést, pontos callbackeket és nyolc angol HTML-sablont elmentette/visszaellenőrizte. Új kézbesítés, hitelesítési fejlécek, éles callback/belépés és válasz visszaérkezése még szükséges. [Aktuális checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md). [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Konkrét SMTP-beállítás](SMTP2GO_SUPABASE_SETUP_HU.md).

**Tesztelők még nincsenek. Először zárt, üzemeltető számára elérhető Contabo-telepítés készül az alterward.com címen, a tesztelők meghívása ezt követi.** A korábbi dokumentumok tesztelőlistát kérő kapuja a tényleges tesztelői használat indulására vonatkozik; üres listával a védett telepítés és költségmentes üzemeltetői ellenőrzés haladhat.

Megmarad a kizárólag angol termék, 15 AI-élet/5 Scenario és legfeljebb tíz tesztelő. A 10 USD közös előállítási/béta plafon, a fenntartott 2 USD OpenAI + 1 USD Claude használati rész és a közös 0,50 USD/user limit változatlan. A Contabo-telepítés önmagában nem indítja el a harmincnapos fizetett tesztidőszakot. A Cloud-audit kredit külön marad. Nem indult új AI-hívás, meghívó vagy szerver-/Cloudflare-módosítás e terv készítésekor.

## Elfogadott bejárati védelem: Cloudflare Access

A meglévő `CLOSED_BETA_ENABLED` + `CLOSED_BETA_USER_IDS` a fizetett műveleteket védi. A public reader, Discovery, Scenario, linkelőnézet és sitemap ettől még külön hozzáférési határt igényel. A felhasználó elfogadta a **Cloudflare Access védelmet a teljes alterward alkalmazás elé**, a meglévő Supabase Auth és szerveroldali generálási lista megtartásával. A konfigurálás és az elfogadási próbák külön végrehajtandó feladatok.

Az Access minden kérés előtt ellenőrizheti az alkalmazási jogosultságot; az alkalmazások alapból tiltottak, csak egy explicit Allow szabálynak megfelelő felhasználó kap hozzáférést. Emailes egyszer használatos kóddal engedélyezett címek is beengedhetők, külön Google/Microsoft integráció nélkül. Az OTP login a jelenlegi Cloudflare-ben külön beállítandó, nem automatikusan rendelkezésre álló alapérték. [Hivatalos Access útmutató](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [emailes OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

A szolgáltató ingyenes Cloudflare One lehetőséget dokumentál legfeljebb ötven felhasználóig. A tízfős béta és az üzemeltető ehhez illeszkedik. A felhasználó aktiválta a Free csomagot, a dashboard aktív állapotát Codex ellenőrizte. Fizetős csomagot nem választottunk; a feltételek és az ingyenes keret feletti számlázás elfogadását a felhasználó végezte. [Hivatalos referencia](https://developers.cloudflare.com/reference-architecture/architectures/sase/).

| Réteg | Mire szolgál? |
| --- | --- |
| Cloudflare Access | A teljes védett oldal és API bejárata; elsőként az üzemeltető, később név szerint engedélyezett email-címek. |
| Contabo oldali Access-token ellenőrzés | A Cloudflare bejáratát megkerülő közvetlen IP/Host kérés sem kaphat történetet vagy API-tartalmat. |
| Supabase Auth / ownership / RLS | Saját alkalmazási fiók és privát adatok; Access belépésből nem lesz automatikusan Supabase-fiók vagy adminjog. |
| Meglévő API/worker béta- és költségőr | Fizetett generálás csak jóváhagyott Auth UUID-nak, rögzített időszakban és limiteken belül. |

Az első beengedés emailes Access ellenőrzés, utána a szokásos alterward belépés. Ez a zárt béta alatt két belépési lépés lehet. Egy közös jelszó nem biztosít személyenkénti visszavonást; a név szerinti jogosultsági lista ezt lehetővé teszi.

## Kötelező műszaki határ

A Cloudflare szabály önmagában nem elég a közvetlen origin megkerülés ellen. A meglévő Contabo/Caddy útvonal megtartásához az Access aláírt `Cf-Access-Jwt-Assertion` tokenjét az origin oldalán, a web- és API-kiszolgálás előtt ellenőrizni kell: aláírás, rögzített issuer, alkalmazási audience és lejárat. A kulcsforrás kizárólag a konfigurált Cloudflare team cert végpontja; a kérésben kapott issuer nem választhat tetszőleges hálózati célpontot. Hibás/hiányzó token vagy ellenőrizhetetlen kulcs esetén a védett kérés elutasított. Egy továbbított email- vagy proxyfejléc jelenléte nem jogosultsági bizonyíték. [Cloudflare origin-token ellenőrzés](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Az `alterward.com` és `www.alterward.com`, minden védett útvonal, API, anonim reader/OG/sitemap és használt alternatív hostname lefedendő; localhost/SSR belső API-hívás sem kap általános bypass-t. A web/API portjai továbbra privát Docker-hálózaton maradnak. A meglévő más Caddy-hostnevek nem kapnak alterward-hozzáférést. Az új védelmet külön telepítési konfiguráció kapcsolja be, a fizetett béta-időszaktól függetlenül.

Az adatkezelési/kapcsolati tájékoztató és a saját adatexport/törlés külön szűk kivételt igényel. Egy korábban engedélyezett, később kizárt tesztelő továbbra hitelesített, kizárólag saját adatain gyakorolhatja ezeket a jogokat. Ehhez külön Account access felület és pontos API-engedélylista készítendő; az egész `/api/*` vagy a teljes alkalmazás bypass-a nem megoldás. A kivétel nem szolgálhat ki katalógust, idegen tartalmat vagy új generálást. A belépési/jelszóhelyreállítási és meghívási callback utak is külön végigtesztelendők. A healthcheck belső, minimális működésjelzés marad.

Cache nem adhat ki előzőleg jogosult felhasználónak kiszolgált tartalmat névtelen kérésre. Béta alatt nincs külső indexelés; az adatkezelési tájékoztató rögzítse a Cloudflare hozzáférés-ellenőrzéshez továbbított email és naplóadatok szerepét is. A régi saját adatok jogait és a Supabase Auth hitelesítését az Access-réteg nem helyettesíti.

## Végrehajtási sorrend

Az első telepítés [konkrét flag-mátrixa és restore-korlátja](CLOSED_SITE_OWNER_RELEASE_MATRIX_HU.md) külön rögzített: csak az üzemeltető és a már jóváhagyott katalógus, fizetett UUID és aktív költségablak nélkül. Az összes tesztelői funkció későbbi aktiválása nem automatikus része ennek a kiadásnak.

1. **Címek, továbbítás és küldőszolgáltató tisztázva:** a személyes üzemeltetői login rögzítve, `info@alterward.com` a hivatalos cím, SMTP2GO a választott küldő. Dedikált SMTP és első meghívó a felhasználó által igazolva; HTTPS alapértelmezés, pontos callbackek és nyolc angol HTML-sablon elmentve/visszaellenőrizve. Következő új kézbesítés/fejlécek és spam okának vizsgálata, éles callback/belépés, Supabase kvóta/signup és tényleges válaszút. A Contabo env önmagában nem állítja be a hosztolt Supabase küldést. A kapcsolattartási cím automatikusan nem kerül az Access Allow listájára. [Végrehajtási útmutató](SMTP2GO_SUPABASE_SETUP_HU.md).
2. Origin tokenvédelme, szűk Account access kivételek és regressziók előkészítése; Cloudflare team/AUD és origin email-lista beállítása csak szerveroldali környezetbe kerül. Nincs késznek jelölt védelem üres konfigurációval.
3. **Dashboard-konfiguráció kész:** Cloudflare Access self-hosted alkalmazás, explicit OTP és csak az üzemeltető pontos emailjének Allow szabálya, apex/www és külön fiókjog/asset kivétel elmentve/visszaolvasva. A path-illesztés hierarchikus; a pontos method/path és saját-auth korlátot az origin tartja meg. Supabase signup Off, alkalmazási signup UI zárt-site módban rejtve. Tényleges edge/origin és invite/recovery bizonyíték még szükséges. [Mentett konfiguráció és határok](CLOUDFLARE_ACCESS_CONFIGURATION_HU.md).
4. Contabo mentés/restore/TLS/tűzfal és éles célkörnyezet előkészítése, izolált telepítési próba; a kész kód és konfiguráció rögzített main verzióján kötelező [részletes Claude Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md), önálló finding-ellenőrzés, javítás és regressziós újraellenőrzés. Csak lezárt kiadási akadályok után védett éles telepítés. A rendes AI-generálás ekkor még nem kap új keretet, a tesztelői UUID-lista üres.
5. Valódi külső pozitív/negatív böngészős és origin-próba. Ha a védelem hiányos, az alterward route nem nyílik meg.
6. A kész, ellenőrzött oldal után tesztelő kiválasztása; email az Access listába, külön Supabase-fiók/invite és UUID a béta-listába. Nyilvános önregisztrációt a Supabase-beállítás és az alkalmazási felület is tiltja a béta alatt; invite/recovery út külön működő SMTP-t igényel.
7. Tényleges tesztelői induláskor a jóváhagyott harmincnapos időszak és keret aktiválása, majd első valódi AI-élet/döntés/folytatás. Visszavonáskor Access policy/session visszavonás, a szerveroldali email-lista és UUID-lista frissítése, mindkét kiszolgáló és az érintett worker újraindítása szükséges. Az új lista nélküli régi folyamat még régi jogosultságot használhat; csak a negatív visszaellenőrzés után kész a visszavonás. A saját export/törlés továbbra elérhető. Az üzemeltető webhelyhez adott hozzáférése önmagában nem növeli a tízfős generálási listát vagy a költségkeretet.

## Elfogadási bizonyíték

- Üres tesztelőlista mellett a webhely védetten fut, új fizetett hívás nem indul és a harmincnapos keret nem kezdődik el.
- Üzemeltető bejut; idegen email, kijelentkezett/lejárt session, névtelen deep link, másik hostname és közvetlen IP/Host elérés nem kap történetet vagy katalógus-/API-adatot.
- Az érvénytelen aláírás, más audience/issuer, lejárt token, hamis email/proxyfejléc és hiányzó kulcs/konfiguráció elutasított; a kulcsrotáció ellenőrzött.
- Meghívott tesztelő bejut és a normál Supabase-fiókját használja; más account UUID-jára az Access belépés nem ad fizetett jogot.
- Kizárt tesztelő nem indíthat generálást és nem használhatja a katalógust, de saját exportját/törlését végrehajthatja; account-rights kivételből nincs tartalmi bypass.
- SPA-navigáció, SSR, statikus/RSC kérések, OG/sitemap, cache, invite és recovery működése ténylegesen ellenőrzött; a szerver többi alkalmazása működik.

## Állapot

A felhasználói sorrend, a Cloudflare Access-megoldás és a kapcsolattartási cím elfogadott. **A részletes Claude Cloud-audit az éles indulás kötelező kapuja; a korábbi próbaaudit ezt nem teljesíti.** A [helyi originvédelem és külön saját-fiókos felület](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md) implementált és helyben ellenőrzött; a Cloudflare dashboard-konfiguráció mentett, a Contabo runtime nincs aktiválva. A fenti élő ellenőrzések elfogadási követelmények, nem elvégzett próbák. A b8deeee runtime CI-bizonyítéka 668 teszt / 63 fájl és 19 production HTTP-próba; az új restore biztonsági próbák külön szerepelnek. A teljes P01–P13 / Shared S0–S7 terv megmarad; a hiányzó ops/privacy/UI kapuk továbbra előfeltételei a tesztelői használatnak.

A kapcsolattartási UI-módosítás célzott formázása és a web teljes típusellenőrzése sikeres. Ehhez a statikus email-linkhez nem indult új AI-próba vagy teljes regressziós tesztfutás. Az új dokumentáció relatív fájl-linkjei ellenőrzöttek.
