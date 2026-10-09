# alterward — éles tulajdonosi felületpróba

2026-10-09 · [Domainbekötés és rollback](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit értékelése](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).

**A tulajdonos Cloudflare OTP-belépése után az éles Contabo-felület és a teljes olvasási kínálat működik.** Az alkalmazási Supabase-belépés ettől külön kapu. A kezdeti emailre szűrt keresés nulla fiókot mutatott; a felhasználó később konkrétan jóváhagyta a saját angol meghívó elküldését. Egy meghívó elküldve, a saját fiók és **2026-10-09T15:20:55.874604Z** meghívási idő visszaolvasva. A felhasználó ezután jelezte a saját jelszó beállítását és a belépést; a meghívó a spam mappában volt. A Supabase megerősített fiókot és belépést mutat, a belépett Account access oldalról a friss-auth saját export ténylegesen letöltődött. A nyers callback-linket nem olvastuk ki; recovery, inbox-kézbesítés, levélfejlécek és támogatási válaszút még külön kapuk. Provider-hívás vagy fizetett bétaaktiválás nem történt.

## Tényleges éles UI-bizonyíték

| Próba | Eredmény |
| --- | --- |
| Tulajdonosi Access | A felhasználó bejelentkezett; a főoldal, Discover és Scenario oldalak a már kiadott originellenőrzésen keresztül ténylegesen megnyíltak. Cookie/JWT/kód nem lett kiolvasva vagy másolva. |
| Katalógus | Discovery lapozása 12 + 4, összesen **16 Official élet**; 15 új angol élet és a korábban megőrzött pilot. |
| Olvasók | Mind a 16 külön deep link betöltve; mindegyikben három fejezet, összesen **48 meglévő fejezet**. A történetek, döntési lehetőségek és AI/Official jelölések megjelennek. Ez betöltési/olvasási próba, nem új generálás vagy új kreatív audit. |
| Idővonal | Egy élet első fejezetének Timeline vezérlője kinyílt, négy dátumozott eseménnyel. Az automatizált role-locator és a natív AX leképezése eltért; a látható vezérlő tényleges kattintása sikeres. Ez nem termékhiba. |
| Scenario | Mind az **öt angol Scenario** listája és külön részletes oldalai betöltve, identity/goals/starting situation/conditions tartalommal. |
| WWW | A belépett `https://www.alterward.com/discover` ténylegesen az apex HTTPS Discover oldalra irányított, a tartalom ott betöltött. |
| Olvasási jogosultság | A snapshotok „This copy cannot start a new life yet.” állapotúak. Access-belépés nem adott személyes fiókot, fork/generálási jogot vagy paid UUID-t. |
| Nyelv | Angol felület és kínálat, vizsgált dokumentumok `lang=en`; magyar nyelvválasztó nem jelent meg. |

Az éles böngészőben külön 1280 × 900 asztali és 390 × 844 mobil viewportot használtunk. A főoldal, Discover és Scenarios mindkét méreten, a reader és Scenario-részlet mobilon is ellenőrzött; a reader asztali idővonalpróbája külön képernyőképet kapott. A vizsgált nyolc dokumentumszélesség-mérésben `scrollWidth <= clientWidth`, nincs horizontális túllógás. A scrollbar miatt a tartalmi szélesség 1265/375 pixel. Az ideiglenes override visszaállítva. Ez nem teljes akadálymentességi audit vagy minden eszközre szóló garancia.

## Saját Supabase-fiók és éles adatexport

2026-10-09: a felhasználó saját maga állított be jelszót és jelentkezett be. A meghívó **spambe érkezett**, ezt a felhasználó külön megerősítette; inbox-kézbesítés nincs igazolva. A szolgáltatói dashboard saját fiókra szűrt részleteiben Confirmed at **17:45**, Last signed in **17:47** helyi idő látható. A jelszót, levelezési linket és böngészős hitelesítési tokent nem olvastuk ki.

