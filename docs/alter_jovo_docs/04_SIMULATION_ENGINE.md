# alterward — szimulációs motor

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [V2 szerződés és validátor](../V2_SIMULATION_CONTRACT_HU.md) · [P01–P05](../NEXT_STEPS.md).

## Határ és pipeline

Verziózott identitás/cél + környezet + aktuális tényállapot + korlát + releváns canon → AI-eseményjavaslat → séma → domain-előfeltételek/idő/szereplők → determinisztikus átmenet → elfogadott esemény/állapot → külön narrátor → fidelity → tranzakciós commit. A próza nem truth source és nem módosíthat tényt.

A működő v1 tízéves horizonte 5–10 eseményt és 2–3 fejezetet ad; az opció gyermekágon érvényesül. A v2 könyvtár hat/tizenkét hónapos, döntésnél megálló periodot validál. Új tárolás, valódi AI és folytatási API integrált.

## Tényállapot

Idő/revision/branch, foglalkoztatás és munka, ország/lakhatás, pénznem/pénzügy, tulajdon, tartós szereplők, készségek, célállapot, lehetőségek és idő/energia. Unknown `null`, nem feltételezett nulla. A termék World State a környezet és életállapot együtt; a mai `ff_world_versions` csak semleges környezeti kontextus.

Zárt típusos változások, tetszőleges JSON-path írás nélkül. Munkaviszony lezárása a munkatényt módosítja; eladott asset nem marad tulajdon; új szereplő előbb explicit `actor_add`, csak utána hivatkozható. Minden változás esemény/döntés alapján, forrásmódosítás nélkül és atomikusan történik. Az AI nem dönthet pénz/idő/tulajdon előfeltétel helyett.

## Korlát és időszak

Hard/soft korlát élethez, opcionális ághoz és kezdő/kizáró végnaphoz kötött; elfogadott döntés oldhatja fel. Első gépi predikátumok: employment, country, asset ownership, minimum likvid pénz adott pénznemben. Unknown/más pénznem nem bizonyítja a minimumot. Kemény sértés hiba, puha eltérés hivatkozott figyelmeztetés. Deviza/adósság/összetett kapcsolatmodell későbbi bővítés.

Induló v2 alapérték hat hónap, 2–5 esemény; egy nyitott döntés az utolsó eseményen, az időszak végén. A validátor az opciót nem alkalmazza: a végállapot választás előtti. Választás utáni canon nem rögzíthető előre. Ág/revision/kezdőállapot egyezés és rendezett dátum kötelező. Elavult revision 409. Minden opció végrehajthatósága ellenőrzött; a kiválasztott opció atomikusan mentődik.

## Folytatás és saját történeti fork — megvalósítva

Aktuális döntés egyszer mentve → azonnali átmenet → ugyanazon ág head/revision → következő period. Áganként egy generálás; idempotencia + tranzakció + lease. Történeti fork döntés előtti checkpointból másik választással új ágat indít; a közös előzmény és a szülő utóélete változatlan. V1 előre megírt tízéves baseline-ra nem fűzünk utólag v2 folytatást; explicit új élet/ellenőrzött másolat szükséges.

## Eseményminőség és audit

Karrier, kapcsolat, tanulás, pénzügyi kompromisszum, hétköznapi rutin, lehetőség és környezeti változás adjon változatos, indokolható eseményt. Relevancia, ismétlés és túlzott dráma külön minőségi mérés; scoring nem valódi eseményvalószínűség. Trauma/diagnózis nem véletlen engagement-eszköz.

Profil/kontraktus/állapotverzió, seed, modell, prompt, locale, input/output hash és használat auditálható. Az új LLM-válasz nem garantáltan determinisztikus; az elfogadott canon és átmenet visszajátszható. Nyilvános forkhoz külön sanitized checkpoint kell, nem privát állapot-DTO.

## Külön shared engine és személyes materializálás

Shared candidate → domainvalidálás → immutable event → valódi tag-intent → deterministic policy → resolution → pending tagimpact. Context saját idő/revision, max egy döntés/job. Compatible-month kötés, monoton idő, nincs visszadátumozott személyes múlt. Lazy exactly-once impact a saját mutationben; kliensrevision ellenőrzése előtte. Személyes fork nem örököl live membershipet, csak forkpontig engedett memóriát.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S1 implementációs kiegészítés

S1 pure candidate-validálás, closed state changes és opt-in/missing-response/deadline resolver implementált. Majority/unanimous előkészített, role/weighted nem végrehajtható; friend option changes nem merge-elhető. S1 pending memory, lazy personal adapter S3.


## S3 személyes integráció — 2026-10-05

A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).
