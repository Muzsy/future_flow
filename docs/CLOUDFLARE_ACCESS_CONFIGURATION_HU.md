# alterward — mentett Cloudflare Access és zárt regisztráció

2026-10-09 (Europe/Budapest) · [Zárt kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Originvédelem](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md) · [Következő lépések](NEXT_STEPS.md).

## Eredeti, 2026-10-09-i konfigurációs checkpoint

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

**Előkészítve, még nincs alkalmazva (2026-10-30):** tulajdonosi döntés szerint a `/terms` (ÁSZF, GET/HEAD) is nyilvános lesz. Az origin-kivétel kódja a #115 PR-ban van. A fenti táblázat és a „hat path / tizenkét destination" szám az élő Cloudflare-állapotot írja le, ezért csak a `/terms` bypass tényleges beállításakor bővül hét pathra / tizennégy destinationre; addig az éles `/terms` Access mögött marad.

A kivétel launcher-megjelenítése és eager redirectje Off. `/healthz` és `/health` számára nem készült külön edge-bypass; a konténeres healthcheck belső marad. Nincs teljes `/api/*`, `/_next/*`, `/login`, `/settings`, reader vagy Discovery bypass.

**A Cloudflare útvonalillesztése hierarchikus, és a specifikusabb alkalmazás szabálya nem örökli a fő alkalmazás policyját.** Egy megadott path leszármazottait is érintheti; a dashboard path-listája nem azonos az origin pontos path- és HTTP-method ellenőrzésével. Ezért például a `/api/v1/me` kivételből más `me` végpont vagy egy GET fiókolvasás nem kaphat automatikus engedélyt. A módszer/path korlátot és a saját adatok hitelesítését az origin tartja meg. A konkrét Cloudflare-normalizálás, kódolt útvonalak, leszármazottak, RSC, cache és nem engedett methodok **élő negatív próbája még szükséges**. [Hivatalos útvonal-szabályok](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).

Az origin csak a fő alkalmazási AUD-ra és azonos owner email-listára ad védett hozzáférést. A bypass nem ad Access-jogot, Supabase-fiókot vagy fizetett AI-jogosultságot. A később kizárt tesztelő saját joggyakorlása nem függhet új Access-belépéstől.

## Supabase regisztráció

A hosztolt Supabase **Allow new users to sign up** kapcsolója Off, a változás elmentve. Dashboard-visszaolvasás és a publikus Auth settings végpont ellenőrzése: `disable_signup=true`, email login engedélyezett, automatikus email-visszaigazolás kikapcsolva. Anonymous sign-in és manual linking Off, Confirm email On; más login-provider nincs engedélyezve.

Ez konfigurációs bizonyíték. Nem indult signup-kérés, új account, meghívó, recovery email vagy OTP-levél. A meghívott account belépése, recovery, saját export/törlés és a tiltott önregisztráció tényleges éles próbája külön következik. A [nyolc angol Auth-sablon és pontos HTTPS callback](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) megmaradt; SMTP-jelszót Codex nem olvasott vagy másolt.

## Hátralévő éles bizonyíték

- A DNS webes bekötése, Contabo alkalmazás/image, runtime origin-konfiguráció és új Caddy route aktív, owner-only. [Tényleges tanúsítvány/DNS/rollback és húsz külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md).
- Anonim védett utak, hamisított assertion/cookie/email és közvetlen origin tiltása élesben sikeres. A felhasználó OTP-belépése utáni [pozitív owner/UI és 27 névtelen utópróba](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md) sikeres; lejárt vagy más audience/issuer token külön éles köre még szükséges; a korábbi izolált JWT-regresszió ettől külön bizonyíték.
- Közvetlen origin apex/www/rights/API négy hamisított CF/IP/assertion próbája 403; pontos rights/method/descendant és saját export auth-kapu sikeres, nyilvános www privacy redirect ellenőrzött. Védett www és a belépett olvasás utáni névtelen gate/cache-HIT-tiltás később sikeres. A későbbi saját Supabase-belépés és friss-auth export ténylegesen sikeres. A pozitív cache-header, pontos kliens-IP/limiter, recovery/signup és email-fejlécek/válaszút külön nyitott.
- Az izolált célpróba, tényleges owner flag/env/image-őr, részletes Cloud-audit és valódi proxy/alkalmazási rollback lezárult. Retention/törlésvédett restore, automatikus monitor és paid-job kapuk a tesztelői meghívás előtt még szükségesek.

