# Alterward — angol Supabase Auth levélsablonok

A felhasználó végső pontosítása alapján az Auth-levelek angol, teljes szövegű sablonokat kapnak. A termék felülete és AI-történetei továbbra angolok. A fájlok telepítési források; a repository módosítása önmagában nem menti el őket a hosztolt Supabase-projektbe.

Feladó: **Alterward <info@alterward.com>**. Külön Reply-To nem szükséges: a feladó válaszcíme az info@ cím; a tényleges válasz kézbesítése még tesztelendő. Az SMTP-jelszó kizárólag a szolgáltatóknál marad.

| Supabase sablon               | Tárgy                                           | HTML                                                                     |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Invite user                   | Your invitation to Alterward                    | [invite.html](invite.html)                                               |
| Reset password                | Reset your Alterward password                   | [recovery.html](recovery.html)                                           |
| Confirm signup                | Confirm your email address for Alterward        | [confirmation.html](confirmation.html)                                   |
| Magic link                    | Your Alterward sign-in link                     | [magic_link.html](magic_link.html)                                       |
| Change email address          | Confirm your email address change for Alterward | [email_change.html](email_change.html)                                   |
| Reauthentication              | Your Alterward verification code                | [reauthentication.html](reauthentication.html)                           |
| Password changed notification | Your Alterward password has changed             | [password_changed_notification.html](password_changed_notification.html) |
| Email changed notification    | Your Alterward email address has changed        | [email_changed_notification.html](email_changed_notification.html)       |

## Telepítés

1. A megfelelő Supabase-projekt **Authentication → URL Configuration** oldalán a javasolt **Site URL** `https://alterward.com/account-access`. Ez alapértelmezett Auth-visszatérési út, így a kézzel küldött meghívás explicit redirect nélkül is a jelszóbeállító felületre érkezhet. **Redirect URLs**: pontosan `https://alterward.com/account-access`. Az éles hosthoz nem kell wildcard. A helyi fejlesztés szükséges, pontos callbackje külön megtartható; nem lesz éles alapértelmezés. [Supabase redirect dokumentáció](https://supabase.com/docs/guides/auth/redirect-urls).
2. **Authentication → Emails / Email Templates**: a táblázat tárgyát és a megfelelő HTML-fájl teljes tartalmát kell elmenteni. A [manifest](manifest.json) ugyanezeket az értékeket rögzíti, telepítési szándékként. A sablonok mentése nem engedélyez új auth-módot, önregisztrációt vagy korábban kikapcsolt biztonsági értesítést.
3. A `{{ .ConfirmationURL }}` változót változatlanul meg kell tartani. A Supabase állítja elő a verify-linket; a HTML nem írja át a tokent vagy a `redirect_to` paramétert. A megerősítő kód sablonja `{{ .Token }}` változót használ. Nincs saját `/auth/confirm` handlerre mutató, nem implementált link. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
4. A recovery jelenlegi alkalmazási hívása a böngésző saját originjén `/account-access` célt kér; élesben ez a HTTPS-cím. A meghívót kezelő operátori hívásnál szintén ugyanez az explicit `redirectTo` cél kell. Ha a dashboard külön redirectet nem kínál, a Site URL alapértéke biztosítja ezt az utat.
5. Mentés és visszaellenőrzés után **új** meghívót és recovery-levelet kell kérni. A korábban kézbesített levél linkje nem változik meg a beállítástól. A működő HTTPS-céloldal és a Cloudflare szűk account-access kivétele szükséges a teljes jelszóbeállítási/belépési próbához; a Contabo-kiadás még külön kiadási kapu.

Az SMTP2GO tracking és leiratkozó lábléc a felhasználó szerint kikapcsolt; ez Auth-leveleknél megtartandó. A sablon nem tartalmaz követőt, képet, scriptet vagy marketinget. A szövegcsere nem igazol inbox-kézbesítést: az első teszt spambe került. [Aktuális kézbesítési állapot és hátralévő próbák](../../../docs/SMTP2GO_DELIVERY_CHECKPOINT_HU.md).

2026-10-08: a fenti Site URL, éles és külön pontos localhost callback, mind a nyolc angol tárgy/HTML mentése a Supabase dashboardon megtörtént. Újranyitott előnézetben mind a nyolc teljes HTML ellenőrzött, a preview saját CSS-injektálását külön eltávolítva az összehasonlításhoz. Négy tárgy mezőjét a böngésző maszkírozza; ezek önálló karakterpontos visszaolvasását nem állítjuk. A jelszó- és emailváltozási notification kapcsoló továbbra false. Új tényleges levélküldés nem történt.
