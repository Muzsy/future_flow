# alterward — éles tulajdonosi felületpróba

2026-10-09 · [Domainbekötés és rollback](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) · [Kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit értékelése](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).

**A tulajdonos Cloudflare OTP-belépése után az éles Contabo-felület és a teljes olvasási kínálat működik.** Az alkalmazási Supabase-belépés ettől külön kapu. A kezdeti emailre szűrt keresés nulla fiókot mutatott; a felhasználó később konkrétan jóváhagyta a saját angol meghívó elküldését. Egy meghívó elküldve, a saját fiók és **2026-10-09T15:20:55.874604Z** meghívási idő visszaolvasva. Kézbesítés, HTTPS callback, jelszóbeállítás és friss saját belépés még felhasználói próba. Provider-hívás vagy fizetett bétaaktiválás nem történt.

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

## Belépett olvasás után névtelen külső ellenőrzés

**27 külön, cookie/JWT nélküli HTTPS-kérés** a főoldalra, két katalógusra, mind a 16 olvasóra, az öt Scenario-részletre, védett www Discoverre és két API-útra. Minden válasz a helyes Cloudflare team login kapujára irányított; egyetlen `CF-Cache-Status: HIT` sem volt. A sikeresen belépve olvasott történeteket ezek a névtelen kérések nem kapták vissza. A TLS-lánc és hostname ellenőrzése bekapcsolva, a TLS authorization a response-header eseménynél rögzített.

Ez a kiszolgált oldalak utáni anonim edge-védelem bizonyítéka. A belépett API-válaszok cache-headerjeinek konkrét visszaolvasása, a kliens-IP értéke és limiter-partíciója, illetve a rossz audience/issuer/lejárt JWT külön éles köre nem része ennek; a korábbi izolált JWT-próbák és a [20 első külső próba](CONTABO_OWNER_DOMAIN_ACTIVATION_REPORT_HU.md) megmaradnak. A belépési cookie-t/tokeneket nem exportáltuk más HTTP-klienshez.

## Következő feladat

1. **Saját meghívó elküldve:** a konkrét emberi jóváhagyás után egy angol Supabase-meghívó ment, a fiók és meghívási idő visszaolvasva; ez nem inbox-kézbesítési bizonyíték. Következő Gmail/spam ellenőrzés, HTTPS `/account-access` callback, legalább tízkarakteres jelszó saját beállítása és friss belépés. Az új jelszó teljes megadását/megerősítését/mentését a böngésző biztonsági szabálya szerint a felhasználó végzi; a Codex nem kér jelszót/linket/kódot a chatbe.
2. Saját adatexport/joggyakorlás és támogatási válaszút; spam/alignment/fejlécek, tiltott signup és invite/recovery tényleges éles ellenőrzése. A saját owner fiók létrehozása nem tesztelői meghívás vagy paid aktiválás.
3. Pontos IP/limiter és pozitív cache-header bizonyíték, privacy notice/retention/törlés-replay, monitor/pending recovery, valamint a Cloud-audit személyes paid-job concurrency/repair/restart kapui a tesztelők előtt. A korábbi alacsony API robots-header egységesítés is megmarad.
4. Később név szerinti legfeljebb tíz tesztelő, külön Auth UUID és a jóváhagyott **10 USD** tényleges harmincnapos keretének aktiválása. Most minden allowance 0, fizetett lista és időablak üres; Shared továbbra kikapcsolt.

A futó alkalmazás továbbra a már auditált `35f9889`, az indító ops `44e22e5`. E felületellenőrzés nem cserélt image-et, szerver-envet, Access policyt, certet, Caddy/DNS-t vagy költségkeretet. A teljes P01–P13 / Shared S0–S7 terv megmarad. Képernyőképek, AX-bizonyítékok és részletes proofok védett, Gitből kizárt helyi fájlokban; személyes email, user UUID, nyers login URL/token vagy titkos adat nem kerül a publikus riportba.
