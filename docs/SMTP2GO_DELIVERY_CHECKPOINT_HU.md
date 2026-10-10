# alterward — SMTP bekötés és első kézbesítési ellenőrzés

**Aktuális pontosítás, 2026-10-10:** a valódi saját, már felhasznált recovery-link helyes angol elutasítását a felhasználó megerősítette. A link kapuja lezárt; Gmail inbox/spam és a többi kiadási kapu külön feladat. A korábbi dátumozott megállapítások történeti állapotok.

2026-10-08 · **SMTP-bekötés és első kézbesítés: felhasználói próba. Auth URL-ek és nyolc angol HTML-sablon: Codex dashboard-mentés és újranyitási ellenőrzés.** A fejlécek és az éles belépés továbbra külön bizonyítékot igényelnek. [SMTP útmutató](SMTP2GO_SUPABASE_SETUP_HU.md) · [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Angol levélsablonok](../deploy/supabase-auth/en/README.md).

## Mi készült el?

2026-10-09: Supabase nyilvános signup letiltva és dashboard/settings végponttal visszaellenőrizve. Email login megmaradt, Confirm email On, autoconfirm/anonymous/manual linking Off. [Access és signup konfiguráció](CLOUDFLARE_ACCESS_CONFIGURATION_HU.md). Ez nem új kézbesítési vagy belépési próba; a következő lépések 3–5. pontja megmarad.

A hosztolt Auth Rate Limits olvasási ellenőrzése: token refresh 150/IP/5 perc, token verification és sign-in/sign-up egyaránt 30/IP/5 perc; IP forwarding Off. Ezeket nem módosítottuk. A projekt email/óra mezőjét a böngésző maszkírozza, ezért pontos értéke továbbra nincs igazolva; az SMTP2GO 100/óra user-limit ettől külön korlát. A maszkírozás megkerülése nem része a vizsgálatnak.

- Külön SMTP2GO-felhasználó a Supabase Authhoz, egyedi generált jelszóval, API-kulcs nélkül. Az érték kizárólag az SMTP2GO-ban és Supabase-ben szerepel; új VPS/env vagy helyi jelszópéldány nem szükséges.
- SMTP2GO limit **100 levél/óra**; tracking és leiratkozó lábléc kikapcsolva. Ez a dedikált szolgáltatói limit, nem a Supabase Auth tényleges kvótájának bizonyítéka.
- A future_flow Supabase-projekt Custom SMTP-je a felhasználó szerint beállítva: `mail-eu.smtp2go.com:587`, feladó **Alterward <info@alterward.com>**.
- A meghívó megérkezett a teszt Gmail-fiókba, közvetlen Supabase verify-linkkel, követő link nélkül. **Spambe került**; inbox-kézbesítés nincs igazolva.
- Külön Reply-To nincs: a feladó az info@ cím, így a szokásos válasz ide címezhető. A Cloudflare Email Routing Gmailre továbbít; **a tényleges válasz visszaérkezése még nincs kipróbálva**.

A beszámolt meghívó `redirect_to=http://localhost:3000` célt tartalmaz. Emiatt éles meghívó/jelszóbeállítás még nem kész. A levél megérkezése nem igazolja a Supabase-sessiont, callbacket vagy belépést. A tesztfiók személyazonossága, linkje és tokenje nem kerül dokumentációba; a próba nem jelenti tesztelői Access/AI-jog automatikus engedélyezését.

## Következő lépések

