# alterward — üzemeltetői belépés és hivatalos email

2026-10-08 · Felhasználói pontosítás. [Zárt indulási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Telepítés](DEPLOYMENT_HU.md).

| Szerep | Rögzített döntés |
| --- | --- |
| Hivatalos kapcsolati és értesítési cím | **info@alterward.com**; a termékben és adatkezelési tájékoztatóban ez szerepel. Az automatikus terméklevelek tervezett feladója is ez. |
| Beérkező levelek | A felhasználó megerősítette, hogy a cím a privát postafiókjába továbbít. A továbbítás beállítottként rögzítve; külön ügynöki próbaüzenet nem ment. |
| Üzemeltetői belépés | A felhasználó megadta a külön személyes belépési címet. A pontos érték a helyi, hozzáféréskorlátozott `.local/closed-site-operator/operator-config.json` fájlban van; az első Access Allow és az origin email-lista ebből készítendő. A fájl Gitből kizárt, új checkoutba nem másolódik automatikusan. |
| Saját alterward-fiók | Ugyanez a megadott cím a tervezett Supabase-fiókhoz. Fióklétrehozás, meghívó, tényleges Auth UUID és belépési próba még nincs igazolva. Access beengedés önmagában nem ad fizetett AI-jogot. |
| Automatikus levélküldés | SMTP/egyéb küldőszolgáltató és domainhitelesítés még tisztázandó; a helyi konfigurációban nem találtunk ehhez beállított mezőket. Ez nem a Supabase dashboard teljes konfigurációjának ellenőrzése. |

A beérkező levelek továbbításának felhasználói megerősítése lezárja a korábbi hiányzó cím/továbbítás kérdést. A küldés külön feladat: a Supabase meghívó- és jelszóhelyreállító folyamataihoz éles használatra alkalmas SMTP szükséges. A jelenlegi Cloudflare Email Service külön Routing és Sending szolgáltatást dokumentál, SMTP-lehetőséggel is; az aktív fiók funkcióit, csomagját és költségét ellenőrizni kell. A routing megerősítéséből nem következik, hogy a küldés is aktivált. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Cloudflare Email Service](https://developers.cloudflare.com/email-service/).

Következő: meglévő küldőszolgáltató tisztázása vagy költségkímélő megoldás kiválasztása; feladó/domain hitelesítés, Supabase SMTP és `/account-access` callback/redirect beállítás. Fizetős előfizetés és próbaüzenet e rögzítéssel nem indult. Az Access team/AUD/policy, a védett Contabo-telepítés és a kötelező részletes Cloud-audit továbbra végrehajtandó. Tesztelők kiválasztása és a fizetett 30 napos időszak a védett indulást követi.
