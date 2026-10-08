# alterward — tízfős zárt béta AI-hozzáférése

2026-10-08-i email-pontosítás: **info@alterward.com** a hivatalos kapcsolati/értesítési cím, Cloudflare Email Routing → privát Gmail továbbítása megerősített. Az üzemeltető külön belépési címe védett helyi konfigurációban rögzítve. Küldő: meglévő **SMTP2GO EU-fiók**, hitelesített alterward.com domain a felhasználó szerint; Auth-feladó `Alterward <noreply@alterward.com>`, kívánt Reply-To `info@alterward.com`. Dedikált SMTP-hozzáférés, hosztolt Supabase Custom SMTP bekötés, tényleges kézbesítés/fejlécek és Auth/Access próba még szükséges. A VPS env önmagában nem konfigurálja a Supabase küldést. [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Beállítási útmutató](SMTP2GO_SUPABASE_SETUP_HU.md).

2026-10-08-i elfogadott kiegészítés: előbb üzemeltető számára zárt Contabo-indulás, utána tesztelői meghívás; Cloudflare Access + külön originellenőrzés és saját export/törlés kivétel. Az éles útvonal aktiválása előtt kötelező a [részletes Claude Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md), a jelzések önálló ellenőrzése és a kiadási hibák javítása. A [zárt kiadási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) a teljes P01–P13 / Shared S0–S7 terv része; a 10 USD keret és a tényleges használattól számított 30 nap változatlan. A [helyi originvédelem és külön saját-fiókos felület](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md) implementált és helyben ellenőrzött: teljes check, 666 sikeres teszt / 63 fájl, két korábbi Windows-kihagyás, production build és 19 HTTP-próba. Éles konfiguráció és teljes Cloud-audit még nincs.

2026-10-08-i felhasználói pontosítás: **info@alterward.com** a kapcsolattartási cím; tesztelők még nincsenek, meghívásuk a védett Contabo-telepítést követi. A tényleges UUID-lista a fizetett használathoz kell, a telepítés üres listával és inaktív kerettel előkészíthető. A teljes webhely [külön Access/origin/account-rights terve](CLOSED_SITE_RELEASE_PLAN_HU.md) elfogadott; élesben még nem aktív védelem.

2026-10-07 · Helyben implementálva, éles aktiválás még nincs

A jóváhagyott indulás 15 angol Official Life, öt Scenario és legfeljebb tíz tesztelő, összesen 10 USD AI-keretből. Az előállítás maximum 6 USD OpenAI + 1 USD Claude; a béta használatára fenntartott 2 + 1 USD külön marad. A teljes kínálat és a teljes nyilvános indulás későbbi lépés. [Keret és időszak](AI_PRODUCTION_BUDGET_HU.md).

## Meghívási jogosultság

A szerveroldali `CLOSED_BETA_ENABLED=true` mellett kizárólag a `CLOSED_BETA_USER_IDS` listában szereplő, hitelesített Supabase Auth UUID indíthat fizetett generálást. A lista legfeljebb tíz különböző UUID; duplikáció, tizenegyedik tag, e-mail vagy hibás konfiguráció elutasított. Bekapcsolt béta üres listával senkinek nem ad generálási jogosultságot. Az azonosítók az API és a worker konfigurációjába kerülnek; webcsomagba és nyilvános válaszba nem.

Mind a tizenkét jelenlegi generálási belépési pont ellenőrzi ezt a hitelesítés után, a sorba állítás előtt: régi future/decision, új élet/folytatás/történeti fork, Scenario-start, külön személyes Scenario-start, nyilvános életből saját fork, Shared-folytatás, mindkét public-review és kézi job-retry. A worker adatbázis-költségőre közvetlenül a foglalás előtt újra ellenőriz, így a listából kivett felhasználó korábbi függő jobja sem költhet.

A saját mentett adatok olvasása, exportja, hozzájárulás kezelése, tartalom-visszavonás és törlés továbbra elérhető a meghívási jogosultságtól függetlenül. A meghívási ellenőrzés a fizetett műveletekre vonatkozik; a teljes webhely hozzáférésének zárása külön telepítési feladat. A jelenlegi anonim olvasókat ez önmagában nem rejti el.

## A tesztkeret kikényszerítése

Bekapcsolt bétánál a költségkonfiguráció elutasítja a 2 USD-nél nagyobb OpenAI-, az 1 USD-nél nagyobb Claude-projektplafont és a 0,50 USD-nél nagyobb közös személyes plafont. Pontosan harmincnapos, rögzített kezdő- és záróidő szükséges. Nincs következő havi automatikus keret. A meglévő tranzakciós foglalás, két szolgáltató közös személyes számlája és ismeretlen usage teljes foglalása megmarad.

Az előállítás külön védett operator-folyamat, külön naplóval és költségidőszakkal; nem kapcsoljuk ki miatta a béta védelmét, és nem költhet a fenntartott tesztkeretből. Ennek folytatható 15/5 batch-folyamata még következik.

## Bizonyíték és hátralévő kapuk

Hat új érdemi konfiguráció-/adatbázis-/HTTP-próba ellenőrzi a maximális létszámot, hibás és üres listát, a limit/időszak védelmét, a másolt lista módosításának hatástalanságát, a providerhívás előtti tiltást és a szabad adatkezelési műveleteket. A célzott sorozat 19 teszt/2 fájl; a teljes `pnpm check` 624 teszt/57 fájl, formázás, típusellenőrzés, script types és production build sikeres. Új SQL-migráció vagy JSON-séma nincs: a 001–036 és mind a 162 meglévő séma változatlan. Új paid AI-hívás nulla.

A megelőző angol Scenario-felület `3c9a6edc` pontos [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37681767172) verify és container sikeres: 618/56/162, 001–036 és ismétlés, az összes korábbi PostgreSQL-proof és verified HTTPS/DB TLS. Az új meghívási kapu saját commitjának pontos CI-je még külön ellenőrizendő. Pozitív interaktív UI-próba továbbra nincs igazolva.

A normál helyi és telepítési mintákban a béta flag false, a meghívási lista üres; új használati költségidőszak nincs aktiválva. A tényleges tíz tesztelő kiválasztása, UUID-k rögzítése, a teljes webhely zárása, a 15/5 kínálat/audit, kapcsolattartási e-mail, retention/backup/restore és Contabo-telepítés még indulási feladat. Nem küldtünk meghívókat vagy más üzenetet.


## Pontos admission CI lezárva

A `c53aa58e0d0213c694d3e5160e0e3b4e4cd45269` [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37684863424) verify és container sikeres: 624/57/162, 001–036/repeat, PostgreSQL-proofok és HTTPS/DB TLS. Ez lezárja a fenti akkori függő CI-kaput. A teljes webhely-zárás és a tíz tényleges meghívott továbbra indulási feladat; normál runtime nem aktivált. A külön, jóváhagyott [15/5 seed előállítás](CLOSED_BETA_CATALOG_REPORT_HU.md) azóta valódi fizetett hívásokat használ az eredeti 6 + 1 USD plafonból.
