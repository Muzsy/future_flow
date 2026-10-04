# alterward — profil, identitás, kérdőív és cél

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0/S1 implementált: foundation és friend canon/own intent/resolution/pending memória, kikapcsolva; S2–S7 tervezett. 001–009 alkalmazva, következő S2 valódi Shared OpenAI. [S1 megvalósítás és korlátok](../SHARED_CONTEXT_S1_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · [P01/P04](../NEXT_STEPS.md) és [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md).

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

Álnevek alapértelmezettek, harmadik személy valós neve/pontos címe nem kell. Vallás, politika, diagnózis, biometria és pontos pénzügyi azonosító nem onboarding-követelmény. Új nyelv nem változtat kérdéskulcsot/scoringot; teljes fordítás és nyelvi AI-próba szükséges. Publishing külön sanitized profilprojekciót kap, a saját teljes profil nem adható ki. A 12 lépéses angol onboarding, draft-visszaállítás és első élet valódi szintetikus Supabase-fiókkal böngészőben ellenőrzött. A kitöltési idő és érthetőség valódi használói mérése még nyitott.

## SocialProfile és InteractionProfile — tervezett külön modell

A kapcsolatfelvételi handle/display name/discoverability nem a teljes személyes profil. Contextenként InteractionProfile allowlist: displayName, nullable ageBand/country/occupationLabel/sharedRole. Nincs email, személyes cél/pénzügy, más context vagy teljes kapcsolatgráf. A megosztás a meghívás elfogadásakor látható; másik tag személyes onboardingja soha nem lesz közös AI-input.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).
