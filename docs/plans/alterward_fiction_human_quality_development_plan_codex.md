---
title: Alterward — emberibb, hosszú távon változatos creative fiction
status: active-supporting
plan_status: development-plan
implementation_status: offline-implementation-candidate
owner: product/engineering
prepared: 2026-10-16
last_revised: 2026-10-17
last_reviewed: 2026-10-17
repository: Muzsy/future_flow
base_branch: main
base_commit: 2da2e8c569e926ffe4b831aaf7af67caa75c9d13
issue: 45
pull_request: https://github.com/Muzsy/future_flow/pull/48
workstream: F05/F06 follow-up
production_authorized: false
paid_provider_calls_authorized: false
---

# Alterward — emberibb, hosszú távon változatos creative fiction

## 0. A dokumentum célja

Ez a dokumentum a két független minőségi audit közös eredményeit fordítja le konkrét, Codex által végrehajtható fejlesztési tervvé.

A terv **a jelenlegi GitHub `main` valós kódjára épül**, nem a korábbi PR #46 állapotára.

Kiinduló forrás:

- repository: `Muzsy/future_flow`
- branch: `main`
- auditkori HEAD: `2da2e8c569e926ffe4b831aaf7af67caa75c9d13`
- ez a PR #47 merge utáni állapot;
- PR #47 már bevezette a sequence-aware planner/author/reviewer v3 + editor v2 / `qualityPolicyVersion=2.1.0` működést;
- a következő csomag **nem ismételheti meg** a PR #47-et;
- a régi policyk, jobok, artifactok és mért promptverziók kompatibilitását meg kell őrizni.

Ez fejlesztési terv. Nem production rollout, nem költési engedély és nem release PASS.

---

# 1. Auditok összegzése

## 1.1. Ami már erős

Mindkét audit ugyanazokat az alapvető erősségeket találta.

### Jelenetírás és fizikai világ

A jelenlegi creative pipeline képes:

- konkrét, vizuális jeleneteket írni;
- tárgyakon és cselekvésen keresztül mesélni;
- a `show, don't tell` elvet nagyrészt jól használni;
- hétköznapi, hiteles fizikai részleteket beépíteni;
- nem minden érzelmet explicit megmagyarázni.

Különösen erős példák voltak:

- a papír mögé tett kivágott ablak és a bögre füle;
- a ferde szegélyléc miatt optikailag ferdének tűnő kép;
- Maeve, aki a gondosan elkészített új tracker hátulját jegyzetpapírként használja;
- a webkamera elé túl közel tartott nyomtatott oldal;
- Cian térddel/könyökkel megtámasztott dobozai;
- a felhő miatt eltűnő papírszoba és a változatlan grafitlenyomat.

Következtetés: **nem a mondatszintű próza a fő probléma**.

### Folytonosság és memória

A jelenlegi StoryFact + owned-prefix memória kifejezetten jól működik.

Az auditok erősnek ítélték, hogy:

- korábbi mellékes esemény később természetes következménnyé válik;
- a kihúzott `cupboard stock` pontból később Cian saját története nő ki;
- az alkotói szálban a Yellow Bag, a bizonytalan befejezés és a későbbi Nessa-konfliktus egymásból következik;
- a fork valóban a saját prefixéből folytatódik.

Következtetés: **a memóriaarchitektúrát nem szabad újratervezni vagy fellazítani**.

### Branching

A két alternatív harmadik munkahelyi fejezet valóban más történetté vált:

- `The Packing Bench`: fizikai/logisztikai/szociális világ;
- `The Host's Chair`: pedagógiai, értelmezési és pszichológiai ág.

Ez már nem kozmetikai branch.

Következtetés: **a választás→következmény modell jó irányban van, ezt regresszióként védeni kell**.

### NPC-autonómia

A mellékszereplők már nem pusztán segítők:

- Maeve praktikus és kritikusan viszonyul a főhős ötletéhez;
- Orla kijavítja a főhős saját, túl szép önnarratíváját;
- Cian saját fizikai problémáját akarja megoldani;
- Nessa saját művészi álláspontját védi;
- a print-room volunteer segít, majd egyszerűen máshoz fordul.

Következtetés: **az NPC-réteg lényegesen jobb a PR #46 előtti állapotnál**.

---

## 1.2. A fennmaradó közös problémák

A két audit súlyozása eltért, de a fő hibákban erős konvergencia van.

### A. A háttérrendszer láthatóvá válik a prózában

Legerősebb konkrét jelek:

- több külön életút/fejezet ugyanazon `15 July` period boundary köré szerveződik;
- ismételten megjelenik:
  - `paid weekday hours`;
  - `existing allocation`;
  - `routing allocation`;
  - `overflow goes back to the manager`;
  - `if you decline...`;
  - `no exclusivity / no appearances / no extra pictures`;
- az option safety és entitlement-szerű információ gyakran szerződésszerű prózává válik.

Ez különösen fontos, mert a jelenlegi v3 prompt **már próbálja tiltani** a guardrail-recitálást, mégis átjutott az editor v2 sequence gate-en.

Következtetés: a jelenlegi promptutasítás és a `system mechanics` implicit ellenőrzése **nem elég erős vagy nem elég explicit**.

### B. A makro-fejezetsablon továbbra felismerhető

A második audit a hét részt absztrahálva nagyjából ezt a mintát látta:

1. a főhős azt hiszi, valami működik;
2. egy NPC megmutat egy vakfoltot;
3. a főhős röviden ellenáll;
4. gyorsan belátja a hibát;
5. következik egy gyakorlati iteráció;
6. formális új lehetőség/döntési pont érkezik;
7. a fejezet egy visszafogott tárgyi tableau-val zár.

A PR #47 már figyeli:

- `distinctDramaticStructure`;
- `distinctEnding`;
- `independentProgression`;
- `characterAgency`.

A hét új elfogadott fejezet azonban azt mutatja, hogy ez a négy flag **még túl durva felbontású**: a modell különbözőnek látja a konkrét jeleneteket, miközben emberi olvasó a közös absztrakt algoritmust felismeri.

### C. Túl gyors protagonist self-correction

A főhős már hibázik, ami előrelépés, de gyakran:

- majdnem magyarázkodik → megáll;
- majdnem visszaszól → megáll;
- felismeri a másik szempontját;
- nagyon gyorsan levonja a helyes, árnyalt tanulságot.

Visszatérő mikro-minta:

`almost explain / almost defend / start to clarify → stop → better insight`

Ez több fejezet után felismerhetővé válik.

### D. Az NPC-k túl kulturáltak és túl pontosak

A szereplőknek már van saját céljuk, de szinte mindenki:

- nyugodt;
- lényegretörő;
- konstruktív;
- jól artikulált;
- ritkán téved;
- ritkán marad félreértésben;
- ritkán viselkedik fáradtan, esetlenül vagy önérdekből rosszul.

A cél **nem** a mesterséges konfliktus vagy toxikus viselkedés bevezetése.

A cél: több emberi zaj és kevésbé tanítómester-szerű NPC-viselkedés.

### E. Túl egyenletesen „irodalmi” retorika

Az auditok visszatérő mintának látták:

- szimmetrikus antitéziseket;
- kiegyensúlyozott, idézhető felismeréseket;
- `You understood X / she understood Y` típusú párokat;
- `I miss X / I do not miss Y` szerkezeteket;
- ismételt lírai tárgyi fejezetzárást.

Egyenként ezek jó mondatok.

Sorozatban azonban modellszerű szerzői kézjeggyé válnak.

