# alterward — belépési link hibájának egyértelmű kezelése

2026-10-09 · [Levelezési bizonyíték](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) · [Kiadási kapuk](NEXT_STEPS.md).

A tulajdonos a már felhasznált saját recovery-linkre „The service could not be reached. Please try again.” szöveget jelentett. A konkrét link, token és provider-válasz nincs kiolvasva, ezért e jelentés önmagában nem bizonyít hálózati hibát vagy az újrafelhasználás helyes tiltását. A korábbi sikeres saját jelszóbeállítás/belépés megmarad; mindkét Auth-levél spambe érkezett. A támogatási válasz Gmailbe továbbítását a felhasználó külön megerősítette.

## Forrásból igazolt megjelenítési hiba

A telepített Supabase Auth SDK 2.117.2 `AuthImplicitGrantRedirectError` típusa a callback pontos kódját `details.code` alatt tárolja, a fő `code` undefined. Az előző kliensmapper csak az utóbbit olvasta, ezért a tényleges SDK `otp_expired` hibájából általános hálózati üzenet lett. Az Account access csak `getSession()` eredményt olvasott: ez a megtartott sessiont adja vissza, az előző URL-inicializálás hibáját nem. A konkrét hibaalak szintetikus, valódi SDK-errorral reprodukált.

A javítás az implicit callbacket típussal azonosítja, ismert lejárati kódra az alábbi angol szöveget adja; más redirect-hibára biztonságos, új linket vagy jelszavas belépést ajánló üzenetet használ. Nyers provider-leírás, URL vagy token nem jelenik meg. Hiányzó session külön belépési üzenet; ugyanaz a jelszó és a tiltott signup külön érthető válasz. Valódi fetch-hiba továbbra hálózati hiba marad.

> That sign-in link is invalid, expired, or has already been used. Request a new link, or sign in with your password.

A [session-inicializáló](../apps/web/lib/auth-session.ts) külön visszaolvassa az SDK initialize és getSession eredményét. A korábbi érvényes sessiont megtartja, de a callback-hibát is visszaadja. Az [Account access](../apps/web/components/account-access.tsx) megjeleníti a hibát, és ebben az állapotban nem engedi a jelszóbeállítás gombját; sikeres kézi belépés után ismét használható. Saját export/törlés továbbra külön friss Supabase-authot igényel. Új belépési módszer, jogosultság, automatikus levél vagy jelszóváltoztatás nem aktiválódik.

## Ellenőrzés és határ

A [11 regresszió](../tests/auth-callback.test.ts) tényleges SDK-error típusokat használ: nested/direct expiry, ismeretlen redirect és nyers szöveg tiltása, hiányzó session, same-password/signup/credentials, valódi fetch-failure, megőrzött session hibás callback mellett, hibamentes inicializálás és session-read hiba. A teljes `pnpm check` sikeres: **702 teszt / 65 fájl**, két korábbi Windows-kihagyás, formázás, típusok és API/worker/Next production build. A végső, önálló angol szövegállítást a 11 célzott teszt újra igazolta. Magyar adat/katalógus kompatibilitás megmarad, a termék kizárólag angol.

A frissen épített helyi production weboldalon szintetikus `otp_expired` callback-paraméterrel tényleges böngészős próba is sikeres: az Account access pontosan a fenti angol üzenetet jelenítette meg. A privát képernyőkép és accessibility-bizonyíték védett helyen marad; a próba nem használt valódi linket, tokent vagy jelszót, és nem küldött levelet. Az ideiglenes próbaszerver leállítva. Ez a megjelenítést igazolja, nem a tulajdonos saját felhasznált linkjének újabb éles ellenőrzését.

Külön tényleges Supabase-settings visszaolvasás igazolta a signup tiltását. Egy kézbesíthetetlen, szintetikus example.invalid cím negatív próbája **422 / signup_disabled** eredményt adott, új fiók és kézbesíthető címzett nélkül. Ez nem személyes meghívó vagy új levélküldés. Az info@ válaszút emberi end-to-end jelentése ettől külön bizonyíték.

Az éles Contabo-app továbbra 35f9889; ez a javítás még nincs rajta. A felhasználó saját régi linkjének helyes elutasítását az ellenőrzött frissítés után ismét ki kell próbálni. A teljes email-flow flag false marad; inbox-kézbesítés, lejárt/újrafelhasznált link és a többi ops/backup/monitor kapu nincs e helyi javítással késznek állítva. Új fizetett AI-költség 0 USD; a teljes P01–P13 / Shared S0–S7 és a 10 USD, legfeljebb tízfős béta változatlan.
