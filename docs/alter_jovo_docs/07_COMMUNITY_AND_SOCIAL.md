# alterward — nyilvános életek, Discovery és közösség

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-05 · Az összes itt leírt public funkció **tervezett**, még nincs bekötve. [Részletes terv](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [Forrás](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md).

## Rétegek és láthatóság

Private Personal Simulation, kurált Official Lives/Scenarios és önként megosztott Community Lives kapcsolódik össze. Minden saját élet alapból privát. A láthatóság pontosan **private / unlisted / public**; az anonymous author megjelenítési beállítás, nem negyedik jogosultsági szint.

Unlisted csak erős titkos linkkel érhető el, nincs Discovery/sitemap/SEO. Public csak aktív, moderáció által engedett külön snapshot. Szerző megjelenítése és külső indexelés külön döntés; Community SEO opt-in. Official badge csak curator-jogosultság alapján. Teljes profil, memória, prompt, privát jegyzet/állapot és belső ID nem nyilvános.

## Public életoldal és Discovery

Életoldal: cím/summary, opcionális szerző, eredetjelölés, idővonal, mérföldkő, kiadott döntés/opció/ág, Save/Share/Fork/Report. Kategória és nyelv szerinti böngészés; Featured, Trending, Most Forked, Turning Points, Official, Community Picks kurált kollekciók.

Taxonómia: career, business, money, relationships, family, education, lifestyle, moving abroad, starting over, personal growth, adventure, historical, fictional. A történelmi/fiktív címke nem kész külön világmotort jelent. AI címkejavaslat csak jóváhagyva. Egyszerű aggregált ranking: sikeres fork erősebb jel mint view, spam/duplikátum és moderációs státusz figyelembevételével. Report számából nem következik felülvizsgálat nélküli tömeges eltüntetés; ML-ajánló később.

## Publikálás

Kiválasztás → láthatóság/szerző/index/forkengedély → PII/tartalmi scan → Privacy Preview → teljes Content Preview és checkpoint → explicit hash/revision/scanverzióhoz kötött Confirm. Módosult preview új jóváhagyást kér. Scan nem garantál anonimitást és más személy adata nem válik kiadhatóvá a szerző kattintásától. Privát továbbírás csak új snapshotverzió + preview után kerülhet ki.

## Saját élet nyilvános forrásból

Fork this life, Start from this decision és Personalize scenario új tulajdonos új privát életét hozza létre sanitized állapotból, új belső ID-kkel. Nincs jogosultság vagy privát forráselőzmény öröklés. A döntés előtti checkpointból a választás egyszer alkalmazódik; a sablon és eredeti élet változatlan. Visszavont forrásból új fork nem készülhet.

## Moderáció és visszavonás

Minimum scan, Report, review queue, soft hide, hard remove, figyelmeztetés és ismételt visszaélés korlátozása, rate-limit/dedup/audit. PII, doxxing, zaklatás, gyűlölet, explicit/erőszakos/illegális tartalom, csalás, spam és megszemélyesítés kezelendő. Unpublish az új olvasást/forkot, linket, listázást, saját index/cache/OG-t vonja vissza. Törlés a public adatgráfra is kiterjed; korábbi privát fork forrásattributionje leválasztandó, érzékeny másolatok külön takarítási szabállyal.

## Sorrend és gazdaság

Személyes core → snapshot/Official kis seed → olvasható Discovery + Save/Share/Report → Community Publishing → public fork → később reakció/követés → végül komment. A közösségi 14 MVP-elemet a [visszakövetés](../REQUIREMENTS_TRACEABILITY_HU.md) tételesen felsorolja. DM/chat, followergraph, creator payment, marketplace és komplex ajánló nem MVP.

Discovery/olvasás/Save/Share/Publish ingyenes termékfunkció; privát működés és adatletöltés/törlés szintén ingyenes alap. Új saját AI-generálás/fork/személyre szabás limitálható, mért költség alapján. Olvasás nem generál új AI-tartalmat. A növekedési hurok hipotézis: olvasás → érdeklődés → fork → saját következmény → önkéntes megosztás.

## Privát Shared Context és public réteg határa

Az új Shared szál nem public posztfolyam: 2–10 friend, 2 romantic, max 10 work/hobby, max 20 sport; membership/consent/own branch. S3 friend után S4–S6 típusbővítés, S7 public multiparty snapshot később. A P09/P11 személyes publikáció más tag nevét/profilját általánosítja, nem exportál live tagságot. Save/Share/public fork megmarad; DM/chat/realtime/public csoport nem első kiadás.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
