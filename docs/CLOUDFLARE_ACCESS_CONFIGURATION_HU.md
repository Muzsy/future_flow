# alterward — mentett Cloudflare Access és zárt regisztráció

2026-10-09 (Europe/Budapest) · [Zárt kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Originvédelem](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md) · [Következő lépések](NEXT_STEPS.md).

## Ténylegesen elmentett beállítások

A Cloudflare-fiókban a felhasználó aktiválta a **Zero Trust Free** csomagot. A feltételek és az ingyenes keret feletti használat számlázásának elfogadását maga végezte el; Codex nem választott fizetős csomagot. A dashboard aktív Free állapotot mutatott. Az emailes **One-time PIN** külön hozzáadva.

| Beállítás | Mentett érték és bizonyíték |
| --- | --- |
| Fő self-hosted alkalmazás | `Alterward private beta` |
| Hostnevek | `alterward.com` és `www.alterward.com`, üres path: az egész alkalmazás |
| Hozzáférési policy | `Alterward owner only`, Allow; egyetlen pontos Emails feltétel az üzemeltető védetten rögzített login-címére |
| Tesztelők | Nincs hozzáadott tesztelő; a kapcsolati email nem kapott külön jogosultságot |
| Belépés | Csak One-time PIN; Accept all identity providers Off, WARP authentication Off |
| Session | Alkalmazás és owner policy: 6 óra |
| Cookie | HTTPOnly On, Binding On, SameSite Lax; eager redirect On a két fő hostname-hez |
| CORS | OPTIONS bypass Off; általános origin/method/credential engedély nincs |
| Launcher / OAuth | App Launcher Off, Managed OAuth Off |
| Visszaolvasás | Létrehozás utáni alkalmazáslista és újranyitott részletek; tényleges AUD a mentett fő alkalmazásból |

Az alkalmazás/policy azonosítók, team domain, fő alkalmazási AUD és az üzemeltető login-emailje a Gitből kizárt, ACL-védett operátori konfigurációban vannak. Ez még **nem a szerveren működő originvédelem bizonyítéka**: az értékeket a tényleges runtime-ba kell átvinni és ott tesztelni. A jogosultság ellenőrzése az [implementált Access-validátorban](../packages/access/src/index.ts) történik.

## Saját fiókjogok és statikus fájlok kivétele

Külön mentett self-hosted alkalmazás: `Alterward account rights and assets`; policy: `Alterward own account rights and static assets`, **Bypass / Everyone**. Hat megadott path mindkét hostname-en, összesen tizenkét destination:

| Cloudflare path | Az origin tényleges engedélye |
| --- | --- |
| `/account-access` | GET/HEAD, külön belépés/recovery és kizárólag saját export/törlés felülete |
| `/privacy-notice` | GET/HEAD, angol adatkezelés és nyilvános kapcsolat |
| `/favicon.ico` | GET/HEAD, statikus ikon |
| `/_next/static/*` | GET/HEAD, inaktív build asset; a web-validátor backslash/percent karaktert elutasít |
| `/api/v1/me` | Kizárólag DELETE saját fiókra; Supabase Bearer, ownership és friss hitelesítés kötelező |
| `/api/v1/me/export` | GET/HEAD saját adatokra; Supabase Bearer és friss hitelesítés kötelező |

A kivétel launcher-megjelenítése és eager redirectje Off. `/healthz` és `/health` számára nem készült külön edge-bypass; a konténeres healthcheck belső marad. Nincs teljes `/api/*`, `/_next/*`, `/login`, `/settings`, reader vagy Discovery bypass.

**A Cloudflare útvonalillesztése hierarchikus, és a specifikusabb alkalmazás szabálya nem örökli a fő alkalmazás policyját.** Egy megadott path leszármazottait is érintheti; a dashboard path-listája nem azonos az origin pontos path- és HTTP-method ellenőrzésével. Ezért például a `/api/v1/me` kivételből más `me` végpont vagy egy GET fiókolvasás nem kaphat automatikus engedélyt. A módszer/path korlátot és a saját adatok hitelesítését az origin tartja meg. A konkrét Cloudflare-normalizálás, kódolt útvonalak, leszármazottak, RSC, cache és nem engedett methodok **élő negatív próbája még szükséges**. [Hivatalos útvonal-szabályok](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).

Az origin csak a fő alkalmazási AUD-ra és azonos owner email-listára ad védett hozzáférést. A bypass nem ad Access-jogot, Supabase-fiókot vagy fizetett AI-jogosultságot. A később kizárt tesztelő saját joggyakorlása nem függhet új Access-belépéstől.

## Supabase regisztráció

A hosztolt Supabase **Allow new users to sign up** kapcsolója Off, a változás elmentve. Dashboard-visszaolvasás és a publikus Auth settings végpont ellenőrzése: `disable_signup=true`, email login engedélyezett, automatikus email-visszaigazolás kikapcsolva. Anonymous sign-in és manual linking Off, Confirm email On; más login-provider nincs engedélyezve.

Ez konfigurációs bizonyíték. Nem indult signup-kérés, új account, meghívó, recovery email vagy OTP-levél. A meghívott account belépése, recovery, saját export/törlés és a tiltott önregisztráció tényleges éles próbája külön következik. A [nyolc angol Auth-sablon és pontos HTTPS callback](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) megmaradt; SMTP-jelszót Codex nem olvasott vagy másolt.

## Hátralévő éles bizonyíték

- A DNS webes bekötése, Contabo alkalmazás/image, runtime origin-konfiguráció és új Caddy route aktív, owner-only. [Tényleges tanúsítvány/DNS/rollback és húsz külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md).
- Anonim védett utak, hamisított assertion/cookie/email és közvetlen origin tiltása élesben sikeres. Valódi OTP/owner pozitív, lejárt vagy más audience/issuer token éles pozitív/negatív köre még szükséges; a korábbi izolált JWT-regresszió ettől külön bizonyíték.
- Közvetlen origin apex/www/rights/API négy hamisított CF/IP/assertion próbája 403; pontos rights/method/descendant és saját export auth-kapu sikeres, nyilvános www privacy redirect ellenőrzött. Hitelesített → anonim cache, védett www és pontos kliens-IP/limiter, callback/own Auth külön nyitott.
- Az izolált célpróba, tényleges owner flag/env/image-őr, részletes Cloud-audit és valódi proxy/alkalmazási rollback lezárult. Retention/törlésvédett restore, automatikus monitor és paid-job kapuk a tesztelői meghívás előtt még szükségesek.

A harmincnapos béta-időszak inaktív, a fizetett tesztelői UUID-lista üres. Az eredeti dashboard-konfigurációs checkpoint nem indított alkalmazást; a későbbi külön jóváhagyott Contabo/domain-aktiválás a domainriportban szerepel. Új fizetett provider-hívás vagy Codex által küldött email nem indult. A privát screenshotok és operátori JSON Gitből és Docker-buildből kizártak; nyers személyes login és token nem része a dokumentációnak.