### F. Szemantikailag „túl találó” névadás

`Nessa Quill` különösen árulkodó példa: egy írót `Quill` vezetéknévvel ellátni LLM-szerű nominative determinism.

Ez nem kritikus hiba, de olcsón javítható.

### G. Hosszú távú olvasási kockázat

A legerősebb közös következtetés:

> Egyetlen jó fejezetnél már nehéz felismerni az AI-t. Több egymást követő fejezetnél a rendszer ritmusa újra láthatóvá válik.

Tehát a következő feladat **nem „írjunk jobb mondatokat”**.

A feladat:

> **sok jó fejezet se árulja el ugyanazt a generátort.**

---

# 2. Jelenlegi kódállapot

## 2.1. Policy és contract

Jelenlegi fő contract:

`packages/contracts/src/fiction.ts`

Aktuális új-job policy:

- mode: `narrative-fiction-v2`
- policy schema version: `2.0.0`
- selected generation:
  - planner: `life_fiction_plan.v3`
  - writer/author: `life_fiction_author.v3`
  - plan reviewer: `life_fiction_plan_review.v3`
  - fidelity: `life_fiction_fidelity.v1`
  - editor: `life_fiction_editor.v2`
- quality policy: `2.1.0`
- max physical requests: `9`
- max content repairs: `1`
- target: 650–950 words.

A jelenlegi sequence editor riport:

`fictionSequenceEditorialSchema`

négy explicit sequence flaget tartalmaz:

- `distinctDramaticStructure`
- `distinctEnding`
- `independentProgression`
- `characterAgency`

A jelenlegi gate minden editor score-ra legalább 4-et, `verdict=pass` értéket és mind a négy sequence flaget megköveteli.

## 2.2. Sequence context

Jelenlegi hely:

`packages/database/src/fiction-memory.ts`

`personalFictionContext()`:

- a teljes owned branch historyból dolgozik;
- az utolsó **három** időszakhoz képez `sequenceHistory` elemet;
- minden elem:
  - legfeljebb három scene action/obstacle/shift összefoglaló;
  - első 400 karakteres opening;
  - utolsó 500 karakteres ending;
- a teljes creative memory továbbra 12 KiB bound alatt marad;
- withheld history esetén creative history nem kerül a modellhez.

Ez jól védi a közeli ismétlődést, de nem tárol explicit hosszú távú:

- story-engine típust;
- resolution mechanismet;
- protagonist response mintát;
- retorikai eszközöket;
- system-leakage mintát.

## 2.3. Promptok

Jelenlegi hely:

`packages/ai/src/fiction-prompts.ts`

A PR #47 v3 sequence prompt már mondja többek között:

- ne legyen minden konfliktus mentor/manager által megoldva;
- más szereplőknek legyen saját akaratuk;
- ne ismétlődjön ugyanaz a dramatic resolution;
- ne legyen rutinszerű `pen / blank reply / two papers / balanced list` zárás;
- a practical limitek ne váljanak reassurance-listává.

A hét új elfogadott történetrész azt mutatja, hogy ezek az utasítások szükségesek, de **nem elegendők**.

## 2.4. Worker

Jelenlegi hely:

`apps/worker/src/fiction-processor.ts`

Pipeline:

1. planner;
2. author;
3. final plan review;
4. fidelity;
5. literary editor;
6. atomic commit.

Megmarad:

- 5 normál hívás;
- max 9 fizikai request;
- 1 globális content repair;
- structural hiba esetén package repair;
- prose-only hiba esetén bizonyos esetben prose repair;
- checkpoint / receipt / input-output hash binding;
- lease / privacy / monetary guard.

Ezt a struktúrát a következő csomagban **nem kell bővíteni új rutin AI-hívással**.

## 2.5. Emberi benchmark

Jelenlegi fő contract:

`scripts/lib/narrative-evaluation-contract.ts`

A meglévő `humanRatingSchema` és release gate elsősorban a korábbi:

- `legacy`
- `narrative-v1`

vak fejezetpárokra épül.

A creative `--creative-only` út diagnosztikai:

- indexalapú választást használhat;
- `reviewed=false`;
- `complete=false`;
- `qualityRelease=false`.

A most feltárt hibák nagy része csak **teljes 3–7 fejezetes sorozat olvasásakor** jelenik meg, ezért a jelenlegi chapter-pair human contract önmagában nem elegendő a creative-v2 hosszú távú minőség mérésére.

---

# 3. Fejlesztési cél

A következő candidate akkor tekinthető sikeresnek, ha:

1. megőrzi a mostani jelenet- és prózaminőséget;
2. a structured system constraint továbbra 100%-ban érvényesül;
3. a reader-facing prose nem recitálja szükségtelenül a háttérrendszert;
4. több fejezet után sem rajzolódik ki ugyanaz a chapter-template;
5. protagonist és NPC viselkedése kevésbé optimalizált/tanító jellegű;
6. a retorikai minták hosszabb történetben változatosabbak;
7. a branch továbbra valóban eltérő életutat nyit;
8. a StoryFact/prefix/withheld/privacy/recovery működés nem romlik;
9. nem nő a normál hívásszám, a max request vagy repair keret;
10. a minőséget új, teljes sorozatot látó emberi audit is mérni tudja.

---

# 4. Nem cél

Ebben a csomagban tilos:

- modellt váltani;
- új rutinszerű AI stage-et hozzáadni;
- 9 fölé emelni a physical request limitet;
- egynél több content repairt engedélyezni;
- monetary/budget/lease/rate-limit guardot lazítani;
- privacy/withheld/prefix-fork szabályt lazítani;
- production cohortot bekapcsolni;
- production SSH/deployment/migration műveletet futtatni;
- beta windowt vagy ledgert újraindítani;
- paid provider hívást indítani külön explicit emberi engedély nélkül;
- mesterséges konfliktust, agressziót vagy „drámai eseményt” kötelezővé tenni;
- minden fejezetet különböző archetipusba erőltetni egy új merev template-rendszerrel.

---

# 5. Javasolt új policy-verzió

## 5.1. Ne módosítsd a mért v3 policyt

A PR #47 v3 promptjaihoz valódi paid evidence tartozik.

Első lépésként:

- hozd létre a jelenlegi selected policy explicit frozen helperét:
  - `fictionV3Policy()`;
- a jelenlegi v3 planner/author/reviewer/editor promptokat hash-pinnel védd;
- csak ezután legyen az új default `fictionPolicy()` v4.

A régi:

- v1;
- v2;
- v3

payloadok byte/semantic kompatibilitása maradjon.

## 5.2. Új policy

Javasolt:

- planner: `life_fiction_plan.v4`
- author: `life_fiction_author.v4`
- planReviewer: `life_fiction_plan_review.v4`
- fidelity: maradhat `life_fiction_fidelity.v1`, ha contract nem változik;
- editor: `life_fiction_editor.v3`
- qualityPolicyVersion: `2.2.0`
- maxPhysicalRequests: `9`
- maxContentRepairs: `1`

Ne változzon:

- modell;
- provider;
- artifact fő adatmodell;
- SQL schema, ha elkerülhető;
- request accounting.

---

# 6. HQ1 — Prose/System Separation

## 6.1. Cél

A strukturált rendszer továbbra pontosan tartsa be:

- period dates;
- user hard constraints;
- accepted choices;
- time limits;
- employment/resource bounds;
- decision option semantics.

De a reader-facing chapter **ne mondja fel automatikusan ezeket a szabályokat**.

## 6.2. Author v4 prompt