1. **URL Configuration — elmentve, újranyitással ellenőrizve:** alapértelmezett Site URL `https://alterward.com/account-access`; a pontos engedett éles Redirect URL ugyanez. A root helyett ez az Auth-cél szükséges a kézi meghívókhoz is. Külön pontos `http://localhost:3000/account-access` fejlesztési callback elmentve; a szolgáltató fallbackje már a fenti éles HTTPS-cím, wildcard nincs. A kódban a recovery már az aktuális origin `/account-access` útját kéri. [Supabase URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls).
2. **Angol, teljes Auth-levélsablonok — elmentve:** a felhasználó végső pontosítása szerint a levelek is angolok. Nyolc forrássablon és tárgy az [installációs csomagban](../deploy/supabase-auth/en/README.md). Mind a nyolc teljes HTML-tartalom egyezik az újranyitott előnézettel, a Supabase preview saját hozzáadott CSS-ének eltávolítása után. A recovery/confirmation/magic-link/reauthentication tárgy is karakterpontosan visszaellenőrzött; négy további tárgy mezőjét a böngésző maszkírozza, ezek külön nyers visszaolvasása nem igazolt. Jelszó- és emailváltozási notification kapcsoló továbbra false; a sablonmentés nem engedélyezett új auth-módot.
3. **Spam okának tisztázása:** a felhasználó a saját éles meghívó Gmail „Eredeti megjelenítése” nézetéből SPF PASS / DKIM PASS / DMARC PASS eredményt és alterward.com DKIM/From domaint jelentett. Ez emberi beszámoló, nem Codex által elért nyers Gmail-fejléc. Az SMTP2GO delivery/bounce státusz, inbox és spam okának vizsgálata megmarad. A hitelesített domain beállítása és a kézbesített levél PASS eredménye külön bizonyíték. A friss feladói reputáció lehetséges tényező, jelenleg nem igazolt ok. Az egyeztetett saját próbacímnél a valódi levél „Nem spam” jelölése és a feladó névjegybe vétele segíthet; ez nem bizonyítja más tesztelő inboxát. [Google küldési útmutató](https://support.google.com/mail/answer/81126).
4. **Új invite és recovery:** az elmentett URL/sablon után új levélben az éles HTTPS `/account-access` cél ellenőrzése; majd a védett Contabo-oldalon jelszóbeállítás, normál belépés, lejárt/újrahasznált link és tiltott signup. Azonos account újra-meghívása helyett szükség szerint recovery használható; nincs automatikus fióktörlés vagy ismételt levélküldés.
5. **Bejövő válasz:** tényleges válasz az info@ feladóhoz, majd Gmailre továbbítás igazolása. A teljes nyers `.eml`, link/token vagy SMTP-jelszó nem kell a chatbe: titokmentes eredmény és időpont elég; szükséges részletes fejléc védett helyen kezelendő.

A felhasználó bejelentkezése után a Codex a future_flow projekt dashboardján **elmentette és újranyitással ellenőrizte az URL-konfigurációt és a nyolc angol sablon teljes HTML-jét**. A Site URL korábban `http://localhost:3000` volt és a Redirect URL-lista üres; most a fenti két pontos callback szerepel. A meglévő SMTP-jelszó nem lett kiolvasva, másolva vagy módosítva. Új levél nem ment. A callbackhez tartozó éles alkalmazás, tényleges invite/recovery belépés, spam és válaszút továbbra nincs e dashboard-módosítással igazolva.

A kötelező részletes Claude Cloud-audit ezt a titokmentes állapotot és a még hiányzó élő bizonyítékot is megkapja. Az oldal zárása, restore/rollback/ops, védett Contabo-telepítés és a később induló fizetett béta külön kapuk maradnak. Új AI-hívás vagy 30 napos bétaaktiválás nem történt.

## Későbbi éles domain-checkpoint

2026-10-09: a [védett Contabo-domain](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) aktív; az angol HTTPS `/account-access` oldal a böngészőben és credential nélküli HTTP-próbában ténylegesen 200, no-store/noindex. Ez az Auth callback céloldal elérhetőségét igazolja, nem valódi invite/recovery sessiont. Új Auth-levél nem ment; meghívó/recovery és friss belépés, spam/alignment/fejlécek és válasz visszaérkezése továbbra külön ellenőrzés. A kilenc SMTP2GO/Cloudflare mail DNS-rekord változatlan maradt.

## Saját tulajdonosi fiók meghívás utáni próbája

Az [éles olvasási UI](CONTABO_OWNER_UI_VERIFICATION_REPORT_HU.md) sikeres. A Supabase felhasználólista a megadott tulajdonosi login emailre szűrve először nulla találatot mutatott. A felhasználó ezután konkrétan jóváhagyta a saját angol meghívó elküldését; egy meghívó ment, a saját fiók és a **2026-10-09T15:20:55.874604Z** meghívási idő újranyitott részletekből visszaolvasva. A felhasználó ezután megerősítette: a levél a **spam mappában** volt, saját jelszót állított be és belépett. A saját dashboardon Confirmed at 17:45 / Last signed in 17:47 helyi idő látható; az éles alkalmazás felismeri a fiókot, a friss-auth saját export ténylegesen letöltve és a saját account UUID-jához ellenőrizve. A nyers callback-linket nem olvastuk ki. Ez nem inbox-kézbesítési vagy SPF/DKIM/DMARC alignment bizonyíték; recovery, lejárt/újrahasznált link, tiltott signup és tényleges támogatási válaszút továbbra külön próba. A fizetett tesztelői béta és AI-keret nem aktivált. A cím és új UUID kizárólag privát konfigurációban/bizonyítékban marad.

## Saját meghívó hitelesítési fejlécei — emberi visszaolvasás

2026-10-09: a felhasználó az eredeti Gmail-levélből SPF PASS, DKIM PASS és DMARC PASS eredményt jelentett. A DKIM aláíró domain és a From domain alterward.com; a jelentett DMARC policy NONE. A beszámoló egyetlen saját meghívóra vonatkozik, nem független dashboard/Gmail-visszaellenőrzés vagy más címzett inbox-garancia. A levél spambe érkezett. A bounce azonosítót, nyers fejlécet és belépési linket nem másoljuk Gitbe vagy auditpromptba.

Nincs bizonyíték hibás domainhitelesítésre; e beszámoló alapján DNS-módosítás nem indokolt. A spam okát továbbra nem tekintjük azonosítottnak. Következő külön bizonyíték az SMTP2GO státusz, recovery/lejárt-link és tiltott signup, valamint a tényleges info@ válasz továbbítása. [Google küldési útmutató](https://support.google.com/mail/answer/81126?hl=en), [SMTP2GO hitelesítési útmutató](https://support.smtp2go.com/hc/en-gb/articles/28543815517209-SPF-DKIM-and-DMARC-Overview).

## Későbbi saját recovery-kérés

2026-10-09: a felhasználó konkrét jóváhagyása után az éles angol Account access felületen egy saját recovery-kérés ment. A felület angol, általános sikerüzenetet adott; címzetteket nem listáz, és ez nem kézbesítési bizonyíték. A tárgy Reset your Alterward password; a link megnyitása és új jelszó megadása a felhasználó feladata. Inbox/spam, tényleges HTTPS-callback/recovery és új belépés még visszaellenőrizendő. Korábbi saját invite/belépés/export és az ember által jelentett három PASS ettől külön megmarad. Új invite, tesztelői engedély és paid AI nem aktivált.

## Saját recovery-befejezés és friss belépés

A felhasználó megerősítette: a recovery levél is a **spam** mappába érkezett; a levél linkjével új jelszót állított be és belépett. Codex az éles /lives felületen a belépett Your lives/Sign out állapotot, a saját Supabase-fiók dashboardján pedig **Updated at 18:55 / Last signed in 18:55** helyi időt visszaolvasott. Jelszó vagy callback-token kiolvasás nem történt. A korábbi saját fiók/export bizonyíték megmarad, fizetett jogosultság nem aktivált. Ez konkrét saját recovery és belépési bizonyíték; inbox-kézbesítés, lejárt/újrahasznált link, negatív signup és tényleges támogatási válaszút továbbra külön kapu. A három PASS az eredeti meghívó emberi fejléc-beszámolója, nem a recovery levél új fejlécpróbája.

## Bejövő válasz és negatív signup

A felhasználó a saját meghívóra küldött válasz Gmailbe történő továbbítását megerősítette: az info@ támogatási válaszút emberi end-to-end próbája sikeres. Codex nem olvasott Gmail-tartalmat, raw levelet vagy linket. Külön valódi Supabase-settings ellenőrzés szerint signup tiltott; az egyszeri, kézbesíthetetlen example.invalid szintetikus címmel indított signup próba **422 / signup_disabled**, új fiók és kézbesíthető címzett nélkül. Provider AI-költség 0 USD.

A már felhasznált saját recovery-linkre a felhasználó a „The service could not be reached. Please try again.” szöveget jelentette. Ez **nem** lezárt reused/expired-link bizonyíték. A helyi kódban a tényleges Supabase SDK AuthImplicitGrantRedirectError code mezője undefined, a pontos kód details.code alatt van; az eddigi mapper ezt hálózati hibára cserélte. Az Account access a callback initialize hibáját sem jelenítette meg, csak a külön getSession tárolt állapotát olvasta. A javítás külön teszt/kiadás alatt áll; az éles oldalon és a saját régi linkkel még újrapróbálandó. A felhasználó konkrét callback-kódját/tokenjét nem olvastuk ki, ezért az adott hiba okát nem állítjuk teljesen igazoltnak. Sikeres saját recovery/belépés és két spambe érkezett levél változatlanul megmarad; inbox és lejárt/újrahasznált link még kapu.

## Callback-javítás már éles

A 9eb7732 alkalmazási image a Contabón frissült, őrzött valódi rollback/újra-upgrade után. Az éles szintetikus otp_expired callback az érthető angol invalid/expired/used üzenetet adja és megtartja a saját előző sessiont. A tényleges saját felhasznált link ellenőrzését újra kértük; token nem került kiolvasásra és új Auth-levél nem ment. Mindkét korábbi levél spambe kézbesült, inbox továbbra nincs igazolva. [Friss kiadási bizonyíték](CONTABO_OWNER_UPGRADE_REPORT_HU.md).


## 2026-10-10: tényleges felhasznált recovery-link ellenőrzése

A felhasználó a korábban már felhasznált saját „Reset your Alterward password” linket újranyitotta az éles oldalon, és pontosan ezt az üzenetet jelentette:

> That sign-in link is invalid, expired, or has already been used. Request a new link, or sign in with your password.

Ez a javítás utáni valódi link emberi end-to-end visszaellenőrzése, külön a korábbi szintetikus callback-próbától. A konkrét callback/token nem lett kiolvasva; az általános üzenetből a szolgáltatói hibakódot nem következtetjük ki. A reused-link megjelenítési kapu lezárt. Új levélküldés, jelszóváltoztatás vagy jogosultság-aktiválás nem történt. A korábbi két levél spambe érkezett; inbox/reputáció és szolgáltatói delivery/bounce ellenőrzés továbbra feladat.
