# alterward — éles tulajdonosi felületpróba

**Aktuális pontosítás, 2026-10-10:** a valódi saját, már felhasznált recovery-link helyes angol elutasítását a felhasználó megerősítette. A link kapuja lezárt; Gmail inbox/spam és a többi kiadási kapu külön feladat. A korábbi dátumozott megállapítások történeti állapotok.

2026-10-09 · [Domainbekötés és rollback](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit értékelése](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).

**A frissített 9eb7732 éles verzión a tulajdonosi belépés és a teljes angol olvasási kínálat működik.** Az új Cloudflare-belépés utáni ellenőrzés 2026-10-09T21:31:25.968Z-kor lezárult; a saját Supabase-fiók belépett felülete is megmaradt. Provider-hívás vagy fizetett bétaaktiválás nem történt. A korábbi saját meghívás/export és mobilpróba bizonyítékai alább külön történeti szakaszban maradnak. A későbbi recovery/belépés, SPF/DKIM/DMARC PASS és támogatási válaszút eredménye a [kézbesítési checkpointban](SMTP2GO_DELIVERY_CHECKPOINT_HU.md); a már használt valódi recovery-link javítás utáni emberi próbája és az inbox-kézbesítés még nyitott.

## A frissített éles verzió UI-bizonyítéka

| Próba                      | Eredmény                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bejelentkezés              | A tulajdonos újra belépett a Cloudflare Access kapuján; a saját /lives oldalon Your lives és Sign out látható. A jelszót, cookie-t vagy JWT-t nem olvastuk ki.                            |
| Katalógus                  | Két valódi Discovery-lap, 12 + 4, összesen 16 Official élet.                                                                                                                              |
| Mind a 16 reader           | A katalógus tényleges linkjei külön betöltve; mindegyikben CHAPTER 1/2/3, összesen 48 meglévő angol fejezet, `lang=en`. A próba a megjelenést ellenőrizte, nem új kreatív minőségi audit. |
| Idővonal                   | Egy reader első Timeline-ja kinyitva, négy dátumozott esemény megjelent.                                                                                                                  |
| Mind az öt Scenario        | A lista tényleges linkjein mind az öt részlet betöltött; Identity and setting, Goals, Starting situation és Conditions angol tartalommal.                                                 |
| Olvasási jogosultság       | Mind a 16 snapshot „This copy cannot start a new life yet.” állapotú. Új élet, választás, mentés, report vagy generálás nem indult.                                                       |
| Olvasás utáni anonim próba | 27 cookie/JWT nélküli, TLS-hitelesített HTTPS-kérés mind login kapura irányított, cache HIT nélkül. A privát proof ehhez az új UI-bizonyítékhoz SHA-256-tal kötött.                       |

A pontos futó kiadás, rollback, mentés és CI-határ a [frissítési riportban](CONTABO_OWNER_UPGRADE_REPORT_HU.md) szerepel. Ez az ellenőrzés nem cserélt image-et, szerver-envet, Access policyt, certet vagy Caddy/DNS-t. Nem ismételtük meg a korábbi külön mobil/www/export-próbát; az alábbi dátumozott bizonyítékok ezek akkori lefedettségét őrzik. Belépett pozitív cache-header és kliens-IP/limiter-partíció továbbra külön kapu.

## Korábbi éles UI-bizonyíték — 35f9889

| Próba                | Eredmény                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tulajdonosi Access   | A felhasználó bejelentkezett; a főoldal, Discover és Scenario oldalak a már kiadott originellenőrzésen keresztül ténylegesen megnyíltak. Cookie/JWT/kód nem lett kiolvasva vagy másolva.                                                      |
| Katalógus            | Discovery lapozása 12 + 4, összesen **16 Official élet**; 15 új angol élet és a korábban megőrzött pilot.                                                                                                                                     |
| Olvasók              | Mind a 16 külön deep link betöltve; mindegyikben három fejezet, összesen **48 meglévő fejezet**. A történetek, döntési lehetőségek és AI/Official jelölések megjelennek. Ez betöltési/olvasási próba, nem új generálás vagy új kreatív audit. |
| Idővonal             | Egy élet első fejezetének Timeline vezérlője kinyílt, négy dátumozott eseménnyel. Az automatizált role-locator és a natív AX leképezése eltért; a látható vezérlő tényleges kattintása sikeres. Ez nem termékhiba.                            |
| Scenario             | Mind az **öt angol Scenario** listája és külön részletes oldalai betöltve, identity/goals/starting situation/conditions tartalommal.                                                                                                          |
| WWW                  | A belépett `https://www.alterward.com/discover` ténylegesen az apex HTTPS Discover oldalra irányított, a tartalom ott betöltött.                                                                                                              |
| Olvasási jogosultság | A snapshotok „This copy cannot start a new life yet.” állapotúak. Access-belépés nem adott személyes fiókot, fork/generálási jogot vagy paid UUID-t.                                                                                          |
| Nyelv                | Angol felület és kínálat, vizsgált dokumentumok `lang=en`; magyar nyelvválasztó nem jelent meg.                                                                                                                                               |