A `packages/ai/src/fiction-prompts.ts` új v4 author utasítása mondja ki explicit módon:

### Dátum

A `startDate` és `endDate`:

- kötelező structured chronology;
- nem kötelező prózai mondat.

Ne írd ki az exact period-boundary napot csak azért, mert az event azon a napon van.

Exact dátum csak akkor jelenjen meg a prózában, ha:

- a user által rögzített konkrét határidő;
- egy találkozó/appointment;
- egy valódi történeti deadline;
- vagy maga a dátum okozza a konfliktust.

Egyébként:

- hónap;
- évszak;
- relatív idő;
- vagy implicit időugrás

előnyös.

### Constraint

A practical/hard constraint:

- a cselekvést korlátozza;
- ne legyen rendszeres reader reassurance.

Ne mondd el újra automatikusan:

- hogy hétvégét nem érint;
- hogy managerhez kerül overflow;
- hogy nemet lehet mondani;
- hogy nincs exclusivity;
- hogy nincs extra appearance;
- hogy ugyanannyi órából kell megoldani.

Ezt csak akkor mondd ki, ha egy szereplőnek **az adott jelenetben természetes oka van beszélni róla**, vagy a döntés értelmezéséhez nélkülözhetetlen.

### Option separation

A structured candidate decision options már külön hordozzák:

- label;
- description;
- changes;
- consequence semantics.

A prose feladata a döntés **megéreztetése**, nem a teljes option contract narratív újrafelsorolása.

## 6.3. Editor v3

Új kötelező sequence flag:

`systemMechanicsInvisible`

False, ha a chapter:

- period boundaryt narratív indok nélkül kiír;
- entitlement/accounting/workload reassurance-t recitál;
- structured option feltételeket szerződésszerűen újramond;
- engine/state/constraint viselkedést regényszövegnek álcáz.

Ez **nem** jelenti azt, hogy valódi munkaidőről vagy határidőről soha nem lehet beszélni.

Az editor evidence-ben meg kell nevezni, miért narratív vagy miért system leakage.

---

# 7. HQ2 — Hosszú távú sequence signature

## 7.1. Probléma

A jelenlegi `sequenceHistory` három korábbi időszakot tartalmaz részletes szövegrészletekkel.

Ez jól fogja a közvetlen ismétlést, de:

- drága byte-ban;
- csak három periódusra lát vissza;
- nincs explicit absztrakt szerkezeti fingerprint;
- az editor a különböző felszíni részleteket hajlamos eltérő szerkezetként értékelni.

## 7.2. Új contract

`packages/contracts/src/fiction.ts`

Adj új, kompakt, versioned sequence signature-t az új editor reporthoz.

Javasolt szerkezet:

```ts
fictionSequenceSignatureSchema = {
  periodId,

  dramaticEngine: enum(
    discovery,
    negotiation,
    failed_attempt,
    social_friction,
    material_experiment,
    external_opportunity,
    misunderstanding,
    deadline_pressure,
    role_reversal,
    relationship_shift,
    mixed,
    other
  ),

  turningPointDriver: enum(
    protagonist,
    npc,
    institution,
    environment,
    artifact,
    chance,
    shared,
    mixed
  ),

  resolutionMode: enum(
    partial_resolution,
    unresolved,
    reframe,
    commitment,
    withdrawal,
    experiment,
    external_response,
    consequence,
    mixed
  ),

  endingMode: enum(
    open_choice,
    tableau,
    dialogue,
    action_in_progress,
    discovery,
    consequence,
    quiet_observation,
    hard_stop,
    other
  ),

  protagonistResponse: enum(
    immediate_self_correction,
    defend_then_change,
    delayed_change,
    persist,
    misunderstand,
    avoid,
    act_without_resolution,
    no_correction_arc,
    mixed
  ),

  rhetoricalFlags: array(enum(
    balanced_antithesis,
    almost_then_stop,
    explicit_moral,
    object_tableau,
    binary_option_briefing,
    none
  )),

  systemLeakageFlags: array(enum(
    exact_boundary_date,
    contractual_guardrail,
    exit_clause_reassurance,
    allocation_accounting,
    none
  ))
}
```

A konkrét enumnevek implementációkor finomíthatók, de:

- legyenek kis, stabil, géppel validálható kategóriák;
- ne legyen szabad, többmondatos „irodalomelméleti” mező;
- ne legyen belőlük új story template;
- csak diagnosztikai/összehasonlítási metaadatok legyenek.

## 7.3. Report

Új:

`fictionSequenceEditorialSchema` report version `1.2.0`

A meglévő négy flag mellé:

- `distinctRhetoricalShape`
- `systemMechanicsInvisible`
- `behavioralVariety`

kötelező.

Tartalmazzon `sequenceSignature` mezőt az aktuális chapterhez.

## 7.4. Context projection

`packages/database/src/fiction-memory.ts`

A jelenlegi raw sequence history maradjon meg.

Emellett épüljön:

`sequenceSignatureHistory`

korábbi v4 artifactok editor reportjaiból.

Elvárt viselkedés:

- raw scene/opening/ending: a legutolsó `min(3, ownedHistoryLength)` period jelenlegi összehasonlítási bizonyítéka maradjon meg; ne csökkenjen kettőre;
- compact signature: próbáljon legfeljebb 8 korábbi, érvényes signature-rel rendelkező periodot megtartani;
- a raw és compact réteg átfedhet; a periodazonosság és sorrend legyen egyértelmű, rétegen belüli duplikáció nélkül;
- ugyanabban a 12 KiB teljes creative memory boundban;
- overflow esetén:
  1. a jelenlegi bounder szabályai szerint csökkentsd az opcionális általános history/excerpt és egyéb nem védett memóriát; ez nem a három védett raw sequence elem törlését jelenti;
  2. a megmaradó helyhez igazítva dobd el a legrégebbi compact signature-öket;
  3. a legutóbbi három raw period összehasonlítási bizonyítékát és a kötelező continuity-faktumokat ne szorítsa ki az új metaadat;
  4. ha a kötelező tartalom signature nélkül sem fér el, maradjon a jelenlegi explicit context-bound hiba; ne legyen csendes adatvesztés vagy keretemelés;
- signature nélküli v1/v2/v3 előzményhez maradjon a jelenlegi scene/event fallback és opening/ending; ne gyárts visszamenőleges signature-t új AI-hívással vagy régi artifact átírásával;
- withheld history esetén mindkét sequence réteg üres;
- régi v1/v2/v3 artifactot nem írunk át;
- régi artifactból hiányzó signature miatt nem bukhat a history parser;
- mixed old/new prefix támogatott.

## 7.5. Miért kell

Ez teszi lehetővé, hogy a rendszer észrevegye:

- minden negyedik fejezet ugyanazzal a mentor-korrekcióval működik;
- a protagonist folyamatosan `almost explain → stop` mintát ismétel;
- minden ending más tárgy, de ugyanaz a `quiet symbolic tableau`;
- a constraint reassurance más szavakkal, de ugyanúgy visszatér.

---

# 8. HQ3 — Emberi viselkedési változatosság

## 8.1. Author v4

Új explicit szabályok:

### A protagonist ne legyen optimalizált tanulógép

Megengedett:

- hogy először rosszul értse;
- hogy megvédje a saját ötletét;
- hogy később jusson el a felismeréshez;
- hogy a felismerés részleges maradjon;
- hogy egy probléma egy következő fejezetig nyitva maradjon;
- hogy egy próbálkozás egyszerűen ne működjön.

