# alterward — nyilvános életek, Discovery és közösség


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Az összes itt leírt public funkció **tervezett**, még nincs bekötve. [Részletes terv](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [Forrás](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md).

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

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux/Docker-runtime és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
