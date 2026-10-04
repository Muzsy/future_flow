# alterward — profil, identitás, kérdőív és cél


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · [P01/P04](../NEXT_STEPS.md) és [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md).

## Meglévő v1

29 kérdés, kizárólag angol induló megjelenítéssel; magyar katalógus elrejtve. A v1 magyar kanonikus kérdéskulcsok/opcióértékek, scoring- és kérdőívverzió/hash változatlanok; az angol fordítás külön megjelenítési réteg. A draft válaszokat és kapcsolati címkéket ment revisionnel; commit immutable pillanatképet ad. A célok és kapcsolatok a pillanatkép másolatai. Trait értékek önbevallott 0–100 adatok, nem validált pszichometriai eredmények. A v1 semleges 50-es induló értékei szerkesztési feltevések.

## Rövid v2 indulás — megvalósított mag

10–15 fontos kérdés együtt a profilt és célt fedi. Induló 12 lépés: identitás/korcsoport; hely/költözés; lakhatás; munka; pénzügyi mozgástér; képzettség/készségek; kapcsolatok; idő/energia; kockázat; fő cél/időtáv; motiváció/vállalások; kizárt áldozatok/korlátok. Opcionális szabad kontextus, később releváns helyzetben fokozatos mélyítés. A 3–4 perces cél mérendő.

Saját profil és szimulált identitás külön. Alternatív helyzet nem írja át a valódi profilt; a lifeInput pillanatkép rögzíti az identitást, környezetet, célokat és korlátokat. Saját korcsoportból nem találunk ki születési napot. Pontos fiktív életkor 18+ lehet. Nulla közeli kapcsolat és ismeretlen opcionális adat megengedett. Az induló földrajzi sablon magyar, az induló nyelv kizárólag `en`, régi tárolt `hu` megmarad.

## Célmodell

| Stratégiai fogalom | V2 megfeleltetés |
|---|---|
| category / description | Célkategória és leírás |
| priority | Elsődleges vagy másodlagos; egy fő cél |
| horizon | Hónapban megadott időtáv |
| motivation | Opcionális motiváció |
| acceptable / unacceptable tradeoffs | Opcionális vállalható/kizárt áldozatok |
| current progress | Goal-ID-val kötött active/achieved/abandoned állapot, megjegyzéssel |
| constraints | Külön élet/ág/idő hatókörű listában |

A stratégiai snake_case megnevezések fogalmi mezők, nem közvetlen mai API-DTO-k. A pontos kódnevek/séma a [lifeInput](../contracts/v2/lifeInput.schema.json) és [lifeState](../contracts/v2/lifeState.schema.json) exportjában vannak. Nincs kitalált siker- vagy előrehaladási százalék.

## Tény, preferencia és szabad szöveg

Tény: ismert munka, lakhatás, szereplő, készség, tulajdon. Preferencia: változtatási hajlandóság, vállalások. Hard constraint: ellenőrizhető tiltás/feltétel, érvényességi határral. Soft: generálást irányító kívánság. Ismeretlen adat `null`; nulla ismert érték, nem hiányjel.

Szabad szöveg külön, nem megbízható utasításként jut az AI-hoz. Későbbi strukturáló AI csak javaslatot adhat: forráshivatkozás/előnézet → elfogadás vagy javítás → új strukturált verzió. Ellentmondás nem eredményez néma felülírást. AI-becslés confidence-ja nem klinikai vagy statisztikai pontosság.

## Adatminimalizálás és nyelvek

Álnevek alapértelmezettek, harmadik személy valós neve/pontos címe nem kell. Vallás, politika, diagnózis, biometria és pontos pénzügyi azonosító nem onboarding-követelmény. Új nyelv nem változtat kérdéskulcsot/scoringot; teljes fordítás és nyelvi AI-próba szükséges. Publishing külön sanitized profilprojekciót kap, a saját teljes profil nem adható ki. A 12 lépéses onboarding integrált; valódi fiókos használati próba nyitott.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