Az éles böngészőben külön 1280 × 900 asztali és 390 × 844 mobil viewportot használtunk. A főoldal, Discover és Scenarios mindkét méreten, a reader és Scenario-részlet mobilon is ellenőrzött; a reader asztali idővonalpróbája külön képernyőképet kapott. A vizsgált nyolc dokumentumszélesség-mérésben `scrollWidth <= clientWidth`, nincs horizontális túllógás. A scrollbar miatt a tartalmi szélesség 1265/375 pixel. Az ideiglenes override visszaállítva. Ez nem teljes akadálymentességi audit vagy minden eszközre szóló garancia.

## Korábbi saját Supabase-fiók és éles adatexport

2026-10-09: a felhasználó saját maga állított be jelszót és jelentkezett be. A meghívó **spambe érkezett**, ezt a felhasználó külön megerősítette; inbox-kézbesítés nincs igazolva. A szolgáltatói dashboard saját fiókra szűrt részleteiben Confirmed at **17:45**, Last signed in **17:47** helyi idő látható. A jelszót, levelezési linket és böngészős hitelesítési tokent nem olvastuk ki.

- Az éles /lives felületen a saját fiókhoz tartozó navigáció és Sign out megjelenik; az új fióknak még nincs személyes élete.
- A /privacy és külön /account-access oldal működik; utóbbi „You are signed in.” állapotú, az export engedélyezett, a fióktörlés megerősítés nélkül tiltott.
- **Saját JSON-export letöltve az éles API-ból**, UTC **2026-10-09T15:52:51.592Z**, 2830 byte, contract 1.0.0 / life 2.0.0. A friss-auth szerverkapu átengedte. A fájl 71 felsőszintű tömböt tartalmaz; egyetlen account sorának UUID-ja egyezik a dashboardon látható saját fiókéval. Személyes élet/profil/adatsor nincs, Shared személyes rekord nincs; az exportban lévő alapértelmezett entitlement nem aktív Shared-jogosultság.
- Az export helyi, védett, Gitből kizárt fájlba került; credential mező nem szerepel benne. Az üres új fiók próbája nem igazol új, nem üres kétfiókos izolációt, fióktörlést vagy mentésből történő privacy replay-t.
- Később ugyanabban a belépett sessionben az ismételt export a szerver friss-auth kapuján megállt: „Sign in again within the last five minutes before downloading or deleting your data.” A munkamenet bejelentkezett maradt, de régebbi hitelesítéssel új adatletöltés nem történt. Ez az ötperces exportvédelem pozitív és negatív éles bizonyítéka.

Ez a meghívás utáni saját alkalmazási belépés és adatexport bizonyítéka. A helyreállító levél, lejárt/újrahasznált meghívó, tényleges tiltott signup, SPF/DKIM/DMARC levélfejlécek és bejövő válasz külön ellenőrzendők. Új email, fióktörlés, fizetett generálás vagy tesztelői engedély e próbában nem történt.

## Korábbi belépett olvasás után névtelen külső ellenőrzés

**27 külön, cookie/JWT nélküli HTTPS-kérés** a főoldalra, két katalógusra, mind a 16 olvasóra, az öt Scenario-részletre, védett www Discoverre és két API-útra. Minden válasz a helyes Cloudflare team login kapujára irányított; egyetlen `CF-Cache-Status: HIT` sem volt. A sikeresen belépve olvasott történeteket ezek a névtelen kérések nem kapták vissza. A TLS-lánc és hostname ellenőrzése bekapcsolva, a TLS authorization a response-header eseménynél rögzített.

Ez a kiszolgált oldalak utáni anonim edge-védelem bizonyítéka. A belépett API-válaszok cache-headerjeinek konkrét visszaolvasása, a kliens-IP értéke és limiter-partíciója, illetve a rossz audience/issuer/lejárt JWT külön éles köre nem része ennek; a korábbi izolált JWT-próbák és a [20 első külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) megmaradnak. A belépési cookie-t/tokeneket nem exportáltuk más HTTP-klienshez.

## Következő feladat

