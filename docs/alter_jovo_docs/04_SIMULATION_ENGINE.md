# alterward — szimulációs motor


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · [V2 szerződés és validátor](../V2_SIMULATION_CONTRACT_HU.md) · [P01–P05](../NEXT_STEPS.md).

## Határ és pipeline

Verziózott identitás/cél + környezet + aktuális tényállapot + korlát + releváns canon → AI-eseményjavaslat → séma → domain-előfeltételek/idő/szereplők → determinisztikus átmenet → elfogadott esemény/állapot → külön narrátor → fidelity → tranzakciós commit. A próza nem truth source és nem módosíthat tényt.

A működő v1 tízéves horizonte 5–10 eseményt és 2–3 fejezetet ad; az opció gyermekágon érvényesül. A v2 könyvtár hat/tizenkét hónapos, döntésnél megálló periodot validál. Új tárolás, valódi AI és folytatási API integrált.

## Tényállapot

Idő/revision/branch, foglalkoztatás és munka, ország/lakhatás, pénznem/pénzügy, tulajdon, tartós szereplők, készségek, célállapot, lehetőségek és idő/energia. Unknown `null`, nem feltételezett nulla. A termék World State a környezet és életállapot együtt; a mai `ff_world_versions` csak semleges környezeti kontextus.

Zárt típusos változások, tetszőleges JSON-path írás nélkül. Munkaviszony lezárása a munkatényt módosítja; eladott asset nem marad tulajdon; új szereplő előbb explicit `actor_add`, csak utána hivatkozható. Minden változás esemény/döntés alapján, forrásmódosítás nélkül és atomikusan történik. Az AI nem dönthet pénz/idő/tulajdon előfeltétel helyett.

## Korlát és időszak

Hard/soft korlát élethez, opcionális ághoz és kezdő/kizáró végnaphoz kötött; elfogadott döntés oldhatja fel. Első gépi predikátumok: employment, country, asset ownership, minimum likvid pénz adott pénznemben. Unknown/más pénznem nem bizonyítja a minimumot. Kemény sértés hiba, puha eltérés hivatkozott figyelmeztetés. Deviza/adósság/összetett kapcsolatmodell későbbi bővítés.

Induló v2 alapérték hat hónap, 2–5 esemény; egy nyitott döntés az utolsó eseményen, az időszak végén. A validátor az opciót nem alkalmazza: a végállapot választás előtti. Választás utáni canon nem rögzíthető előre. Ág/revision/kezdőállapot egyezés és rendezett dátum kötelező. Elavult revision 409. Minden opció végrehajthatósága ellenőrzött; a kiválasztott opció atomikusan mentődik.

## Folytatás és történeti fork — terv

Aktuális döntés egyszer mentve → azonnali átmenet → ugyanazon ág head/revision → következő period. Áganként egy generálás; idempotencia + tranzakció + lease. Történeti fork döntés előtti checkpointból másik választással új ágat indít; a közös előzmény és a szülő utóélete változatlan. V1 előre megírt tízéves baseline-ra nem fűzünk utólag v2 folytatást; explicit új élet/ellenőrzött másolat szükséges.

## Eseményminőség és audit

Karrier, kapcsolat, tanulás, pénzügyi kompromisszum, hétköznapi rutin, lehetőség és környezeti változás adjon változatos, indokolható eseményt. Relevancia, ismétlés és túlzott dráma külön minőségi mérés; scoring nem valódi eseményvalószínűség. Trauma/diagnózis nem véletlen engagement-eszköz.

Profil/kontraktus/állapotverzió, seed, modell, prompt, locale, input/output hash és használat auditálható. Az új LLM-válasz nem garantáltan determinisztikus; az elfogadott canon és átmenet visszajátszható. Nyilvános forkhoz külön sanitized checkpoint kell, nem privát állapot-DTO.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