- Az éles /lives felületen a saját fiókhoz tartozó navigáció és Sign out megjelenik; az új fióknak még nincs személyes élete.
- A /privacy és külön /account-access oldal működik; utóbbi „You are signed in.” állapotú, az export engedélyezett, a fióktörlés megerősítés nélkül tiltott.
- **Saját JSON-export letöltve az éles API-ból**, UTC **2026-10-09T15:52:51.592Z**, 2830 byte, contract 1.0.0 / life 2.0.0. A friss-auth szerverkapu átengedte. A fájl 71 felsőszintű tömböt tartalmaz; egyetlen account sorának UUID-ja egyezik a dashboardon látható saját fiókéval. Személyes élet/profil/adatsor nincs, Shared személyes rekord nincs; az exportban lévő alapértelmezett entitlement nem aktív Shared-jogosultság.
- Az export helyi, védett, Gitből kizárt fájlba került; credential mező nem szerepel benne. Az üres új fiók próbája nem igazol új, nem üres kétfiókos izolációt, fióktörlést vagy mentésből történő privacy replay-t.
- Később ugyanabban a belépett sessionben az ismételt export a szerver friss-auth kapuján megállt: „Sign in again within the last five minutes before downloading or deleting your data.” A munkamenet bejelentkezett maradt, de régebbi hitelesítéssel új adatletöltés nem történt. Ez az ötperces exportvédelem pozitív és negatív éles bizonyítéka.

Ez a meghívás utáni saját alkalmazási belépés és adatexport bizonyítéka. A helyreállító levél, lejárt/újrahasznált meghívó, tényleges tiltott signup, SPF/DKIM/DMARC levélfejlécek és bejövő válasz külön ellenőrzendők. Új email, fióktörlés, fizetett generálás vagy tesztelői engedély e próbában nem történt.

## Belépett olvasás után névtelen külső ellenőrzés

**27 külön, cookie/JWT nélküli HTTPS-kérés** a főoldalra, két katalógusra, mind a 16 olvasóra, az öt Scenario-részletre, védett www Discoverre és két API-útra. Minden válasz a helyes Cloudflare team login kapujára irányított; egyetlen `CF-Cache-Status: HIT` sem volt. A sikeresen belépve olvasott történeteket ezek a névtelen kérések nem kapták vissza. A TLS-lánc és hostname ellenőrzése bekapcsolva, a TLS authorization a response-header eseménynél rögzített.

Ez a kiszolgált oldalak utáni anonim edge-védelem bizonyítéka. A belépett API-válaszok cache-headerjeinek konkrét visszaolvasása, a kliens-IP értéke és limiter-partíciója, illetve a rossz audience/issuer/lejárt JWT külön éles köre nem része ennek; a korábbi izolált JWT-próbák és a [20 első külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) megmaradnak. A belépési cookie-t/tokeneket nem exportáltuk más HTTP-klienshez.

## Következő feladat

1. **Saját belépés és export kész:** a jelszót a felhasználó állította be; Supabase-confirmation/sign-in, belépett UI és saját UUID-val egyező friss-auth export ellenőrzött. A meghívó spambe érkezett. Következő a levélfejlécek/alignment és recovery/lejárt-link/tiltott signup külön próbája; a Codex nem kér jelszót/linket/kódot a chatbe.
2. Támogatási válaszút és spam/alignment/fejlécek ellenőrzése; saját törlés/pending recovery és backup privacy-replay külön, biztonságos próbakörben. A valódi tulajdonosi fiók nem törölhető automatikus smoke-ként. A saját owner fiók létrehozása nem tesztelői meghívás vagy paid aktiválás.
3. Pontos IP/limiter és pozitív cache-header bizonyíték, privacy notice/retention/törlés-replay, monitor/pending recovery, valamint a Cloud-audit személyes paid-job concurrency/repair/restart kapui a tesztelők előtt. A korábbi alacsony API robots-header egységesítés is megmarad.
4. Később név szerinti legfeljebb tíz tesztelő, külön Auth UUID és a jóváhagyott **10 USD** tényleges harmincnapos keretének aktiválása. Most minden allowance 0, fizetett lista és időablak üres; Shared továbbra kikapcsolt.

A futó alkalmazás továbbra a már auditált `35f9889`, az indító ops `44e22e5`. E felületellenőrzés nem cserélt image-et, szerver-envet, Access policyt, certet, Caddy/DNS-t vagy költségkeretet. A teljes P01–P13 / Shared S0–S7 terv megmarad. Képernyőképek, AX-bizonyítékok és részletes proofok védett, Gitből kizárt helyi fájlokban; személyes email, user UUID, nyers login URL/token vagy titkos adat nem kerül a publikus riportba.
