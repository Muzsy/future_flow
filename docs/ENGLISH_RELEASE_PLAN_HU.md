# alterward — angol indulás és visszajelzések

2026-10-05 · Aktív felhasználói döntés és friss ellenőrzési státusz. [Aktív termékterv](PRODUCT_PLAN_HU.md) · [Sorrend](NEXT_STEPS.md) · [Éles telepítés](DEPLOYMENT_HU.md).

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

## Shared Context fokozatos angol kiadása

Az új [S0–S7 terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) minden UI-, hiba- és AI-szöveget angolul ad; a magyar továbbra elrejtve. Foundation és determinisztikus engine csak kikapcsolt funkció/izolált teszt. Első friend béta S2 valódi Shared AI és S3 saját AI-folytatásba épülő impact után, teljes entitlement/consent/block/report/privacy/export/törlés kapuval. A személyes privát béta üzemeltetési útja ettől külön is haladhat; minden későbbi típus nem előfeltétele a személyes béta indulásának. Nincs új kézi EN/HU jóváhagyás; kiadás után shared élményre is valódi angol használói visszajelzést gyűjtünk. Contabo/domain/éles keret továbbra későbbi, külön kapu.


## Shared S3 rész és kiadási határ — 2026-10-05

S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes ellenőrzés](SHARED_CONTEXT_S3_REPORT_HU.md), [angol minta](examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md), [külső Claude-audit](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