A harmincnapos béta-időszak inaktív, a fizetett tesztelői UUID-lista üres. Az eredeti dashboard-konfigurációs checkpoint nem indított alkalmazást; a későbbi külön jóváhagyott Contabo/domain-aktiválás a domainriportban szerepel. Új fizetett provider-hívás vagy Codex által küldött email nem indult. A privát screenshotok és operátori JSON Gitből és Docker-buildből kizártak; nyers személyes login és token nem része a dokumentációnak.

## Onboarding consent útvonal ütközésének javítása — 2026-10-13

Az első reader E2E során a normál `POST /api/v1/me/consent` kérés általános hibával megállt, és a tesztelőnek nem jött létre acknowledgement rekordja. A `/api/v1/me` rights Bypass destination leszármazottakat is érint, miközben a consent végpont a fő béta-alkalmazás assertionjét igényli. Az útvonalütközés konfigurációból megállapítható; az authenticated kérés tényleges javulását külön böngészős utópróba bizonyítja.

A célkonfiguráció a meglévő **Alterward private beta** alkalmazás négy public destinationje:

- `alterward.com`;
- `www.alterward.com`;
- `alterward.com/api/v1/me/consent`;
- `www.alterward.com/api/v1/me/consent`.

A két specifikusabb consent destination ugyanannak az alkalmazásnak az Allow policyját és AUD-ját használja. Így a consent a szélesebb rights Bypass path elé kerül. Új Access alkalmazás, AUD, policy, felhasználó, nyilvános override vagy OPTIONS bypass nem szükséges. A meghívott reader pontos címe csak a privát operátori konfigurációban szerepel; az owner és az engedélyezett reader listája változatlan.

A rights alkalmazás tizenkét destinationje, az origin pontos export/delete method guardjai és a Supabase ownership/friss-auth követelményei változatlanok. A hozzájárulás kézi adatbázis-beírása tilos. Ez a javítás nem aktivál fizetett AI-ablakot és nem módosít image-et vagy szerverkonfigurációt.

### Végrehajtás és visszaolvasás

1. Friss GET az alkalmazásokról, a fő alkalmazás részleteiről és a reusable Allow policyról; teljes eredeti állapot privát, titokmentesítetlen operátori mentésben, Gitből kizárva.
2. Az API aktuális írható sémája alapján teljes beállításmegőrző PUT candidate és rollback body. A policy meglévő `id`/`precedence` hivatkozása megmarad; ismeretlen mező esetén nincs vak eldobás.
3. Célzott origin regresszió és dokumentációellenőrzés, teljes PR CI; a specifikusabb route kiválasztásának izolált ellenőrzése az apex és www consentre, export és delete útvonalak változatlanságával.
4. Kizárólag a két consent destination hozzáadása, majd új GET. Ellenőrizendő: AUD, attached policy és roster, session/cookie/IdP/CORS beállítások, minden más alkalmazás és a rights app változatlansága. A deprecated `self_hosted_domains` a destinationökből származtatott lista lehet.
5. Valódi reader belépés, normál acknowledgement beküldés és onboarding továbblépés; saját export friss Auth után. Törlés csak külön jóváhagyott eldobható accounttal, a megtartandó tesztfiók nem törölhető.
6. Az eredeti NO-GO megfigyelést meg kell őrizni; a pozitív utópróbát külön dátummal kell rögzíteni. Csak utána következhet a külön funded operátori runbook.

Rollback: a mentett eredeti body visszaállítása ugyanazon alkalmazáson, majd teljes visszaolvasás; ez a consentet ismét fail-closed állapotba helyezi. Új policy vagy alternatív AUD létrehozása, az origin gate megkerülése nem rollback.

Hivatalos források: [útvonalak és specifikusabb alkalmazás elsőbbsége](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [aktuális alkalmazás update API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/update/).