Nem kötelező:

- minden hibából ugyanazon jelenetben bölcs tanulságot levonni.

### NPC-k

A szereplők:

- lehetnek fáradtak;
- lehetnek pontatlanok;
- lehetnek bizonytalanok;
- lehetnek önérdekűek;
- félreérthetnek valamit;
- elhalaszthatnak egy konfliktust;
- beszélhetnek esetlenül.

De:

- ne legyen kötelező konfliktus;
- ne legyen mesterséges agresszió;
- ne kelljen minden chapterben valakinek „hibásnak” lennie.

### Ne minden NPC legyen tanár

Ha egy NPC ellenkezik, nem kötelező, hogy:

- neki legyen igaza;
- azonnal tágítsa a protagonist látókörét;
- az ő mondata legyen a fejezet „tézise”.

## 8.2. Editor v3

`behavioralVariety=false`, ha a sequence history alapján ismétlődik például:

- NPC egy tökéletes mondattal megmutatja a vakfoltot;
- protagonist röviden védekezik;
- azonnal belátja;
- a konfliktus hasznos tanulsággá oldódik.

Az editor ne azért adjon PASS-t, mert a konkrét objektum vagy szakmai téma más.

---

# 9. HQ4 — Retorikai változatosság

## 9.1. Author v4

Explicit tiltás ne legyen „jó mondatokra”.

A cél nem steril próza.

Viszont kérd:

- ne csomagoljon minden felismerést kétpólusú antitézisbe;
- ne használja rutinszerűen:
  - `You had understood X. She had understood Y.`
  - `You miss X. You do not miss Y.`
  - `You begin to explain. Then stop.`
  - `You almost say... instead...`
- ne legyen minden fejezet vége lírai tárgyi kimerevítés;
- néha egy egyszerű mondat jobb, mint egy idézhető zárómondat;
- incidental detailnek nem kell később payoff.

## 9.2. Editor v3

`distinctRhetoricalShape` ne csak az utolsó tárgyat hasonlítsa össze.

Vizsgálja:

- mondatritmust;
- antitéziseket;
- self-correction formulát;
- ending rhetorical device-ot;
- explicit moral insightot;
- recurring symbolic tableau-t.

---

# 10. HQ5 — Természetesebb névadás

A v4 author prompt:

- ne használjon a szerephez túl jól illő vezetéknevet;
- ne legyen writer=`Quill`, artist=`Brush`, banker=`Ledger` stb.;
- ne legyen minden fiktív név „puha, irodalmi hangzású”;
- locale-kompatibilis, hétköznapi név legyen az alapértelmezés.

Ez prompt-level hardening.

Ne vezess be globális tiltó névlistát a production core-ba.

A literary editor a túl direkt nominative determinismet `character` vagy `personalization` issue-ként jelezheti.

---

# 11. HQ6 — Repair semantics

A worker jelenlegi egy-repair határa maradjon.

`apps/worker/src/fiction-processor.ts`

Új report esetén:

## Prose-only repair engedhető, ha:

- `systemMechanicsInvisible=false`;
- `distinctRhetoricalShape=false`;
- `distinctEnding=false`;

ÉS:

- nincs canon-scoped issue;
- a final candidate/plan/storyFacts változatlan maradhat.

## Author-package repair szükséges, ha:

- `distinctDramaticStructure=false`;
- `independentProgression=false`;
- `characterAgency=false`;
- `behavioralVariety=false`;

vagy bármely issue `repairScope=canon`.

## Report consistency

A core validálja:

- structural/agency/behavioral false flag mellett legyen canon-scoped issue;
- system/rhetorical/ending-only hiba lehet prose-scoped;
- a modell ne tudjon false flaget adni repair evidence nélkül.

Ez megakadályozza, hogy a worker egy valódi story-engine hibát puszta átírással próbáljon javítani.

---

# 12. HQ7 — Creative sequence human audit

## 12.1. Probléma

A jelenlegi vak chapter-pair benchmark nem méri jól azt, amit az auditok megtaláltak.

A fő hibák csak sorozatban látszanak.

Ezért a régi N08 értékelést **nem lecserélni**, hanem kiegészíteni kell.

## 12.2. Új contract

`scripts/lib/narrative-evaluation-contract.ts`

Ne módosítsd visszamenőleg a régi `humanRatingSchema` jelentését.

Adj külön:

`creativeSequenceHumanRatingSchema`

Javasolt mezők:

```text
sequenceId
sequenceHash
reviewerId
reviewerKind: human | diagnostic-ai

scores 1..5:
- humanProse
- immersion
- continuationDesire
- npcAutonomy
- protagonistHumanity
- structuralVariety
- emotionalRange
- systemInvisibility
- continuity
- branchingValue (ha branch bundle)

aiSuspicion:
- unlikely
- possible
- likely

flags:
- boundary_date_leak
- guardrail_recital
- repeated_chapter_template
- repeated_self_correction
- repeated_tableau_ending
- over_articulated_npcs
- role_pun_name
- over_polished_antithesis
- other

evidence:
- sampleId
- paragraphIndex
- reason

overall:
- reject
- not_ready
- beta
- strong_beta
```

`diagnostic-ai` audit:

- menthető;
- összehasonlítható;
- release-human evidence-nek **nem számít**.

Csak `reviewerKind=human` számíthat későbbi release döntéshez.

## 12.3. Audit bundle

A human-review artifact ne csak külön fejezeteket adjon.

Generáljon:

1. teljes main sequence bundle-t;
2. 3+ egymást követő fejezettel;
3. külön branch bundle-t:
   - közös prefix;
   - branch A;
   - branch B;
4. modell/editor score és policy címke nélkül;
5. hash-bound snapshotként.

## 12.4. Assessment output

Új diagnosztikai summary:

- human prose mean;
- immersion mean;
- continuation mean;
- structural variety mean;
- system invisibility mean;
- AI suspicion distribution;
- repeated flag frequency;
- sequence-level branch preference;
- chapter-level és sequence-level eltérés.

Az elsődleges termékminőségi mérce az olvasói élmény: elmerülés (`immersion`), folytatási kedv (`continuationDesire`), a szereplők hitelessége és a történet érdemi előrehaladása. Ezek eredményét külön mutasd be; jó próza- vagy system-invisibility pont ne fedhessen el gyenge folytatási kedvet.

Az `aiSuspicion` másodlagos diagnosztikai jel. Alacsony AI-gyanú önmagában nem minőségi PASS, és magasabb AI-gyanú önmagában nem bizonyít gyenge történetet. Ne használj AI-detektort az olvasói élmény helyettesítésére. Az összértékelés indoklása a történetre és konkrét olvasási tapasztalatra épüljön.

Ez kezdetben **candidate quality evidence**.

A meglévő kanonikus release gate-et ne írd át automatikusan.

Ha az új mérésből termék/release threshold lesz, azt külön owner döntéssel kell kanonizálni.

---

# 13. HQ8 — Hosszabb diagnosztikai corpus

## 13.1. Offline

A jelenlegi CLI `periods` maximuma 3.

A `--creative-only` diagnosztikai módnál engedélyezz legfeljebb **6 periodot**.

Csak creative-only esetén.

A régi:

- offline legacy/narrative benchmark;
- fixed-canon;
- formal release corpus

maradjon 3-periodusos contracttal, amíg külön döntés nem változtatja.

## 13.2. Miért 6

A sequence signature és a hosszú távú retorikai ismétlődés nem értékelhető megbízhatóan három fejezetből.

