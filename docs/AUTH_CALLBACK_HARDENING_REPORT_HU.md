# alterward — belépési link hibájának egyértelmű kezelése

2026-10-09 · [Levelezési bizonyíték](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) · [Kiadási kapuk](NEXT_STEPS.md).

A tulajdonos a már felhasznált saját recovery-linkre „The service could not be reached. Please try again.” szöveget jelentett. A konkrét link, token és provider-válasz nincs kiolvasva, ezért e jelentés önmagában nem bizonyít hálózati hibát vagy az újrafelhasználás helyes tiltását. A korábbi sikeres saját jelszóbeállítás/belépés megmarad; mindkét Auth-levél spambe érkezett. A támogatási válasz Gmailbe továbbítását a felhasználó külön megerősítette.

## Forrásból igazolt megjelenítési hiba

A telepített Supabase Auth SDK 2.117.2 `AuthImplicitGrantRedirectError` típusa a callback pontos kódját `details.code` alatt tárolja, a fő `code` undefined. Az előző kliensmapper csak az utóbbit olvasta, ezért a tényleges SDK `otp_expired` hibájából általános hálózati üzenet lett. Az Account access csak `getSession()` eredményt olvasott: ez a megtartott sessiont adja vissza, az előző URL-inicializálás hibáját nem. A konkrét hibaalak szintetikus, valódi SDK-errorral reprodukált.

A javítás az implicit callbacket típussal azonosítja, ismert lejárati kódra az alábbi angol szöveget adja; más redirect-hibára biztonságos, új linket vagy jelszavas belépést ajánló üzenetet használ. Nyers provider-leírás, URL vagy token nem jelenik meg. Hiányzó session külön belépési üzenet; ugyanaz a jelszó és a tiltott signup külön érthető válasz. Valódi fetch-hiba továbbra hálózati hiba marad.

> That sign-in link is invalid, expired, or has already been used. Request a new link, or sign in with your password.

A [session-inicializáló](../apps/web/lib/auth-session.ts) külön visszaolvassa az SDK initialize és getSession eredményét. A korábbi érvényes sessiont megtartja, de a callback-hibát is visszaadja. Az [Account access](../apps/web/components/account-access.tsx) megjeleníti a hibát, és ebben az állapotban nem engedi a jelszóbeállítás gombját; sikeres kézi belépés után ismét használható. Saját export/törlés továbbra külön friss Supabase-authot igényel. Új belépési módszer, jogosultság, automatikus levél vagy jelszóváltoztatás nem aktiválódik.

## Ellenőrzés és határ

A [13 regresszió](../tests/auth-callback.test.ts) tényleges SDK-error típusokat használ: nested/direct expiry, ismeretlen redirect és nyers szöveg tiltása, hiányzó session, same-password/signup/credentials, valódi fetch-failure, megőrzött session hibás callback mellett, hibamentes inicializálás és session-read hiba. Két új próba a tényleges GoTrueClient inicializálását, szintetikus URL-t és valódi memóriatárolót használ, meglévő sessionnel és anélkül; provider-transport egyáltalán nem fut. A teljes `pnpm check` sikeres: **704 teszt / 65 fájl**, két korábbi Windows-kihagyás, formázás, típusok és API/worker/Next production build. Magyar adat/katalógus kompatibilitás megmarad, a termék kizárólag angol.

A frissen épített helyi production weboldalon szintetikus `otp_expired` callback-paraméterrel tényleges böngészős próba is sikeres: az Account access pontosan a fenti angol üzenetet jelenítette meg. A privát képernyőkép és accessibility-bizonyíték védett helyen marad; a próba nem használt valódi linket, tokent vagy jelszót, és nem küldött levelet. Az ideiglenes próbaszerver leállítva. Ez a megjelenítést igazolja, nem a tulajdonos saját felhasznált linkjének újabb éles ellenőrzését.

Külön tényleges Supabase-settings visszaolvasás igazolta a signup tiltását. Egy kézbesíthetetlen, szintetikus example.invalid cím negatív próbája **422 / signup_disabled** eredményt adott, új fiók és kézbesíthető címzett nélkül. Ez nem személyes meghívó vagy új levélküldés. Az info@ válaszút emberi end-to-end jelentése ettől külön bizonyíték.

Az éles Contabo-app továbbra 35f9889; ez a javítás még nincs rajta. A felhasználó saját régi linkjének helyes elutasítását az ellenőrzött frissítés után ismét ki kell próbálni. A teljes email-flow flag false marad; inbox-kézbesítés, lejárt/újrafelhasznált link és a többi ops/backup/monitor kapu nincs e helyi javítással késznek állítva. Új fizetett AI-költség 0 USD; a teljes P01–P13 / Shared S0–S7 és a 10 USD, legfeljebb tízfős béta változatlan.

## Célzott Cloud-audit és önálló ellenőrzés

A 1604c71551b17c63ad18da9b22f881f54924697a forrás [verify/container CI-je](https://github.com/Muzsy/future_flow/actions/runs/37984482636) sikeres; külön Cloud-auditja nem jelzett blokkoló forráshibát. Három low észrevétel érkezett, közülük egy kifejezetten hypothesis. Claude ebben a körben nem látta az SDK forrását, hanem emlékezetből feltételezett session-törlést: **AUTH-01 e feltételezését az installált 2.117.2 forrás és a két valódi GoTrueClient/storage próba cáfolta**, a session megmarad. A külön getSession hibája null, miközben initialize visszaadja az expiry-hibát. Nyers token vagy böngészős tároló nem lett kiolvasva.

AUTH-02 a komponens automatizált eseménysorrend-próbájának hiányát és az inicializálás alatti rövid UI-ablakot jelezte; nem talált auth nélküli jelszóváltoztatási utat. A későbbi kód inicializálás végéig tiltja a belépés/recovery műveleteket és nem mutatja a sessionműveleteket. Sikeres kifejezett jelszavas belépés törli a hibaflaget. Ez a további változás külön pontos audit/célimage-próba előtt áll; teljes komponens/browser eseménysorrend-automatizálást nem állítunk késznek.

HARNESS-01 a [négy process-próba](PERSONAL_AI_RECOVERY_HARDENING_REPORT_HU.md) lefedettségét pontosítja: lefordított processor/repository/költségőr, nem production main.ts entrypoint vagy provider transport-retry. A COMMIT_INSERT előtti claim-tiltásban a PostgreSQL row lock/SKIP LOCKED is szerepet kap. A fixture saját szintetikus foglalási allowance-t használ; a környezeti nulla keret nem valós fizetett szolgáltatói mérés. A [guarded upgrade](CONTABO_OWNER_UPGRADE_RUNBOOK_HU.md) új ops-kódja és tényleges fixture-próbája következő kapu.

A 1604c71 image elkülönített Contabo-próbája is sikeres: sha256:f790ea8a8d7c884e28cd41eee425e1780093fe5bd6de1e5f9e82fe1693cb441d; PostgreSQL 17/36 ismételt migráció, DB TLS/private HTTPS, origin/direct-peer/rights/asset határ, három tiltott runtime-egress, üres worker SIGTERM0 és mind a négy valódi process SIGKILL/recovery. Kilenc meglévő konténer változatlan, fixture-ek eltávolítva, provider-költés 0 USD. Ez a konkrét korábbi image bizonyítéka; az utána hozzáadott authReady UI-őr és upgrade-ops új pontos forrás/image-próbát igényel.
