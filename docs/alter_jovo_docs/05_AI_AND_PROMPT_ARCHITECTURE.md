# alterward — AI és promptarchitektúra


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valós Auth/ops nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Valódi OpenAI a termék része. [Implementáció](../IMPLEMENTATION.md) · [Modellvizsgálat](../AI_MODEL_ROUTING_HU.md) · [Keret](../STATUS_HU.md).

## Meglévő három szerep

| Feladat | Konfiguráció | Jelenlegi használat |
|---|---|---|
| Események és döntési opciók | `AI_EVENT_MODEL` | Strukturált v1 és v2 időszakgenerálás |
| Történetfejezetek | `AI_STORY_MODEL` | Canonból olvasható angol próza; magyar kutatási kompatibilitás |
| Fidelity/safety | `AI_CHECK_MODEL` | Canon és történet összevetése |

Mindhárom kezdőmodell `gpt-6.1-sol`. Checker hiányzó beállításnál az eseménymodellt örökli; modellcserénél külön kell beállítani. Luna eseménygenerátor mérendő jelölt, nem automatikus alkalmazásbeállítás. A [v2 négy EN/HU lánc](../AI_V2_ROUTING_REPORT_HU.md) technikai mérése kész, angol AI/szerkesztői minősítés és további profilok szükségesek. [Claude külső audit és tokenmérés](../CLAUDE_MODEL_EVALUATION_HU.md) külön kutatási integráció, nem automatikus worker-routing.

OpenAI Responses, Structured Outputs/JSON Schema, `store:false`, szerveroldali kulcs. Az API/worker és domain-könyvtár elválasztása megmarad; böngészőből nincs közvetlen AI-hívás. AI nélküli személyes tartalompótlás nincs. Teszthelyettesítő csak automatizált, elkülönített tesztben.

## Nyelv és prompt

Aktív promptok: `simulation_events.v2.en|hu`, `story_chapters.v2.en|hu`, `story_fidelity.v2.en|hu`. V2 aktív szerepek: life_period / life_chapter / life_fidelity, külön nyelvi utasítással; privát periodmotor integrált. Mentett életnyelv a jobban és auditban is szerepel; régi nyelv nélküli job magyarul folytatódik. Új élet alapnyelve angol. Kimeneti JSON-kulcs/enum/UUID nem fordul, minden olvasói szöveg a rögzített nyelven készül.

A nyelv zárt regiszterből, magas prioritású rendszerutasításból jön. A felhasználói profil/cél és narratív előzmény külön nem megbízható adatblokk, nem új rendszerutasítás. A canon magasabb rendű a prózánál. Raw prompt és személyes bemenet nem kerül működési naplóba.

## Validálás, retry és checkpoint

AI-kimenet → séma → idő/szereplő/állapot/korlát → narratív referencia → AI-fidelity → commit. Egy `valid=true` nem szemantikai garancia; AI szerkesztői ellenőrzés, majd éles használói visszajelzés kell. A már elfogadott eseményeket narratívahiba miatt nem generáljuk újra; a jobcheckpoint tartós.

Számlázási/kvótahiány nem kap automatikus retryt vagy drágább modellre kerülőutat. Átmeneti hálózati/rate-limit/5xx hiba legfeljebb két provider retryt kap; hosszú Retry-After esetén korai új kérés nem indul. A domain/narratív célzott javítás kész P05 folyamat: közös, legfeljebb egyszeri automatikus javítás, külön költségfoglalással. A Claude értékelő nem használ automatikus retryt. Ez nem már kész automatikus fallback.

## Következő AI-szerepek — tervek

Rövid v2 period és opció; canonhivatkozásos emlékezeti összefoglaló; opcionális profil/szabad döntés strukturálása jóváhagyással; NPC/jelenet folytonosság; public redaction és tartalomvizsgálat; kategória/címkejavaslat. Determinisztikus munka nem kap szükségtelen AI-hívást. PII-segédmodell csak saját hibateszt és emberi preview mellett használható; nem anonimitási garancia.

## Költség és modellkapu

Minden task auditja: modell/prompt/locale, request/input/output hash, tokenszám, idő, validálás. A helyi próba modellspecifikus dátumozott árakkal és közös naplóval foglal; az alkalmazás pénzbeli és párhuzamos projekt/user kerete P05-ben elkészült. Költség/elfogadott időszak magában foglalja a hibás válasz/javítás/fallback árát is.

Rövid releváns kontextus és tömör canon, szerepenkénti outputlimit, stabil prefix cache-mérése, offline seed/eval ütemezés vizsgálható. Cache nem életmemória; rövidebb próza nem automatikusan azonos minőség. Nyelvváltás/olvasás/Save/Share nulla új AI-hívás. OpenAI összkeret 5 USD; új felhasználói döntés szerint Claude értékelésre külön 5 USD. Külön napló és lock, egyik sem nullázható; éles Claude-DB-számla még nincs.
