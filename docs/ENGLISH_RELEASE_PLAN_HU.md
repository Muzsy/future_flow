# alterward — angol indulás és visszajelzések

2026-10-04 · Aktív felhasználói döntés és friss ellenőrzési státusz. [Aktív termékterv](PRODUCT_PLAN_HU.md) · [Sorrend](NEXT_STEPS.md) · [Éles telepítés](DEPLOYMENT_HU.md).

## Elfogadott irány

Az induló termék kizárólag angol: felület, onboarding, kérdőív, biztonságos hibaüzenetek, AI-események, döntések és történetfejezetek. A magyar felület és új magyar generálás elrejtve/letiltva. A regiszter, fordítások és régi magyar adatok megmaradnak a későbbi nyelvbővítéshez; nem fordítjuk át és nem töröljük őket. A felhasználó a magyar mintákban magyartalanságokat talált, ezért a magyar nyelvi munka most halasztott. A fejlesztési dokumentáció magyar maradhat.

Az angol szerkesztői döntéseket a fejlesztő AI-ra bízta. Nem kérünk tőle angol pontozást, és nem várunk indulás előtt EN/HU emberi pilotra. A felhasználó vállalja az angol béta bevezetését és a valódi használók visszajelzései alapján történő javítást. Ez elfogadott indulási stratégia, nem bizonyított történetminőség vagy retenció.

## Ellenőrzés az indulás előtt

1. Automatikus domain-, kánon-, hozzáférési és költségellenőrzés; angol narráció és megtévesztő jóslatok kerülése. Ismert, kánont módosító vagy tartós tényeket kitaláló hibás fejezet nem kerül ki.
2. Az AI szerkesztői szemmel vizsgálja a személyességet, a konkrét jeleneteket, a döntési tétet, az ismétlést és a természetes angolt. Sonnet külső auditor, Opus vitás esetek/mintavétel jelöltje; a meglévő auditorok pontjai külön gépi vélemények.
3. Valódi Supabase-belépés, első időszak, döntés, folytatás, visszatérés, fork, export és Auth/DB-törlés, majd mentés/visszaállítás próba. A magyar részek elrejtése nem törli az exportálható saját adatokat.
4. Tárhely, éles URL, Supabase Auth engedett URL-ek, HTTPS, titkos környezet és külön éles AI-keret. A két fejlesztői 5 USD keret nem ad automatikus havi tárhely- vagy nyilvános generálási keretet.
5. A kiadásban elérhető visszajelzési csatorna és hibákért felelős folyamat. A privát általános és fejezethez kötött űrlap elkészült, exportálható/törölhető visszajelzéssel és napi limittel. [Működés](BETA_FEEDBACK_AND_METRICS_HU.md).

A nyilvános életkiadás/Discovery/Save/Share/Fork a közösségi terv része marad. Ezeket a privacy, snapshot, moderáció és törlés ellenőrzése után kapcsoljuk be; a technikailag kész privát életmotor korábban is indulhat korlátozott angol bétaként. A béta nem a teljes közösségi MVP készre jelentése.

## Bevezetés és tanulás

Először kis, költséglimites angol béta; utána a kerethez igazított szélesítés. A 20–50 résztvevő mérési cél, nem indulás előtti kötelező létszám. Nem töltjük fel automatikusan az 50–100 Official Life célállományt. A magyar és további nyelvek visszakapcsolása külön későbbi döntés és nyelvi ellenőrzés.

A visszajelzés lehet: természetellenes angol, ismétlődés, hihetetlen részlet/kánonhiba, érthetetlen döntés, folytatási igény vagy technikai hiba. Önkéntes szöveg; privát teljes történet vagy profil beküldése nem kötelező. Kezdetben hetente áttekintjük a beérkezett visszajelzéseket és méréseket; ez munkaterv, ütemezett automatizálás nem készült.

Mérjük az első sikeres fejezetet, a döntést, a folytatás kattintását és tényleges sikerét, a visszatérést, a hibaarányt és a költséget elfogadott időszakonként. A szerveroldali session/olvasásvég-kohorsz és sikeres későbbi folytatás implementálva; a 30 perces inaktivitási ablak kezdeti munkadöntés, a láthatósági jel nem bizonyított olvasás vagy retenció. Kritikus adatkezelési/kánonhiba esetén a kapcsolódó funkció leállítható, a nyelvi és élménybeli megjegyzések következő verzióba kerülnek.

## Aktuális technikai döntés

`supportedLocales` a tárolt/kutatási `en`/`hu` adatok olvasását szolgálja; `enabledLocales` jelenleg csak `en`. A felület és API az engedett regisztert követi. Régi magyar cookie mellett is angol HTML/metadata/hiba jelenik meg. Új v1/v2 élet és új v2 draft csak angol kéréssel hozható létre. Régi magyar élet nem jelenik meg a listában, közvetlen olvasása/új ága/folytatása sem érhető el a termék API-ján. A visszaállított onboarding-draft az angol kiadás nyelvét kapja, a korábbi mentett életek változatlanok.

A worker Sol-modelljei maradnak; a Sonnet/Opus auditor önálló kutatási eszköz. A magyar Claude-minták archivált mérési bizonyítékok, nem induló tartalom. Az eredeti kimeneteket nem írjuk át a korábbi mérésben.

## Előzetes AI szerkesztői döntés

Az OpenAI v2 angol fő mintája érthető, természetes angol prózát, világos időrendet és arányos, kánonhoz kötött döntési téteket ad. Korlátozott béta alapjának megfelelő. A három fejezet visszatérő óvatos szerkezete, idő-/pénzkeret ismétlése és visszafogott kíváncsisága javítandó; ezt a Claude audit is jelezte. Ez szerkesztői indulási ítélet, nem anyanyelvi használók mérése. Haiku hibás próbája nem induló tartalom; a javított Sonnet angol mintában jelzett helyi részlet sem kerül automatikusan Official kiadásba.

## 2026-10-04-i előrelépés

[2026-10-04-i béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md): tényleges Supabase/Auth/DB/OpenAI HTTP-hurok és fióktörlés sikeres; új angol történet Sonnet auditja kánonhű és nyelvileg helyes. Contabo Docker/Compose/Caddy előkészítve, domain és élesítés később. Böngészős onboarding, visszatérés/export és kontrollált megszakításból admin recovery is sikeres. A teljes izolált web/API/worker/Caddy CI, Contabo Compose/proxy preflight, kulcsos SSH és jelszavas tiltás kész. [Operatív eredmény](CONTABO_PREPARATION_REPORT_HU.md). Backup/restore, valós DB-kiesésből helyreállítás, email-kézbesítés, TLS/tűzfal/karbantartás, domain és külön éles költségkeret továbbra kapu; éles deploy nincs.
