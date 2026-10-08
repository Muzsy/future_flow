# alterward — SMTP bekötés és első kézbesítési ellenőrzés

2026-10-08 · **SMTP-bekötés és első kézbesítés: felhasználói próba. Auth URL-ek és nyolc angol HTML-sablon: Codex dashboard-mentés és újranyitási ellenőrzés.** A fejlécek és az éles belépés továbbra külön bizonyítékot igényelnek. [SMTP útmutató](SMTP2GO_SUPABASE_SETUP_HU.md) · [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Angol levélsablonok](../deploy/supabase-auth/en/README.md).

## Mi készült el?

- Külön SMTP2GO-felhasználó a Supabase Authhoz, egyedi generált jelszóval, API-kulcs nélkül. Az érték kizárólag az SMTP2GO-ban és Supabase-ben szerepel; új VPS/env vagy helyi jelszópéldány nem szükséges.
- SMTP2GO limit **100 levél/óra**; tracking és leiratkozó lábléc kikapcsolva. Ez a dedikált szolgáltatói limit, nem a Supabase Auth tényleges kvótájának bizonyítéka.
- A future_flow Supabase-projekt Custom SMTP-je a felhasználó szerint beállítva: `mail-eu.smtp2go.com:587`, feladó **Alterward <info@alterward.com>**.
- A meghívó megérkezett a teszt Gmail-fiókba, közvetlen Supabase verify-linkkel, követő link nélkül. **Spambe került**; inbox-kézbesítés nincs igazolva.
- Külön Reply-To nincs: a feladó az info@ cím, így a szokásos válasz ide címezhető. A Cloudflare Email Routing Gmailre továbbít; **a tényleges válasz visszaérkezése még nincs kipróbálva**.

A beszámolt meghívó `redirect_to=http://localhost:3000` célt tartalmaz. Emiatt éles meghívó/jelszóbeállítás még nem kész. A levél megérkezése nem igazolja a Supabase-sessiont, callbacket vagy belépést. A tesztfiók személyazonossága, linkje és tokenje nem kerül dokumentációba; a próba nem jelenti tesztelői Access/AI-jog automatikus engedélyezését.

## Következő lépések

1. **URL Configuration — elmentve, újranyitással ellenőrizve:** alapértelmezett Site URL `https://alterward.com/account-access`; a pontos engedett éles Redirect URL ugyanez. A root helyett ez az Auth-cél szükséges a kézi meghívókhoz is. Külön pontos `http://localhost:3000/account-access` fejlesztési callback elmentve; a szolgáltató fallbackje már a fenti éles HTTPS-cím, wildcard nincs. A kódban a recovery már az aktuális origin `/account-access` útját kéri. [Supabase URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls).
2. **Angol, teljes Auth-levélsablonok — elmentve:** a felhasználó végső pontosítása szerint a levelek is angolok. Nyolc forrássablon és tárgy az [installációs csomagban](../deploy/supabase-auth/en/README.md). Mind a nyolc teljes HTML-tartalom egyezik az újranyitott előnézettel, a Supabase preview saját hozzáadott CSS-ének eltávolítása után. A recovery/confirmation/magic-link/reauthentication tárgy is karakterpontosan visszaellenőrzött; négy további tárgy mezőjét a böngésző maszkírozza, ezek külön nyers visszaolvasása nem igazolt. Jelszó- és emailváltozási notification kapcsoló továbbra false; a sablonmentés nem engedélyezett új auth-módot.
3. **Spam okának tisztázása:** Gmail „Eredeti megjelenítése” alatt a kézbesített levél SPF/DKIM/DMARC eredménye és feladóhoz igazodása ellenőrizendő, továbbá az SMTP2GO delivery/bounce státusz. A hitelesített domain beállítása és a kézbesített levél PASS eredménye külön bizonyíték. A friss feladói reputáció lehetséges tényező, jelenleg nem igazolt ok. Az egyeztetett saját próbacímnél a valódi levél „Nem spam” jelölése és a feladó névjegybe vétele segíthet; ez nem bizonyítja más tesztelő inboxát. [Google küldési útmutató](https://support.google.com/mail/answer/81126).
4. **Új invite és recovery:** az elmentett URL/sablon után új levélben az éles HTTPS `/account-access` cél ellenőrzése; majd a védett Contabo-oldalon jelszóbeállítás, normál belépés, lejárt/újrahasznált link és tiltott signup. Azonos account újra-meghívása helyett szükség szerint recovery használható; nincs automatikus fióktörlés vagy ismételt levélküldés.
5. **Bejövő válasz:** tényleges válasz az info@ feladóhoz, majd Gmailre továbbítás igazolása. A teljes nyers `.eml`, link/token vagy SMTP-jelszó nem kell a chatbe: titokmentes eredmény és időpont elég; szükséges részletes fejléc védett helyen kezelendő.

A felhasználó bejelentkezése után a Codex a future_flow projekt dashboardján **elmentette és újranyitással ellenőrizte az URL-konfigurációt és a nyolc angol sablon teljes HTML-jét**. A Site URL korábban `http://localhost:3000` volt és a Redirect URL-lista üres; most a fenti két pontos callback szerepel. A meglévő SMTP-jelszó nem lett kiolvasva, másolva vagy módosítva. Új levél nem ment. A callbackhez tartozó éles alkalmazás, tényleges invite/recovery belépés, spam és válaszút továbbra nincs e dashboard-módosítással igazolva.

A kötelező részletes Claude Cloud-audit ezt a titokmentes állapotot és a még hiányzó élő bizonyítékot is megkapja. Az oldal zárása, restore/rollback/ops, védett Contabo-telepítés és a később induló fizetett béta külön kapuk maradnak. Új AI-hívás vagy 30 napos bétaaktiválás nem történt.
