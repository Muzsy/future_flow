# alterward — AI és promptarchitektúra

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · Valódi OpenAI a termék része. [Implementáció](../IMPLEMENTATION.md) · [Modellvizsgálat](../AI_MODEL_ROUTING_HU.md) · [Keret](../STATUS_HU.md).

## Meglévő három szerep

| Feladat | Konfiguráció | Jelenlegi használat |
|---|---|---|
| Események és döntési opciók | `AI_EVENT_MODEL` | Strukturált v1 és v2 időszakgenerálás |
| Történetfejezetek | `AI_STORY_MODEL` | Canonból olvasható angol próza; magyar kutatási kompatibilitás |
| Fidelity/safety | `AI_CHECK_MODEL` | Canon és történet összevetése |

Mindhárom kezdőmodell `gpt-6.1-sol`. Checker hiányzó beállításnál az eseménymodellt örökli; modellcserénél külön kell beállítani. Luna eseménygenerátor mérendő jelölt, nem automatikus alkalmazásbeállítás. A [v2 négy EN/HU lánc](../AI_V2_ROUTING_REPORT_HU.md) technikai mérése kész, angol AI/szerkesztői minősítés és további profilok szükségesek. [Claude külső audit és tokenmérés](../CLAUDE_MODEL_EVALUATION_HU.md) külön kutatási integráció, nem automatikus worker-routing.

OpenAI Responses, Structured Outputs/JSON Schema, `store:false`, szerveroldali kulcs. Az API/worker és domain-könyvtár elválasztása megmarad; böngészőből nincs közvetlen AI-hívás. AI nélküli személyes tartalompótlás nincs. Teszthelyettesítő csak automatizált, elkülönített tesztben.

## Nyelv és prompt

Aktív promptok: `simulation_events.v2.en|hu`, `story_chapters.v2.en|hu`, `story_fidelity.v2.en|hu`. V2 promptverziók: `life_period.v2.en|hu`, `life_chapter.v3.en|hu`, `life_fidelity.v2.en|hu`, külön nyelvi utasítással; privát periodmotor integrált. Mentett életnyelv a jobban és auditban is szerepel; régi nyelv nélküli job magyarul folytatódik. Új élet alapnyelve angol. Kimeneti JSON-kulcs/enum/UUID nem fordul, minden olvasói szöveg a rögzített nyelven készül.

A nyelv zárt regiszterből, magas prioritású rendszerutasításból jön. A felhasználói profil/cél és narratív előzmény külön nem megbízható adatblokk, nem új rendszerutasítás. A canon magasabb rendű a prózánál. Raw prompt és személyes bemenet nem kerül működési naplóba.

## Validálás, retry és checkpoint

AI-kimenet → séma → idő/szereplő/állapot/korlát → narratív referencia → AI-fidelity → commit. Egy `valid=true` nem szemantikai garancia; AI szerkesztői ellenőrzés, majd éles használói visszajelzés kell. A már elfogadott eseményeket narratívahiba miatt nem generáljuk újra; a jobcheckpoint tartós.

Számlázási/kvótahiány nem kap automatikus retryt vagy drágább modellre kerülőutat. Átmeneti hálózati/rate-limit/5xx hiba legfeljebb két provider retryt kap; hosszú Retry-After esetén korai új kérés nem indul. A domain/narratív célzott javítás kész P05 folyamat: közös, legfeljebb egyszeri automatikus javítás, külön költségfoglalással. A Claude értékelő nem használ automatikus retryt. Ez nem már kész automatikus fallback.

## Következő AI-szerepek — tervek

AI-val készített, canonhivatkozásos emlékezeti összefoglaló (a jelenlegi memória determinisztikus kivonat); opcionális profil/szabad döntés strukturálása jóváhagyással; NPC/jelenet folytonosság; public redaction és tartalomvizsgálat; kategória/címkejavaslat. Determinisztikus munka nem kap szükségtelen AI-hívást. PII-segédmodell csak saját hibateszt és emberi preview mellett használható; nem anonimitási garancia.

## Költség és modellkapu

Minden task auditja: modell/prompt/locale, request/input/output hash, tokenszám, idő, validálás. A helyi próba modellspecifikus dátumozott árakkal és közös naplóval foglal; az alkalmazás pénzbeli és párhuzamos projekt/user kerete P05-ben elkészült. Költség/elfogadott időszak magában foglalja a hibás válasz/javítás/fallback árát is.

Rövid releváns kontextus és tömör canon, szerepenkénti outputlimit, stabil prefix cache-mérése, offline seed/eval ütemezés vizsgálható. Cache nem életmemória; rövidebb próza nem automatikusan azonos minőség. Nyelvváltás/olvasás/Save/Share nulla új AI-hívás. OpenAI összkeret 5 USD; új felhasználói döntés szerint Claude értékelésre külön 5 USD. Külön napló és lock, egyik sem nullázható; éles Claude-DB-számla még nincs.

## Tervezett SharedAiProvider és költség

Új sharedEvent provider csak typed shared state, biztonságos InteractionProfile, megengedett tag/policy/id és közös history alapján dolgozik. Nincs raw személyes WorldState/memória. AI nem intent/consent forrás; max 1 repair, validator és budget. Egy közös generálás több tag strukturált impactját adja, nem N személyes fejezetet. Kezdeményező fizeti, olvasás/intent nem generál. Alap Sol és külön Claude auditor; új modellajánlás/mérés még nincs.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S2 implementációs kiegészítés

Shared AI: strict safe input, max nyolc közös history, külön zárt friend output, Sol/max4500/store:false, server IDs/policy/deadline, egy repair és tartós interrupted marker. Két valódi izolált minta; nem teljes personal/PII/release bizonyíték. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

S3 period/chapter/fidelity ugyanazt a legfeljebb nyolc saját Shared-emléket kapja. effectiveAt történeti idő, knownAt saját megismerés; minden új esemény a period kezdeténél későbbi. life_period.v4/life_chapter.v4/life_fidelity.v3. Valódi Sol-siker és külön Sonnet-audit, egy sikertelen dátumpróba is elszámolva; összes új guard 0.1451425 USD. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).