Hat egymást követő fejezet már képes megmutatni:

- visszatérő story engine-et;
- minden 3–4. fejezetben újra megjelenő mintát;
- protagonist self-correction ismétlődést;
- constraint leakage visszatérését;
- NPC-funkciók homogenitását.

## 13.3. Paid futás

**Ez a terv nem enged paid futást.**

A jelenlegi development ledger:

- 229 call;
- 6.79395 USD accounted;
- 10 USD owner-approved cumulative cap;
- 3.20605 USD remaining.

A hét új elfogadott fejezet historikus átlaga kb. 0.2509 USD/fejezet.

Durva becslés:

- 6 accepted chapter ≈ 1.5 USD;
- 12 accepted chapter ≈ 3.0 USD;

De:

- repair;
- failed attempt;
- fork;
- reservation;
- unknown provider failure

miatt a 3.20605 USD maradék **nem biztonságos teljes kétprofilos 6-period paid corpusra**.

Codex:

- implementáljon;
- offline teszteljen;
- ne emelje a capet;
- ne indítson fizetett mérést.

A paid mérés külön emberi engedély.

---

# 14. Exact file-level implementation map

## Kötelezően érintett

### Contracts

`packages/contracts/src/fiction.ts`

- v3 policy freeze helper;
- v4 policy;
- quality 2.2.0;
- editor v3;
- report 1.2.0;
- sequence signature;
- új sequence flag-ek;
- optional compact signature history.

`packages/contracts/src/export-schemas.ts`

- új contractok exportja.

`docs/contracts/fiction/*`

- `pnpm schemas` generált output.

### AI prompts/provider

`packages/ai/src/fiction-prompts.ts`

- v3 promptok byte-frozen;
- v4 prose/system separation;
- human messiness;
- rhetorical diversity;
- natural names;
- új editor instructions.

`packages/ai/src/index.ts`

- új prompt/report schema mapping;
- ne adj új provider callt.

### Core

`packages/core/src/fiction.ts`

- policy/report compatibility;
- 1.2 report validation;
- exact sequence coverage;
- új flags gate;
- repair-scope consistency;
- mixed v1/v2/v3/v4 acceptance;
- artifact binding változatlan authority elvvel.

### Database/context

`packages/database/src/fiction-memory.ts`

- signature-history projection;
- long-horizon bound;
- old artifact fallback;
- withheld clearing;
- mixed-prefix support.

### Worker

`apps/worker/src/fiction-processor.ts`

- prose-only vs author-package repair szabály új flags szerint;
- request/repair count változatlan.

### Evaluation

`scripts/lib/narrative-evaluation-contract.ts`

- creative sequence human rating.

`scripts/lib/narrative-evaluation-options.ts`

- creative-only max6 period support;
- szükség esetén új sequence-ratings CLI option.

`scripts/lib/narrative-evaluation-runner.ts`

- 6-period creative-only futás;
- sequence bundle metadata;
- hash binding.

`scripts/lib/narrative-evaluation-artifacts.ts`

- teljes sequence + fork human-review bundle.

Szükség esetén új, kizárólag diagnosztikai helper:

`scripts/lib/fiction-prose-diagnostics.ts`

Ez mérhet:

- period-boundary date mention;
- ismert guardrail-lexikon;
- sequence signature eloszlás;
- repeated ending/protagonist-response pattern.

**Ez diagnosztika, ne production hard gate.**

---

# 15. Kötelező tesztek

## T01 — v3 freeze

A jelenlegi PR #47 measured policy:

- planner v3;
- author v3;
- reviewer v3;
- editor v2

prompt hash legyen explicit rögzítve.

v4 bevezetése nem módosíthatja.

## T02 — policy compatibility

- v1 parse;
- v2 parse;
- v3 parse;
- v4 parse;
- cross-version invalid combination reject.

Például:

- v4 author + editor v2 → reject;
- v3 writer + quality 2.2 → reject.

## T03 — new editorial flags

Minden score=5 és `verdict=pass` mellett külön-külön false:

- `distinctRhetoricalShape`
- `systemMechanicsInvisible`
- `behavioralVariety`

→ gate FAIL.

## T04 — sequence signature binding

- report current period signature-je artifactba kerül;
- hash/receipt binding megmarad;
- módosított signature checkpoint után commitot blokkol.

## T05 — signature history

- legalább 6 korábbi v4 period kis signature-rel megtartható, ha 12 KiB bound engedi;
- a legutóbbi `min(3, ownedHistoryLength)` period raw összehasonlítási bizonyítéka maradjon meg;
- signature nélküli régi prefixnél is megmaradjon ez a raw minimum;
- overflow esetén előbb a nem védett memória, majd a legrégebbi signature csökkenjen; az új signature ne szorítsa ki a védett raw minimumot;
- ha a kötelező tartalom nem fér el, explicit context-bound hiba, változatlan 12 KiB limit mellett;
- overflow deterministic trim;
- duplicate/foreign period reject.

## T06 — mixed old/new prefix

Branch:

- v2 artifact;
- v3 artifact;
- v4 artifact

historyból v4 job indul.

Nincs rewrite.

Nincs parser failure.

## T07 — withheld

Withheld esetén:

- storyFacts üres;
- raw sequence history üres;
- compact signature history üres.

## T08 — repair routing

System leakage only:

- prose repair megengedett.

Repeated rhetorical ending only:

- prose repair megengedett.

Repeated story engine:

- author_package repair.

NPC/protagonist behavioral template:

- author_package repair.

## T09 — hard constraint preservation

Az új prose/system separation NEM jelentheti:

- constraint elfelejtést;
- accepted choice eltérést;
- time/resource limit megszegését;
- privacy/fidelity lazítást.

## T10 — exact date

Fixture, ahol az exact date csak server period end:

- structured candidate megtartja;
- prompt explicit azt mondja, nem kell reader prose-ba kiírni.

Fixture, ahol a dátum valódi story deadline:

- megengedett.

Ne legyen production regex hard-ban minden dátum tiltva.

## T11 — name guidance

Prompt regression:

- explicit role-pun/nominative-determinism tiltás benne van;
- régi prompt hash változatlan.

Nem kell production név-blacklist.

## T12 — 6-period creative-only

Offline:

- `--creative-only --periods 6` működik;
- normál nem-creative `--periods 6` továbbra reject, amíg canonical benchmark nem változik;
- resume működik;
- fork prefix továbbra helyes;
- request accounting marad.

## T13 — human sequence rating binding

- ismeretlen sequenceId → reject;
- hash mismatch → reject;
- duplicate reviewer+sequence → reject;
- invalid paragraph reference → reject;
- `diagnostic-ai` nem számít human release evidence-nek.

## T14 — old human benchmark unchanged

A régi:

- 34 blind pair;
- pair hash;
- critical means;
- 70% preference;
- existing rating files

byte/semantic kompatibilitása maradjon.

## T15 — recovery/export/privacy

Új report/signature:

- owned export contract szerint viselkedik;
- public DTO-ba nem szivárog privát artifact;
- delete/revoke prune működik;
- recovery parser érti;
- old recovery policyt nem lazítjuk.

---

# 16. Offline quality regression corpus

## A bizonyíték határa

A szintetikus editor-report fixture azt bizonyítja, hogy a szerver a hibajelzést helyesen validálja, elutasítja és a megfelelő javítási ágra irányítja. Nem bizonyítja, hogy a valódi editor modell a prózából önállóan felismeri ezt a hibát. A hatperiodusos offline futás a végrehajtást, a memóriaútvonalat, a resume/fork működést és az accountingot ellenőrzi; irodalmi minőséget nem igazol.