1. A már felhasznált valódi recovery-link javítás utáni emberi visszaellenőrzése és spam/inbox-kézbesítés javítása. A saját recovery/belépés, negatív signup és info@ válaszút már ellenőrzött; a meghívó SPF/DKIM/DMARC PASS a felhasználó beszámolója. A nyers link, jelszó vagy kód nem kérhető a chatbe; új levélküldéshez külön konkrét engedély kell.
2. Napi titkosított alkalmazásmentés a jóváhagyott hét napos megőrzéssel, szerver/helyi expiry, privacy/törlés-visszavonás replay és monitor; Auth/grant/Storage határ és redundáns kulcs/offsite biztosítása. A 47 fájlos új config-restore sikeres, napi timer még nincs. A valódi tulajdonosi fiók nem törölhető automatikus smoke-ként.
3. Pontos IP/limiter és pozitív cache-header bizonyíték, aktív fő worker-konténer kiesése/drain és a Cloud-audit megmaradó operatív kapui a tesztelők előtt. A négy tényleges Node-process/PG recovery és az éles image-rollback nem teljes host/provider-kiesési bizonyíték. A CI-container Docker Hub 429 utáni újrafutása külön infrastruktúra-feladat.
4. Később név szerinti legfeljebb tíz tesztelő, külön Auth UUID és a jóváhagyott **10 USD** tényleges harmincnapos keretének aktiválása. Most minden allowance 0, fizetett lista és időablak üres; Shared továbbra kikapcsolt.

A futó alkalmazás `9eb7732`, az ops `46f93e8`; a korábbi mobil/export/www bizonyíték még a `35f9889` / `44e22e5` kiadáson készült. A teljes P01–P13 / Shared S0–S7 terv megmarad. Képernyőképek, AX-bizonyítékok és részletes proofok védett, Gitből kizárt helyi fájlokban; személyes email, user UUID, nyers login URL/token vagy titkos adat nem kerül a publikus riportba.

## 2026-10-10: aktív napi mentés és helyi titkosított másolat

A [napi eszköz és audit](CONTABO_DAILY_BACKUP_MONITOR_HU.md) df7550e szerverforrással, 2eb9a50 helyi transporttal aktív: hét napos managed retention, napi 03:15 UTC backup, negyedórás monitor és óránkénti current-user helyi sync. A 20261010T092255Z-ca2becbc offsite példányból 97 tábla / 1633 sor / 55 configfájl memóriában kezelt kulcsú izolált restore-ja egyezett; tamper elutasítva, ideiglenes adatok/konténerek eltávolítva. Hiányzó-könyvtár és mesterséges kulcsírás SIGKILL/monitor cleanup célpróba sikeres, host-reboot nélkül. 24 új Linux eset mind sikeres, 65 helyi Python esetből 64 sikeres + egy Windows-korlát; hat Node-retention és két valós helyi pin-negatív próba sikeres. A valódi Windows task kézi és első automatikus futása eredmény 0; a pontos [verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38041820645) zöld.

Claude elfogadta a napi és transportjavításokat; a 12 új findinggel összesen 55 megfigyelés, nem 55 igazolt hiba. DLY-05/06/07/10/11/12 határai és a külön UPG-10 low feladat megmaradnak. Forrásaudit, célpróba és jövőbeli üzembiztonság külön bizonyíték. App 9eb7732 / egy owner / eredeti Access/CA és nulla paid allowance változatlan; hat idegen futó konténer a korábbi baseline-nal egyezik. Új provider-költés 0 USD. A mentés nem zárja le a deletion/revocation replay, történeti retention, hosztolt Auth/Storage/grants, külső riasztás/független kulcsmentés vagy teljes worker-/host-/providerhibaút kapuját. A teljes P01–P13 / Shared S0–S7 és az inaktív 10 USD/tízfős béta megmarad.


## 2026-10-10: tényleges felhasznált recovery-link ellenőrzése

A felhasználó a korábban már felhasznált saját „Reset your Alterward password” linket újranyitotta az éles oldalon, és pontosan ezt az üzenetet jelentette:

> That sign-in link is invalid, expired, or has already been used. Request a new link, or sign in with your password.

Ez a javítás utáni valódi link emberi end-to-end visszaellenőrzése, külön a korábbi szintetikus callback-próbától. A konkrét callback/token nem lett kiolvasva; az általános üzenetből a szolgáltatói hibakódot nem következtetjük ki. A reused-link megjelenítési kapu lezárt. Új levélküldés, jelszóváltoztatás vagy jogosultság-aktiválás nem történt. A korábbi két levél spambe érkezett; inbox/reputáció és szolgáltatói delivery/bounce ellenőrzés továbbra feladat.
