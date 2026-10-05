# alterward — angol kiadás és nyelvi kompatibilitás

2026-10-04 · [Indulási döntés](ENGLISH_RELEASE_PLAN_HU.md) · [Közös státusz](STATUS_HU.md) · [Dokumentációs központ](README.md).

## Aktív nyelvi policy

A legújabb felhasználói döntés szerint az induló termék kizárólag angol felületet és angol AI-történeteket ad. A magyar minták fogalmazására érkezett kritika; a magyar felület és generálás most halasztott. Az AI végzi az angol szerkesztői ellenőrzést, majd a korlátozott éles béta visszajelzései alapján javítunk. Előzetes kézi EN/HU minősítésre nem várunk. A fejlesztési dokumentáció magyar marad.

| Terület | Jelenlegi működés |
|---|---|
| Regiszter | `supportedLocales` = `en`, `hu` tárolt/kutatási kompatibilitás; `enabledLocales` = csak `en` a termékben |
| Felület | Angol katalógus minden képernyőn; a nyelvválasztó egy engedett nyelvnél nem jelenik meg |
| Régi cookie | `alterward_locale=hu` is angol HTML/metadata/kliensnyelvet eredményez; az engedélyezett nyelv szerver- és kliensoldalon is szűrt |
| API-feliratok | `Accept-Language: hu` mellett is angol kérdőív és biztonságos hiba |
| Új élet/draft | V1 future és v2 create/draft request csak `locale: en`; explicit `hu` 422, generálási job nélkül |
| Visszatöltött draft | Az új onboarding az angol felület nyelvét rögzíti, a többi válasz/revision megmarad |
| Régi magyar történetek | Nem jelennek meg a v1/v2 listában; közvetlen olvasás/timeline/job/choice/continue/fork/retry/preview az API-n elrejtve |
| Saját adatok | Az ingyenes export a régi HU adatokat is megőrzi; fióktörlés ugyanazt a teljes adatgráfot kezeli |
| Kánon/adatbázis | A mentett `content_locale` immutable; alkalmazott migráció és korábbi történet nem módosul |
| Későbbi nyelvek | Katalógusok és kódok megmaradnak; visszakapcsolás külön termékdöntés és nyelvi minősítés |

## AI-tartalom

Új életek és folytatásaik angol nyelvű eseményt, döntést, opciót, címet, narrációt és ellenőrzési megjegyzést kapnak. Más nyelvű szabad szöveges bemenet nem írhatja felül a kimeneti nyelvet. Az AI provider magyar képessége a külön kutatási eszközben megmarad; ez nem engedélyez új magyar termékéletet. Régi, már tárolt jobok nyelvi jelentését nem változtatjuk meg.

A felület és tartalomnyelv megkülönböztetése megmarad a szerződésekben. `Locale` és a tárolt v2 input/setup/draft sémák olvassák a korábbi `hu` adatot is; az új `lifeCreateRequestV2Schema` és `lifeDraftRequestV2Schema` az engedett terméknyelvre szűkít. A [kódból exportált request-sémák](contracts/v2/lifeCreateRequest.schema.json) ezt külön mutatják. Olvasás, újratöltés és a nyelvi elrejtés nem indít API-generálást vagy fizetett fordítást.

A jelenlegi környezetsablon magyar földrajzi kontextusa külön kérdés a történet angol nyelvétől. Profilérték, opcióazonosító, kérdőívhash, pénznem és szabad felhasználói címke nem fordul át automatikusan. A kérdőív angol megjelenítése ugyanazokat az adatkulcsokat/pontozást használja.

## Nyelvek későbbi engedélyezése

1. Teljes katalógus, kérdőív és biztonságos hibaszöveg, egyező kulcsokkal/interpolációval.
2. A nyelv regisztrálása és additív DB-nyelvkód-bővítés, ha még nincs támogatva; alkalmazott migráció nem írható át.
3. Többidőszakos valódi AI-próba és dokumentált nyelvi ellenőrzés, különösen a magyar természetes fogalmazás javítása.
4. Az `enabledLocales` bővítése, csak az elfogadott kiadási döntés után. Ekkor válik láthatóvá a választó és használhatóvá az adott nyelv.
5. Public tartalom/keresés/SEO és RTL szükség szerint; olvasáskor továbbra sincs fizetett fordítás.

## Korábbi mérési bizonyíték

A kétnyelvű alap korábban működött: angol/magyar v1 alap és ág, 12 valódi OpenAI-hívással és 0,3352520 USD becsléssel. V2-ben négy EN/HU Sol/Luna lánc ×3 időszak és Claude külső audit készült. Ezek történeti mérések, nem aktív kétnyelvű kiadási követelmények. A minta szövege és nyers mérési eredménye változatlan. [Angol háromidőszakos fő minta](examples/AI_V2_ENGLISH_STORY.md), [angol Claude-próbák](examples/CLAUDE_GENERATED_STORIES_EN.md), [audit](examples/CLAUDE_EXTERNAL_AUDIT_HU.md).

A korábbi böngészős próba két nyelvet és 390 px nézetet ellenőrzött. Az angol átállás új regressziói: HU-cookie, HU-fejléc, tiltott új HU élet/draft, elrejtett régi v1/v2 történet, változatlan export/kánon és angol fióktörlési megerősítés. 2026-10-04-én a valódi szintetikus Supabase-fiókos angol HTTP- és böngészős végigpróba sikeres: onboarding/draft, fejezet/döntés/folytatás, visszatérés/export, Auth/DB-törlés és kontrollált recovery. [Bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md). Email-kézbesítés, teljes backup/restore és éles deploy továbbra külön P06 ops-kapu.

## Shared Context tervezett lokalizációja

Connections, meghívó/consent/entitlement/decision/block/report és SHARED_* hibák angolul kerülnek kiadásra. A context és a shared job mentett locale-ja az aktív EN-policyt követi; a forrás EN/HU mintakatalógusa nem kapcsolja vissza a magyart. A shared szerződés külön verzió, a meglévő HU adatok/export kompatibilitása megmarad. Másik context nyelve nem fordítja át és nem generálja újra a személyes canont. [Új integrációs terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