A későbbi, külön engedélyezett valódi mérésben legyen külön:

- editor-kalibráció: előzetesen indokolt pozitív és negatív szövegkontrollok, az elvárt címke modellnek történő átadása nélkül;
- friss, a prompt finomításához nem használt történetsorozatok olvasói vizsgálata;
- a modell téves elfogadásainak és téves elutasításainak rögzítése; a csendes vagy lassan változó jó történet is fontos pozitív kontroll.

Egy ismert rossz mintára sikeres kalibráció nem általános minőségbizonyíték. A modell által adott hét igaz flag sem helyettesíti az olvasói eredményt. Az offline PR-ben e későbbi vizsgálatokhoz a futtatási és adatgyűjtési támogatás készüljön el; valódi provider-hívás ettől még nem engedélyezett.

A repo-tesztben legyenek kifejezett negatív kontrollok a két audit alapján.

Nem szükséges a teljes hét modell-outputot production fixture-ként commitolni.

Elég célzott, szintetikus kontroll.

## QN1 — boundary/guardrail leakage

A chapter:

- exact endDate-t feleslegesen kimond;
- entitlement-szerű opcióleírást ad.

Editor fixture:

- systemMechanicsInvisible=false.

Gate reject.

## QN2 — repeated self-correction

Három előző signature:

- `immediate_self_correction`.

Current chapter ugyanez, más felszíni témával.

behavioralVariety=false.

Gate reject.

## QN3 — repeated tableau

Előző fejezetek:

- `tableau`;
- `tableau`;
- `tableau`.

Current más tárggyal ugyanúgy tableau.

distinctRhetoricalShape/distinctEnding false.

Gate reject.

## QN4 — different object, same story engine

Régi:

- NPC objection → protagonist correction → institutional option.

Új:

- más helyszín;
- más tárgy;
- más NPC;

de ugyanaz a causal mechanism.

distinctDramaticStructure=false.

## QP1 — quiet valid chapter

Kevés konfliktus.

Nincs mentor.

Nincs spektákulum.

Van:

- konkrét tevékenység;
- tényleges következmény;
- curiosity.

PASS.

## QP2 — persistent misunderstanding

A protagonist nem oldja meg azonnal.

A félreértés későbbi chapterig legitim módon nyitva marad.

PASS, ha canon és choice rendben.

## QP3 — repeated character, changed causal role

Ugyanaz az NPC/tárgy visszatér, de:

- más célja van;
- más agency;
- más dramatic engine.

Ne bukjon pusztán recurrence miatt.

---

# 17. Human validation terv

A fejlesztési PR merge-je után, külön engedély esetén.

## Fázis H1 — kezdeti vak olvasói sequence audit

Ez korai visszajelzés, és önmagában nem igazolja a hosszú távú változatosságot.

Legalább:

- 2 külön profil;
- profilenként legalább 3 egymást követő period;
- legalább 1 valódi alternatív fork;
- teljes sequence-ben olvasva.

Az értékelő ne lássa:

- editor score;
- prompt version;
- source label;
- policy label.

## Elsődleges kérdések

1–5, az olvasói élményt előre véve:

- mennyire merültél el a történetben?
- tovább olvasnád?
- történt-e számodra érdemi, érdekes előrelépés?
- könyv/film történetének érződött?
- emberinek hatott a megfogalmazás?
- önálló életük volt a mellékszereplőknek?
- a főhős emberinek, nem optimalizált agentnek tűnt?
- változatos maradt a dramaturgia?
- láthatatlan maradt a rendszer mechanikája?
- organikus volt a memória?
- valóban eltérő életet hozott a branch?

## Külön kérdés

> Ha nem mondták volna meg, hogy AI generálta, a teljes sequence után gyanakodnál-e rá? Miért?

Ez a generátor felismerhetőségéről gyűjt másodlagos olvasói visszajelzést; nem objektív eredetvizsgálat, és nem a fő minőségi cél.

## Fázis H2 — hosszabb távú olvasói validáció

A tartós változatosság állításához külön szükséges:

- legalább 2 külön profil, profilenként 6 egymást követő fejezettel, teljes sorozatként olvasva;
- legalább 1 valódi alternatív fork külön, közös prefixszel bemutatva;
- azonos végső candidate forráshoz és policyhez kötött, hash-azonosított szövegcsomagok; eltérő forrást ne címkézz át egységes bizonyítékká;
- a 4–6. fejezetre külön visszajelzés arról, maradt-e folytatási kedv, változatos dramaturgia és hiteles szereplői viselkedés;
- az editor által elfogadott, de az olvasó által gyengének vagy ismétlődőnek talált részek külön rögzítése.

A H1 és H2 eredménye külön szerepeljen. A H1 minimum teljesítése ne legyen H2 PASS. A hatfejezetes vizsgálat is korlátozott mintás bizonyíték, nem korlátlan történethosszra szóló garancia. A reviewer-létszámot, összesítési szabályt és esetleges release-küszöböt a mérés előtt külön owner-döntés rögzítse; ez a terv nem talál ki új release thresholdot.

A H2 friss generálásához külön költségengedély és előzetes foglalási/költségterv kell a 13.3. pont szerint. Az offline implementáció készültsége ettől külön értékelhető.

---

# 18. Fejlesztési acceptance criteria

A kódcsomag csak akkor kész:

