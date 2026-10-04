# alterward — szimulációs motor

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0 implementáció elkészült és izoláltan ellenőrzött; fejlesztői DB-alkalmazás függő, feature kikapcsolva. S1–S7 tervezett. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · [V2 szerződés és validátor](../V2_SIMULATION_CONTRACT_HU.md) · [P01–P05](../NEXT_STEPS.md).

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