- [x] `main` aktuális HEAD-ről indult.
- [x] v3 paid-evidence promptok fagyasztva.
- [x] v1/v2/v3 policy változatlanul olvasható.
- [x] v4 új policy külön verzió.
- [x] nincs új rutin AI-hívás.
- [x] max9 / one-repair változatlan.
- [x] report 1.2 tartalmazza az új sequence jeleket.
- [x] system mechanics leakage explicit gate.
- [x] rhetorical sequence repetition explicit gate.
- [x] behavioral repetition explicit gate.
- [x] compact long-horizon signature működik.
- [x] 12 KiB context bound változatlan.
- [x] withheld/prefix privacy változatlan.
- [x] mixed history működik.
- [x] structured dates/constraints authority változatlan.
- [x] prose-nak nem kötelező period-end date-et kiírni.
- [x] role-pun name guidance implementálva.
- [x] 6-period creative-only offline diagnózis támogatott.
- [x] creative sequence human-review artifact generálható három- és hatfejezetes sorozathoz, valamint prefix + alternatív ágakhoz.
- [x] olvasói élmény az elsődleges értékelési cél; AI-gyanú külön, másodlagos diagnosztika.
- [x] offline kaputeszt, valódi editor-kalibráció, H1 és H2 bizonyítékai külön jelöltek; egyik sem helyettesíti a másikat.
- [x] régi human benchmark változatlan.
- [x] nincs production mutation.
- [x] nincs paid provider call.
- [x] nincs beta ledger/window reset.
- [x] canonical docs frissítve.
- [x] teljes CI zöld az első implementációs forráson (#321, 3147d33); a végleges HEAD ellenőrzései a PR-ben követendők.

---

# 19. Kötelező repository ellenőrzések

Legalább:

```bash
pnpm format:check
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
git diff --check
```

Ezen felül:

```bash
pnpm evaluate:narrative --mode offline --creative-only --periods 6 --out <fresh-local-path>
```

vagy az implementáció végleges CLI-jének megfelelő ekvivalens parancs.

A PR body-ban pontos output kell:

- test files;
- test count;
- build;
- schemas;
- docs;
- creative-only 6-period result;
- request/repair ceiling evidence;
- backward compatibility evidence.

---

# 20. Dokumentáció

Ugyanabban a PR-ben frissítendő, ha releváns:

- `docs/STATUS_HU.md`
- `docs/DEVELOPMENT_PLAN_HU.md`
- `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
- `docs/AI_MODEL_ROUTING_HU.md`
- `docs/architecture/ARCHITECTURE_HU.md`
- `docs/operations/NARRATIVE_EVALUATION_HU.md`
- `docs/operations/NARRATIVE_RELEASE_HU.md`
- `docs/decisions/ADR-008-creative-fiction-final-author-canon.md`
- generált `docs/contracts/fiction/*`

Ne hozz létre külön státusz-riportot, ha a kanonikus dokumentumba illeszthető.

---

# 21. N09 / PR #42 kapcsolat

A jelenlegi nyitott PR #42 régebbi source-ból származik és már PR #47 előtt is stale volt.

Ez a quality task:

- **nem merge-eli**;
- **nem módosít production operátort**;
- **nem futtat migrationt**.

Ha ez a terv új:

- policy v4;
- editor v3;
- quality 2.2;
- report 1.2;
- új artifact/context mezőt

vezet be, akkor a PR #42 későbbi forward-portjának/review-jának ezeket is értenie kell.

N09 runtime/recovery compatibility csak a végleges quality policy után zárható le.

---

# 22. Javasolt Git workflow

Issue:

`#45`

Branch:

```text
fix/fiction-human-likeness-long-horizon-45
```

Base:

```text
main
```

A Codex induláskor:

```bash
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
```

Ha a HEAD már nem:

```text
2da2e8c569e926ffe4b831aaf7af67caa75c9d13
```

akkor:

1. olvasd újra a delta-t;
2. ellenőrizd a `fiction.ts`, `fiction-prompts.ts`, `fiction-memory.ts`, `fiction-processor.ts` változásait;
3. csak akkor folytasd, ha a terv alapfeltevései továbbra érvényesek;
4. konfliktus esetén ne oldd meg hallgatólagosan.

Javasolt commitok:

1. `test(fiction): freeze v3 quality policy and add audit regressions`
2. `feat(fiction): add v4 long-horizon human-likeness policy`
3. `feat(fiction): retain compact sequence signatures across history`
4. `feat(eval): add creative sequence human audit`
5. `docs(fiction): document post-audit quality gates`

Egy PR, egy scope.

Ne self-merge.

---

## 22.1. Többügynökös végrehajtás és kvótaoptimalizálás

Owner-utasítás, 2026-10-17: a terv végrehajtásakor a fő Codex-ügynök tervezzen a gépen telepített Claude Code és Antigravity ügynökökkel is, a kvóták gazdaságos felhasználása érdekében. Ez kifejezett felhatalmazás az e tervhez tartozó részfeladatok delegálására; önmagában nem indítja el a fejlesztést.

Ellenőrzött helyi képességek, 2026-10-17:

- Claude Code: `/home/muszy/.local/bin/claude`; nem interaktív `--print` futtatás működik. A `claude auth status` sikeres Claude-előfizetéses hitelesítést (`loggedIn: true`) jelzett; az izolált próbafeladat eredménye `AGENT_OK` volt.
- Antigravity CLI: `/home/muszy/.local/bin/agy`; nem interaktív `--print` és JSON-kimenet működik. Az izolált próbafeladat eredménye `AGENT_OK` volt.
- A hitelesítési és kvótaállapot idővel változhat. A tényleges delegálás előtt ellenőrizd az aktuális elérhetőséget; a korábbi próba nem garantál későbbi kvótát vagy hozzáférést.

Javasolt munkamegosztás:

1. Codex: fő integráció, contract/policy authority, komponensek közötti függőségek, végső ellenőrzések és PR összeállítása.
2. Claude Code: jól körülhatárolt kód- vagy prompt-review, visszamenőleges kompatibilitás és javítási útvonalak ellenőrzése; szükség esetén elkülönített implementációs részfeladat.
3. Antigravity: elkülönített evaluation/teszt/dokumentációs részfeladat vagy célzott második review. A feladatot a ténylegesen elérhető képesség és kvóta szerint válaszd ki.

Végrehajtási szabályok:

- Ne futtasd le ugyanazt a teljes feladatot mindhárom ügynökkel. Oszd fel a munkát világos bemenettel, érintett fájlokkal, elfogadási feltételekkel és várt kimenettel.
- Párhuzamos szerkesztés csak külön munkapéldányban vagy bizonyíthatóan elkülönített fájltulajdonlással történjen; ugyanazt a contractot ne módosítsa egyszerre több ügynök.
- A delegált ügynökök a szükséges forrást, specifikációt és szintetikus tesztadatot kapják meg. Titkot, operátori privát állapotot és éles felhasználói adatot ne adj át.
- Először a meglévő helyi hitelesítést használd; kvótahiány esetén ne válts csendben fizetős API-kulcsra. Ne kerüld meg a jogosultságokat vagy a szolgáltatói korlátokat.
- Az alkalmazás történetgeneráló modellje változatlan marad. A fejlesztőügynökök használata nem modellkísérlet a termékben.
- A fő ügynök ellenőrizze a delegált eredményt és a releváns teszteket. Másik AI review-ja nem emberi olvasói minőségbizonyíték, és nem automatikus release- vagy merge-engedély.
- A fejlesztőügynökök használatát és az alkalmazás külön OpenAI minőségi mérésének ledgerét kezeld külön. E munkamegosztás nem emeli a 10 USD kumulatív mérési keretet, és nem engedélyez új fizetett történetgenerálási próbát.
- Kvóta vagy hozzáférés hiányában szervezd át a részfeladatokat az elérhető ügynökökre, és jelezd a tényleges korlátot; ne állítsd sikeresnek az el nem végzett review-t.

---

# 23. PR body kötelező tartalma

## Scope

- post-PR47 human-likeness hardening;
- prose/system separation;
- long-horizon story-shape detection;
- behavioral/rhetorical variety;
- sequence human audit.

## Explicitly unchanged

```text
Model: unchanged
Normal calls: 5
Physical request cap: 9
Content repair cap: 1
Production cohort: unchanged / disabled
Production mutation: NONE
Paid provider calls: NONE
Beta window reset: NONE
Development ledger reset: NONE
SQL migration: NONE unless implementation proves it unavoidable
```

## Evidence

```text
Base commit: <actual>
Final commit: <sha>

format:check: PASS
docs:check: PASS
typecheck: PASS
test: PASS (<files>/<tests>)
build: PASS
schemas: PASS
git diff --check: PASS

v1 compatibility: PASS
v2 compatibility: PASS
v3 compatibility: PASS
v4 policy: PASS
withheld/prefix privacy: PASS
mixed-history recovery parser: PASS
6-period creative-only offline diagnostic: PASS

Production mutation: NONE
Paid provider calls: NONE
```

---

# 24. Stop conditions

Codex álljon meg és jelezzen, ha az implementációhoz bármelyik szükséges:

- új AI-hívás hozzáadása;
- max9 emelése;
- második repair;
- SQL migration;
- 12 KiB memory bound emelése;
- privacy/withheld lazítás;
- existing human release gate csendes átírása;
- modellváltás;
- production apply;
- paid API call;
- development budget emelése;
- régi v1/v2/v3 artifact átírása.

Ezek új owner-döntést igényelnek.

---

# 25. Várt eredmény

A fejlesztés után az Alterward ne csak egyenként írjon jó fejezeteket.

A kívánt állapot:

- egyetlen fejezet emberinek hat;
- hat egymást követő fejezet után sem válik nyilvánvalóvá a generátor sablonja;
- a rendszer constraintjei működnek, de nem látszanak;
- az NPC-k nem mind tanárok;
- a protagonist nem mindig öt másodperc alatt tanul;
- a retorikai eszközök nem ismétlődnek mechanikusan;
- a branch valóban eltérő életet hoz;
- a continuity továbbra pontos;
- a próza megőrzi a jelenlegi `The Cut Window` / `Someone Else's Ending` szintű erősségeit.

Az elsődleges minőségi cél:

> **Hosszú távon is magával ragadó személyes fikció, hiteles szereplőkkel, érdemi következményekkel és tartós folytatási kedvvel.**

A háttérben működő generációs mechanizmus láthatatlansága ezt az élményt támogatja. Az, hogy a szöveget az olvasó kevésbé tartja AI-szerűnek, önmagában nem elég a sikerhez.

---

# 26. Rövid Codex handoff

A konkrét végrehajtási utasítás:

```text
Repository: Muzsy/future_flow
Issue: #45
Base branch: main
Reference base commit at plan creation:
2da2e8c569e926ffe4b831aaf7af67caa75c9d13

Implement the post-PR47 creative-fiction human-likeness and long-horizon
quality hardening described in this document.

Treat current code, ADR-008 and canonical docs as authority.
Freeze all measured v1-v3 behavior before introducing a new v4 policy.
Do not add routine AI calls, increase request/repair limits, mutate
production, make paid provider calls, reset any ledger/window, or weaken
privacy/recovery/budget guards.

Open a dedicated PR against current main and do not merge it yourself.
```


# 27. Offline végrehajtási eredmény — 2026-10-17

A terv kód- és offline ellenőrzési része elkészült a `fix/fiction-human-likeness-long-horizon-45` ágon, az eredeti `2da2e8c569e926ffe4b831aaf7af67caa75c9d13` main bázisból. Az aktuális technikai és nyitott kiadási állapot kanonikus helye a STATUS és a DEVELOPMENT_PLAN; a PR pontos HEAD/CI bizonyítéka a PR leírásában követendő. A végrehajtás nem self-merge és nem production rollout.

Helyi technikai ellenőrzés: **93 tesztfájl / 998 teszt PASS**, format/docs/typecheck/build/schemas és diff-check sikeres. A teljes creative-only offline CLI nyolc profil hat-hat főági fejezetét és két alternatív folytatását készítette el: 50 szintetikus minta / 250 mock transport, nulla hiba és nulla repair, 8 main + 2 branch olvasói bundle. Minden minta öt kérést használt, minden creative-only választás reviewed=false; complete=false és qualityRelease=false megmaradt. Ez nem valódi modell- vagy emberi minőségmérés.

Claude Code a prompt/provider részt, Antigravity az evaluation eszközöket készítette; a közös integráció külön ellenőrzött. A csak olvasó Claude kódaudit két észrevétele javítva és regresszióval védett: régi kötelező StoryFactok kronologikus sorrendje, valamint valóban külön periodokat használó vegyes v2/v3/v4 history-teszt. Új emberi release-pontküszöb nincs; a mentett sorozatértékelés újraellenőrzött rating inputhoz és a teljes bundle snapshothoz kötött.

A CLI próba working-tree offline bizonyíték; nem tiszta végső forráshoz kötött paid release-mérés. A történetmodell változatlan, normál öt/max9 fizikai kérés és egy javítás maradt; új AI-stage, SQL-migráció, 12 KiB keretemelés, production mutation, beta-window vagy ledger-reset nem történt. A H1/H2 olvasói validáció és külön fizetett mérés ebben a csomagban nincs elvégezve vagy engedélyezve.

Az első implementációs `3147d33e536ffebd899cfba851c7a22217cde679` forrás GitHub Verify és Container CI-je **#321 / 39001289089: SUCCESS**, 93 fájl / 998 teszt. A záró promptpontosítás a planner/author számára is explicit módon összehasonlítási, nem kötelező archetipus-forgási adatként írja le a compact historyt; a v1–v3 hash-ek változatlanok, 34 célzott prompt/worker teszt PASS. A végleges HEAD és új CI eredménye a [PR #48](https://github.com/Muzsy/future_flow/pull/48) leírásában és ellenőrzéseiben követendő. A PR nyitva marad; nincs self-merge vagy release-engedély.


## Utólag külön engedélyezett valódi próba — 2026-10-17

A terv eredeti paid=false határa az offline implementációra vonatkozik. A tulajdonos későbbi „Valódi generalas kell.” utasítása külön engedélyezte a tényleges generálást a meglévő kumulatív 10 USD plafonon belül; nem keretemelés és nem production vagy merge engedély.


### 2026-10-17-i külön engedélyezett valódi v4 diagnózis

A tulajdonos „Valódi generalas kell.” utasítása után tiszta `3809c560e4990c8fcc149a4d1af4e38a47c74c1c` forrással tényleges OpenAI-mérés futott, változatlan gpt-6.1-sol modellel, dedicated development projekttel és a korábbi globális ledgerrel. Egy kitalált alkotói profil három főági fejezete és egy alternatív harmadik készült: „The Missing Sleeve”, „Where the Door Opens”, „A Voice for the Kitchen”, „The Pale Centre”. A választások diagnostic-index/reviewed=false státuszúak; ez H1-hosszúságú olvasói anyag, nem emberi H1 PASS vagy teljes H2.

Négy végső kapu-PASS, 26 fizikai hívás; az első két rész öt-öt, a két harmadik nyolc-nyolc hívás, egy-egy javítással. Minden végső score >=4, mind a hét sequence-jelzés igaz. Accounted 1.410585 USD, usage-becslés 1.2957948 USD; javításokkal együtt átlag 0.35264625 USD/elfogadott szöveg. P95 420594 ms. A 50%-os repair és a kb. hétperces P95 kis mintás, de nem elhallgatható költség/idő jelzés.

A teljes szöveg ügynöki olvasása szerint a művek konkrétak, jó párbeszédekkel és eltérő következményekkel: a főág közös könyvhöz/felolvasáshoz, az alternatíva önálló képsorhoz és feltételes vételi ajánlathoz vezet. Az első két lezárás azonban újra órakeretes együttműködést kínál, a harmadik is határidős lehetőségre épül. Ez megmaradt ismétlődési kockázat az automatikus PASS mellett. Független emberi rating nincs; complete=false, qualityRelease=false, sequenceAssessment=null.

A completed job takarítása a köztes elutasítások részletes jelentését nem őrizte meg. A receipts/transport alapján a főági harmadik editorial utáni prózajavítása és az alternatíva fidelity utáni csomagjavítása látható, de az első pontos kifogás/pontozás nem rekonstruálható. Ezt nem szabad kitalálni vagy végső hibátlanságként jelenteni. Következő eval előtt a szintetikus, lokális köztes gate-evidence megőrzése külön javítandó, production privacy-retention lazítása nélkül.

A visszaolvasott globális ledger **255 hívás / 8.204535 USD accounted**, 7.5994029 USD usage-becslés; **1.795465 USD maradék** az engedélyezett összesen 10-ből. Nulla ismeretlen usage, aktív vagy hozzárendeletlen foglalás. Az új valódi részdiagnózis nem production apply, main merge, modellváltás, budget/window reset, teljes H2 vagy release-engedély.
