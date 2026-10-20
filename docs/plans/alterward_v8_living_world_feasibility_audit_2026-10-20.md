---
status: active-supporting
owner: agents
created: 2026-10-20
base_commit: a666c905ef953cc696d5d8a0faa4f9169ec01824
workstream: F05/F06 quality follow-up (living world)
state: decisions-recorded
paid_provider_calls_authorized: false
production_authorized: false
related:
  - 047_fiction_v8_series_evidence.md
  - ../decisions/ADR-008-creative-fiction-final-author-canon.md
  - ../operations/NARRATIVE_EVALUATION_HU.md
---

# Alterward v8 → életszerűbb karakter- és világmodell
## Megvalósíthatósági és architekturális audit

**Dátum:** 2026-10-20  
**Repository:** `Muzsy/future_flow`  
**Auditált főági commit:** `a666c905ef953cc696d5d8a0faa4f9169ec01824`  
**Audit típusa:** statikus forráskód-, contract-, persistence-, recovery-, pipeline- és tesztharness-audit  
**Módosítás történt a repóban:** nem  
**Új paid futás történt:** nem  
**Új CI futás történt:** nem

---

# 1. Vezetői összefoglaló

## 1.1. Rövid válasz

**Igen, a kívánt fejlesztés technikailag megvalósítható úgy, hogy a v8 jelenlegi stabilitási és gazdaságossági alapelvei megmaradjanak, de nem triviális ráépítésről van szó.**

A kód auditja alapján a jó megoldás nem:

- néhány új promptmondat;
- egy teljesen új „világszimulátor” LLM-hívás;
- a jelenlegi `LifeStateV2` actor objektumainak telepakolása pszichológiai mezőkkel;
- minden NPC számára nagy RPG-karakterlap;
- vagy a dramaturgiai kontroll feladása egy tisztán bottom-up szimuláció kedvéért.

A javasolt megoldás egy **verziózott, bounded, branch-scoped „living cast / life texture” narratív réteg**, amely:

1. a jelenlegi v8 canon/state gerincre épül;
2. nem hoz létre második igazságforrást a Life V2 mellett;
3. a visszatérő fiktív szereplőknek tartós, valóban viselkedést befolyásoló karakterállapotot ad;
4. külön kezeli a stabil személyiségjellegű és a változó élethelyzeti/kapcsolati állapotot;
5. a világ „életét” elsősorban a már meglévő state + StoryFact + open thread rétegből projektálja, nem egy párhuzamos komplett világadatbázisból;
6. a plannernek és authornak **már a jelenet megtervezése előtt** rendelkezésre bocsátja a szereplők saját céljait, figyelmét és megoldatlan ügyeit;
7. ugyanazt az öt alap AI-szakaszt használja, mint a jelenlegi sikeres normál út;
8. megtartja a `maxPhysicalRequests = 9` és `maxContentRepairs = 1` korlátot;
9. új policyként kerül be, miközben a v8 byte-/policy-/artifact-kompatibilitása érintetlen marad;
10. az új állapotot immutable artifactokból lehet visszaépíteni, így fork, recovery és reproducibility szempontból illeszkedik a jelenlegi architektúrához.

**Az audit minősítése:**

| Szempont | Minősítés |
|---|---|
| Technikai megvalósíthatóság | **magas** |
| Implementációs komplexitás | **közepes–magas** |
| Architekturális kockázat kontrollált verziózással | **közepes** |
| Architekturális kockázat naiv megvalósítással | **magas** |
| Plusz AI-hívás szükségessége | **nem indokolt az első verzióban** |
| DB-séma nagy átalakításának szükségessége | **nem látszik szükségesnek** |
| V8 kompatibilitás megőrizhetősége | **igen** |
| Emberi minőségjavulás garantálható előre | **nem; mérni kell** |

A legfontosabb következtetés:

> **A v8-at nem szabad lecserélni. A v8 determinisztikus gerincét kell megtartani, és a hiányzó emberi réteget kell fölé építeni.**

---

# 2. Az audit célja és a fejlesztési probléma pontos megfogalmazása

A fejlesztés célja nem általában „jobb próza”.

A megadott v8 történetek és az első valódi emberi kritika alapján a jelenlegi motor már több erős tulajdonsággal rendelkezik:

- hosszú távú kontinuitás;
- visszatérő tárgyak és emberek;
- oksági következmények;
- finom, visszafogott próza;
- kevés klasszikus LLM-melodráma;
- stabil stílus;
- hihető kis léptékű fejlődés;
- működő fork;
- szerzői szabadság mellett szerveroldali canon-ellenőrzés.

A fő hiányosság azonban nem egyszerűen az, hogy „kevés a konfliktus”.

A kritika mélyebb állítása:

1. **A szereplők túl gyakran teljesítik a narratív funkciójukat.**
2. A párbeszédek és reakciók túl tiszták, célirányosak és fegyelmezettek.
3. A világ kevéssé tör be a fő történetszálba.
4. Kevés a fizikai jelenlét, testi tapasztalat és hétköznapi akadály.
5. A főhős érzelmi tétje gyakran kevésbé erős, mint a technikai/craft probléma.
6. A történet ritmusa hosszú távon túl egyenletes.
7. A mellékszereplők gyakran azért jelennek meg, hogy feedbacket adjanak, ellenpontozzanak vagy továbbvigyék a főhőst.

A fejlesztési cél ezért:

> **Ne több mesterséges dráma keletkezzen, hanem olyan szereplők és körülmények, amelyeknek a főszereplőtől részben független állapotuk és motivációjuk van, és ezek természetes ütközéséből válassza ki a dramaturgiai réteg a jó történetet.**

Ez fontos különbség.

---

# 3. Mit talált az audit a jelenlegi v8 architektúrában?

## 3.1. A v8 stabilitása nem promptalapú

A legfontosabb megállapítás, hogy a jelenlegi rendszer megbízhatósága **nem azon múlik, hogy a prompt jól van megírva**.

A v8 mögött explicit szerződéses és determinisztikus infrastruktúra áll:

- Zod contractok;
- policy-verziók;
- frozen promptverziók;
- request/output hash binding;
- typed state transition;
- canon replay;
- final author package validation;
- story-fact provenance;
- branch/revision ownership;
- privacy reference snapshot;
- checkpoint recovery;
- atomic commit;
- request ceiling;
- single-repair policy;
- byte-bound memory;
- byte-bound artifact;
- szerveroldali series evidence.

Ez jó hír.

Ez azt jelenti, hogy a kívánt karakter- és világfejlesztést nem kell „beleolvasztani” a rendszer magjába. Lehet **új, explicit narratív rétegként** hozzáadni.

---

# 4. A jelenlegi domainmodell: mihez nem szabad hozzányúlni?

## 4.1. `LifeStateV2` maradjon vékony

Forrás:

`packages/contracts/src/life-v2.ts`

A jelenlegi actor:

```text
id
label
relationship
```

A kapcsolat típusa:

```text
partner
family
friend
colleague
other
```

Ez első látásra túl kevésnek tűnik egy „valódi emberhez”, de architekturálisan helyes, hogy a **kanonikus életállapot nem pszichológiai adatbázis**.

A Life V2 feladata más:

- munka;
- lokáció;
- pénz;
- asset;
- skill;
- cél;
- opportunity;
- resource;
- jelen lévő actor;
- typed state mutation.

### Következtetés

**Nem javaslom**, hogy ide kerüljenek olyan mezők, mint:

- temperamentum;
- félelem;
- konfliktusstílus;
- current concern;
- relationship tension;
- hangulat;
- személyes cél;
- belső motiváció.

Miért?

Mert akkor:

1. a Life V2 canon és a narratív pszichológia összekeveredik;
2. a real-person privacy határ nehezebben kezelhető;
3. minden régi parser és state replay bonyolódik;
4. fork/recovery esetén több mutable state-et kell összehangolni;
5. a domainmodell olyan dolgokat kezdene „tényként” kezelni, amelyek valójában történeti interpretációk.

**A jelenlegi vékony actor-modell tehát nem hiba. Meg kell tartani.**

---

# 5. Van-e már személyisége az NPC-knek?

## 5.1. Igen, de csak korlátozott dramaturgiai értelemben

Forrás:

`packages/contracts/src/narrative.ts`

A visszatérő fiktív szereplők számára már létezik:

`fictionalActorMemorySchema`

Mezői:

- `actorId`
- `introducedByEventId`
- `role`
- `desire`
- `resistance`
- `voiceCue`
- `lastSeenPeriodId`

Ez **jó kiindulási pont**.

De ez nem teljes személyiségmodell.

Inkább ezt írja le:

> Mi a szerepe ebben a történetben, mit akar, mi áll ellen, hogyan szólal meg?

Ez pontosan elég lehet a kontinuitáshoz, de nem elég ahhoz, hogy a szereplő:

- saját életet éljen;
- más miatt legyen ideges vagy lelkes;
- ne akarjon éppen a protagonist problémájáról beszélni;
- saját prioritása miatt megszakítsa a jelenet célirányosságát;
- tartósan más konfliktuskezelési mintát hozzon;
- a protagonist mellett is változzon;
- egy korábbi súrlódást ne a fejezet tanulsága szerint, hanem saját természetének megfelelően kezeljen.

## 5.2. A Reddit-kritika ezért valóban illeszkedik a kódhoz

A jelenlegi prompt már konkrétan próbálja elkerülni a funkcionális NPC-ket.

Forrás:

`packages/ai/src/fiction-prompts.ts`

A promptok többek között előírják, hogy:

- a karakterek akarjanak dolgokat;
- félreérthessék egymást;
- cselekedjenek;
- más emberek lehetnek fáradtak, pontatlanok, bizonytalanok, önérdekűek;
- nem kell nekik igazuk legyen;
- nem kell ők adják át a fejezet „tézisét”;
- private-life szereplők saját akarattal jelenjenek meg;
- ne ismétlődjön a „másik javasol → főhős ellenáll → félig enged” szerkezet.

**Mégis megjelent az emberi kritikában ugyanaz a probléma.**

Ez erős jel arra, hogy:

> **a prompt-only megoldás elérte a csökkenő hozadék szintjét.**

A modellnek nem elég azt mondani, hogy „legyen a karakter autonóm”.

**Adni kell neki egy tartós, konkrét állapotot, ami alapján autonóm módon tud viselkedni.**

---

# 6. Miért nem kell teljes világszimulátor?

A felvetett „először világot építünk, benne valódi személyiségekkel, aztán ebből születik történet” elv alapvetően helyes.

De tiszta formában veszélyes.

Egy teljes bottom-up szimuláció esetén:

- rengeteg state keletkezne;
- sok minden soha nem kerülne be a történetbe;
- nőne az input;
- nőne a költség;
- nőne a hibafelület;
- a planner elveszíthetné a fókuszt;
- rengeteg „életszerű, de érdektelen” esemény születhetne;
- a dramaturgiai ív túl gyenge lehetne;
- recovery és fork állapota jelentősen bonyolódna.

### Ezért a javasolt modell:

```text
kanonikus világállapot
        +
tartós szereplőállapot
        +
aktuális életnyomások
        ↓
lehetséges ütközések / találkozások
        ↓
dramaturgiai kiválasztás
        ↓
fejezet
```

Nem:

```text
előre megírt plot
↓
hozzátervezett NPC
↓
NPC végrehajtja narratív funkcióját
```

és nem is:

```text
teljes univerzum szimulálása
↓
reméljük, történet lesz belőle
```

Ez a **hibrid modell** illeszkedik legjobban az Alterwardhoz.

---

# 7. Javasolt új architektúra

## 7.1. Három külön igazságréteg

### A. Canonical Life State

Marad a jelenlegi Life V2.

Ez mondja meg:

- hol él;
- dolgozik-e;
- milyen pénzügyi állapotban van;
- milyen céljai vannak;
- kik tartoznak a jelenlegi actor-listához;
- milyen opportunityk léteznek;
- milyen typed változás történt.

### B. Narrative Character State

Új, verziózott réteg.

Ez mondja meg:

- egy visszatérő **fiktív** ember milyen személyiséggel működik;
- mi fontos neki;
- mi foglalkoztatja;
- hogyan kezeli a konfliktust;
- mit vár a protagonisttól;
- mi maradt köztük elrendezetlen.

### C. Narrative World / Life Texture Projection

Nem teljes új világadatbázis.

A meglévő adatokból és történeti tényekből készülő bounded projekció:

- employment;
- finance;
- available hours;
- location;
- recurring setting;
- open threads;
- StoryFacts;
- aktív emberi kapcsolatok;
- anyagi/térbeli/időbeli korlátok;
- aktuális életnyomások.

Ez adja azt az érzést, hogy:

> a protagonist nem üres díszletben végzi a projektjét.

---

# 8. Javasolt karaktermodell

## 8.1. Fontos: ne RPG-karakterlap legyen

A rossz megoldás:

- extraversion 74;
- neuroticism 61;
- agreeableness 42;
- 18 trait;
- 14 backstory mező;
- childhood wound;
- attachment style;
- MBTI;
- stb.

Ez:

- tokenpazarló;
- merev;
- könnyen sztereotip;
- narratívan túl explicit;
- az LLM elkezdi demonstrálni a karakterlapot.

A cél nem az, hogy a rendszer **leírja** a személyiséget.

A cél az, hogy a személyiség **viselkedést okozzon**.

## 8.2. Stabil réteg — csak fiktív szereplőkhöz

Illustratív, nem végleges schema:

```ts
FictionCharacterProfileV1 {
  actorId
  originEventId

  socialRole
  coreWant
  independentConcern
  conflictStyle
  attentionStyle
  valueCue[]
  voiceCue

  establishedAtPeriodId
}
```

### `coreWant`

Nem az adott jelenet célja.

Például:

> Wants reliable work and dislikes being pulled into vague commitments.

### `independentConcern`

Kifejezetten olyan dolog, amely nem a protagonist narratív funkciója.

Például:

> Protecting weekends because she is already overcommitted elsewhere.

Ez kulcsfontosságú mező lehet.

A Reddit-kritika egyik magja éppen az, hogy a mellékszereplők túlságosan a főhős történetében élnek.

### `conflictStyle`

Például:

> Avoids prolonged discussion, but becomes blunt when a boundary is crossed.

Ez sokkal hasznosabb, mint egy absztrakt személyiségpontszám.

### `attentionStyle`

Például:

> Notices practical inconvenience before artistic intention.

Ez segít abban, hogy ugyanazt a helyzetet két ember valóban máshogy érzékelje.

---

# 9. Dinamikus karakterállapot

A személyiség önmagában kevés.

Egy ember reakcióját nagyon gyakran az határozza meg, hogy **mi van vele most**.

Javasolt külön dinamikus állapot:

```ts
FictionCharacterDynamicStateV1 {
  actorId

  currentAim
  currentPressure
  attentionOn
  stanceTowardProtagonist
  unresolvedMatter
  lastMeaningfulChangePeriodId
}
```

Nem kell minden actor minden periódusban frissüljön.

Sőt, nem szabad.

Csak akkor változik, ha:

- az adott fejezetben történik vele valami;
- egy explicit branch-fiction fact változtat rajta;
- egy korábbi nyitott ügy következménye beérik.

### Miért jó ez?

A következő fejezetben Nessa nem így érkezik:

> „Nessa, friend, needs to react to artwork.”

Hanem például így:

```text
Nessa
- values spontaneity
- does not like long meta-discussion
- currently protecting her free time
- last interaction ended with protagonist over-explaining a small disagreement
- still likes protagonist
- unresolved: protagonist tends to turn casual meetings into art review
```

Ezután az aktuális jelenetnek **ehhez kell alkalmazkodnia**.

Itt kezd megjelenni az a hatás:

> „A szereplő nem tudja, hogy mellékszereplő.”

---

# 10. Kapcsolati állapot

A `relationship = friend` önmagában kevés.

Ugyanakkor nem javaslok game-like:

```text
trust = 73
affection = 82
irritation = 24
```

típusú rendszert.

Az ilyen skálák hamis pontosságot adnak, és könnyen gamifikálják a történetet.

Jobb egy kis bounded szemantikus réteg:

```ts
FictionRelationshipStateV1 {
  actorId
  currentDynamic
  expectation
  unresolvedInteraction
}
```

Példa:

```text
currentDynamic:
warm friendship, but art feedback has begun to dominate their meetings

expectation:
Nessa expects ordinary shared time, not another structured critique

unresolvedInteraction:
protagonist flattened a page corner and later apologized, but still tends to over-explain
```

Ez sokkal közvetlenebbül okoz hiteles jelenetet.

---

# 11. Valódi/supplied személyek: különösen fontos privacy-határ

Ez az egyik legnagyobb architekturális kockázat.

A jelenlegi rendszer helyesen tiltja, hogy a modell:

- új privát biográfiát találjon ki valódi emberről;
- diagnózist gyártson;
- rejtett tényként kezeljen kitalált magánéleti információt.

Ez nem lazítható az NPC-autonómia kedvéért.

## 11.1. Két kategóriát kötelező külön kezelni

### A. Wholly fictional actor

Itt lehet:

- stabil személyiség;
- saját cél;
- saját off-screen concern;
- fiktív munka;
- élethelyzet;
- változó viszony.

### B. Supplied person

Például valódi partner, barát, családtag.

Itt **nem** javasolt:

```text
secret fear
private financial problem
childhood trauma
hidden romantic concern
undiagnosed condition
workplace crisis
```

kitalálása és persistent state-ként kezelése.

A supplied embernél inkább:

- user-supplied trait;
- ismert relationship;
- az adott alternatív ágban már megmutatott reakció;
- on-page interaction state;
- explicit branch-fiction consequence.

### Ajánlott provenance mező

Minden pszichológiai/kapcsolati állapothoz legyen egyértelmű eredet:

```text
user_supplied
branch_fiction
interaction_derived
```

és validátor ne engedje, hogy `branch_fiction` privát real-world factként visszakerüljön a profilba.

---

# 12. A világépítéshez már most több alap van, mint elsőre látszik

Nem érdemes újra létrehozni azt, ami már megvan.

## 12.1. Meglévő world state

A Life V2 már tudja:

- location;
- housing;
- employment;
- work domain;
- finance;
- liquid funds;
- available hours;
- energy;
- goals;
- opportunities;
- assets;
- actors.

## 12.2. Meglévő StoryFact

A fiction layer már tárolhat:

- `encounter`
- `artifact`
- `setting`
- `relationship_detail`
- `promise`
- `outcome`
- `observation`

Ez kiváló alap a visszatérő világérzethez.

## 12.3. Következtetés

Az első fejlesztési verzióban **nem javaslok külön „WorldStateV1” univerzumot**.

Inkább:

```text
LifeStateV2
+ active StoryFacts
+ openThreads
+ CharacterState
→ deterministic LifeTextureProjection
```

Ez jóval olcsóbb és biztonságosabb.

---

# 13. Embodiment: ezt nem szabad összekeverni a karaktermodellel

A Reddit-kritika másik fontos eleme:

> kevés a fizikai jelenlét; túl mentális, túl tiszta a világ.

Ehhez nem kell feltétlen új persistent „body state”.

Sőt, az egészségszerű állapotok tárolása privacy/safety problémákat is hozhat.

## 13.1. Első verzióban javasolt megoldás

A planner kapjon `lifeTextureProjection`-t:

- mennyi szabad idő;
- munkahelyi terhelés;
- pénzügyi mozgástér;
- lakhatási/térbeli helyzet;
- évszak/időszak;
- recurring place;
- már kanonikus tárgyak;
- napi rutin;
- aktuális open thread;
- fontos emberi kapcsolat.

A planner/author pedig kapjon explicit, de nem kvótaszerű elvet:

> A practical/physical consequence should appear when causally natural; do not make every scene purely cognitive or verbal.

### Jó embodiment

- késik;
- éhes;
- fáradt;
- tele van az asztal;
- nincs hely;
- hideg van;
- lemerült valami;
- meg kell szakítani a beszélgetést;
- a munka másnap reggel kezdődik;
- pénzbe kerül;
- egy fizikai tárgy akadályoz;
- valaki siet.

### Rossz embodiment

Minden fejezetbe mesterségesen:

- fáj a háta;
- görcsöl a keze;
- megvágja magát;
- esik az eső.

Ez ugyanolyan template lenne, mint amit most le akarunk bontani.

---

# 14. A jelenlegi memory-rendszer auditja

Forrás:

`packages/database/src/fiction-memory.ts`

A jelenlegi rendszer egyik legerősebb része, hogy a promptmemória **nem egy szabadon mutálható karakter-adatbázisból** áll össze.

A rendszer:

1. az owned history prefixet olvassa;
2. az immutable narrative artifactokat parse-olja;
3. azokból foldolja:
   - storyFacteket;
   - signature historyt;
   - sequence historyt;
   - series ledgert;
4. bounded contextet épít.

Ez rendkívül jó alap.

## 14.1. 12 KiB memória-limit

A jelenlegi:

```text
NARRATIVE_MEMORY_BYTES = 12 KiB
```

és a kód aktívan ritkít:

- excerpt;
- régi history;
- decision pattern;
- recent choice;
- nem mandatory story fact;
- signature history;
- sequence history.

Ha még egyszerűen beletesszük:

- 12 NPC teljes személyiségét;
- relationship state-et;
- current concern-t;
- world state-et;

akkor a rendszer vagy:

- túl sok fontos régi információt dob el;
- vagy `NARRATIVE_CONTEXT_INVALID` hibával megáll.

### Következtetés

**Az új karakterréteget nem szabad egyszerűen a jelenlegi 12 KiB `narrativeMemory` objektumba beleönteni.**

---

# 15. Javasolt memóriaarchitektúra

## 15.1. Durable archive

A teljes történeti karakter-delta maradjon az immutable artifactokban.

Ez olcsó storage-szempontból és tökéletes recoveryhez.

## 15.2. Deterministic fold

Új szerveroldali függvény:

```text
characterStateFromHistory(...)
```

Feladata:

- artifact-prefix végigolvasása;
- profile creation/update;
- dynamic-state update;
- relationship-state update;
- removed actor kezelése;
- branch prefix megtartása.

## 15.3. Bounded projection

A modellnek nem kell mindenki.

Új:

```text
characterProjection(...)
```

A releváns 4–8 szereplő rövid állapotát adja.

A pontos elemszámot **mérni kell**, nem most véglegesíteni.

Relevancia lehet:

- szerepel az aktuális candidate-ben;
- open relationship/conflict thread érinti;
- recent actor;
- private-life szereplő rég nem jelent meg;
- unresolved matter van vele;
- protagonist célja érinti;
- aktuális opportunity érinti.

### Fontos

A projection legyen:

- determinisztikus;
- hash-elhető;
- byte-bound;
- ugyanabból a history prefixből reprodukálható.

Ez pontosan ugyanaz a tervezési filozófia, mint a v8:

- `seriesLedger`
- `castingProjection`

esetén.

---

# 16. Miért jó precedens a v8 `seriesLedger`?

A v8 már megoldott egy nagyon hasonló problémát.

Nem küldi be korlátlanul az összes korábbi fejezetet.

Ehelyett szerveroldalon kiszámol:

- repeated openings;
- repeated phrases;
- recent closings;
- private-life participation;
- goal activity;
- friction pattern.

A modell egy **bounded evidence projectiont** kap.

Ez a minta közvetlenül újrahasználható karakterekre.

Például:

```text
characterProjection:
  Nessa:
    stable: ...
    dynamic: ...
    unresolved: ...
    provenance: ...
```

Nem kell a modellnek újra elolvasnia Nessa minden korábbi jelenetét.

---

# 17. Artifact-stratégia

A jelenlegi narratív artifact határa:

```text
NARRATIVE_ARTIFACT_BYTES = 32 KiB
```

A teljes új állapotot nem kell minden artifactba bemásolni.

Csak az **adott periódus delta** kerüljön bele.

Példa:

```ts
characterDelta: {
  addedProfiles: [...]
  profileUpdates: [...]
  dynamicUpdates: [...]
  relationshipUpdates: [...]
}
```

A teljes aktuális állapotot a következő generáláskor a szerver visszafoldolja.

Ez:

- kisebb artifact;
- jobb auditálhatóság;
- jobb fork-szemantika;
- jobb recovery;
- kevesebb redundancia.

### Fontos ellenőrzés

Az implementáció során külön teszt kell arra, hogy a worst-case új artifact továbbra is belefér-e a kiválasztott artifact capbe.

**Nem javaslom automatikusan megemelni a 32 KiB limitet.**

Előbb compact deltával meg kell próbálni benne maradni.

---

# 18. A pipeline auditja

Jelenlegi normál fiction út:

```text
planner
  ↓
author
  ↓
plan review
  ↓
fidelity
  ↓
editor
```

Normál sikeres esetben:

**5 modellhívás**

Policy limit:

```text
maxPhysicalRequests = 9
maxContentRepairs = 1
```

Ez fontos gazdaságossági és recovery-invariáns.

---

# 19. Kell-e külön „world simulation” AI-hívás?

## Auditválasz: első verzióban nem

Egy külön:

```text
world simulator
→ planner
→ author
→ reviewer
→ fidelity
→ editor
```

modell:

- 20%-kal több normál hívási szakasz;
- több latency;
- új checkpoint;
- új receipt;
- új retry;
- új budget reservation;
- új recovery path;
- új failure mode;
- több request-binding;
- nagyobb koordinációs probléma.

A jelenlegi többperces generálási idő mellett ez különösen rossz első lépés.

## Javaslat

A meglévő planner kapja meg a:

- character projectiont;
- life texture projectiont.

És ugyanabban a hívásban tervezze meg a periódus eseményeit.

Az author pedig ugyanúgy szabadon módosíthassa a draftot, mint most.

**Ha később valódi mérés bizonyítja, hogy ez kevés, lehet vizsgálni külön simulation pass-t.**

De erre jelenleg nincs bizonyíték.

---

# 20. Új planner output

Nagyon fontos: nem elég több inputot adni.

A planner outputjában is meg kell jelenjen, hogy a szereplők saját állapotból cselekszenek.

Nem feltétlen egy óriási schema.

Illustratív:

```ts
periodCharacterIntent: [{
  actorId,
  ownAim,
  attentionOn,
  interactionPressure,
  protagonistRelevance
}]
```

A `protagonistRelevance` akár nullable is lehet.

Ez fontos:

> lehessen egy NPC jelenlegi ügye részben irreleváns a protagonist céljához.

Például:

```text
ownAim:
leave on time and avoid another long discussion

attentionOn:
an unrelated commitment later that evening

interactionPressure:
protagonist wants detailed feedback

protagonistRelevance:
low at scene opening
```

Ez már eleve más jelenetet generál, mint:

> Nessa gives feedback on art.

---

# 21. Új author output

Az author jelenleg:

- final candidate;
- final plan;
- storyFacts;
- chapter

csomagot ad.

Az új policyban ehhez hozzáadható:

```text
characterDelta
relationshipDelta
```

esetleg:

```text
lifeTextureFacts
```

ha valami tartóssá válik.

De nem kell minden prose részletet state-té tenni.

### Szabály

**Csak az kerüljön deltába, aminek a következő fejezetben jelentősége lehet.**

Például:

Tartós:

> Nessa explicitly asks not to have every meeting turned into an art review.

Nem tartós:

> Nessa is holding a paper cup.

Kivéve, ha abból később artifact/motif lesz.

---

# 22. A meglévő `StoryFact` réteg újrahasznosítása

A világépítés jelentős részéhez nem kell új struktúra.

A meglévő:

```text
setting
artifact
relationship_detail
promise
outcome
observation
```

factok már alkalmasak:

- visszatérő helyek;
- közös tárgyak;
- korábbi ígéretek;
- relationship detail;
- konkrét outcome;
- fontos megfigyelés

megőrzésére.

Ezért az új fejlesztés fókusza inkább:

> **ki ez az ember és milyen állapotból reagál?**

mint:

> **még egy új általános történeti memória.**

---

# 23. Schema-versioning: itt lehet a legkönnyebben tönkretenni a v8-at

A jelenlegi kód következetesen megtartja a régi policykat.

V8:

```text
planner v8
author v8
reviewer v8
editor v7
fidelity v1
qualityPolicy 2.7.0
```

A tesztek explicit ellenőrzik, hogy a korábbi verziók befagyasztva maradnak.

## 23.1. Amit nem szabad csinálni

Nem javasolt:

- új kötelező mezők hozzáadása a meglévő közös `narrativePlanSchema`-hoz úgy, hogy a v1–v8 output is azzal parse-olódjon;
- a `fictionAuthorResultSchema` jelentésének in-place átírása;
- v8 promptok szerkesztése új verzió nélkül;
- v8 artifact új jelentéssel történő parse-olása;
- recovery során régi artifact „felupgrade-elése”.

## 23.2. Javasolt minta

Illustratív:

```text
life_fiction_plan.v9
life_fiction_author.v9
life_fiction_plan_review.v9
life_fiction_editor.v8
qualityPolicy 2.8.0
```

A név/verzió csak példa.

A lényeg:

**új snapshot.**

V8 marad változatlan.

Új queue-job kapja az új policyt.

Régi queue/job/artifact a saját frozen policyját használja.

---

# 24. Artifact verzió: új verzió indokolt lehet

Ha a final artifact strukturálisan kap:

- character delta;
- relationship delta;
- új binding hash;

akkor tisztább lehet:

```text
fiction artifact 2.1.0
```

vagy új discriminated version.

Nem feltétlen kell új `FICTION_MODE`.

A routing churn csökkentése érdekében valószínűleg jobb:

```text
mode = narrative-fiction-v2
```

megtartása, de:

- policy;
- output schema;
- artifact schema

verziózása.

### Döntési szabály

Ha csak opcionális, tisztán policy-bound mezők kerülnek az artifactba és a parser egyértelműen tud diskriminálni, maradhat közös storage-family.

Ha a recovery/binding jelentés is lényegesen változik, legyen külön artifact version.

---

# 25. Request hashing és retry

Minden új projectionnek része kell legyen a requestnek.

Ez azt jelenti:

```text
hash(planner request)
```

tartalmazza:

- characterProjection;
- lifeTextureProjection.

Miért?

Mert különben:

1. ugyanaz a cached output érvényesnek tűnhet eltérő karakterállapot mellett;
2. retry nem ugyanarra az inputra történik;
3. checkpoint recovery megsérül.

A jelenlegi hash-bound request architecture ezt jól támogatja.

---

# 26. Fork

Ez az egyik legerősebb érv az artifact-fold mellett.

Jelenlegi helyes szemantika:

```text
shared prefix
          / \
         /   \
     branch A branch B
```

Az új karakterállapotnak:

- a fork előtti prefixben egyeznie kell;
- a fork után külön kell diverzifikálódnia.

Ha egy mutable `aw_character_state` táblában tartanánk a „jelenlegi” karaktert, sokkal nehezebb lenne branch-safe módon kezelni.

Artifact fold esetén:

```text
character state =
fold(branch owned artifact prefix)
```

természetesen megoldja.

### Kötelező teszt

Ugyanaz a prefix:

- azonos character state;
- azonos projection.

Eltérő választás után:

- eltérő dynamic state;
- közös stable profile;
- nincs cross-branch bleed.

---

# 27. Recovery

A v8 egyik fontos értéke a recovery discipline.

Az új policy esetén:

- a promptverziót;
- output schemát;
- artifactverziót;
- karakterdelta-verziót

a recovery runtime-nak is ismernie kell.

Ez különösen fontos azért, mert a jelenlegi N09 fejlesztés éppen a funded-runtime upgrade/recovery policy-inventory körül dolgozik.

### Operatív következtetés

Az új storytelling policyt **nem szabad úgy production közelébe vinni**, hogy a Linux recovery path csak v1–v8-at ismeri.

Két tiszta sorrend létezik:

1. N09 lezárása → új fiction verzió → N09 inventory frissítés;
2. új fiction verzió fejlesztési ágon → N09 ág rebase + explicit új policy coverage.

De:

> a storytelling feature merge-je önmagában nem production apply engedély.

---

# 28. Privacy és Shared

A karaktermodell privacy szempontból érzékenyebb, mint a jelenlegi actor role.

Különösen kerülendő:

- valódi személy „pszichológiai profiljának” kialakítása;
- diagnosztikus címke;
- politikai/vallási/egészségügyi extrapoláció;
- szexuális/private-life extrapoláció;
- valódi személy off-screen magánéletének kitalálása.

### Kötelező validációs elv

```text
invented fictional actor
→ lehet gazdag karakterprofil

supplied real actor
→ csak user-supplied + on-branch interaction-safe state
```

A Shared identitás különösen ne kapjon automatikusan „hidden personality”-t.

---

# 29. Költség-audit

## 29.1. A legfontosabb költségkockázat nem feltétlen a hívásszám

Ha megtartjuk az 5 normál hívást, attól még nőhet:

- input token;
- output token;
- repair rate;
- latency.

Ezért a „nem adunk hozzá API-hívást” önmagában nem elég.

## 29.2. Meglévő request-envelope tesztinfrastruktúra

A repó már explicit mér request byte-okat.

Forrás:

`tests/fiction-v6-request-bytes.test.ts`

Korábbi mért fejlesztési envelope:

```text
normal: 86,889 guarded byte
repair: 108,751 guarded byte
```

Creative evaluation cap:

```text
196,608 byte
```

Legacy/default:

```text
100,000 byte
```

### Fontos

A 192 KiB cap **biztonsági plafon, nem célérték**.

Nem szabad azt mondani:

> „van még 100 KiB, töltsük ki.”

Az új projection célja néhány kompakt KiB, nem tízezrek.

A pontos budgetet a tényleges v9 request serializálása után kell meghatározni.

---

# 30. Latency

A kanonikus státuszban a legutóbbi hosszú mérés elfogadott fejezeteire:

```text
P50: 361,067 ms
P95: 852,171 ms
```

Ez már eleve jelentős.

Ez további érv amellett, hogy:

**ne legyen automatikusan új AI-pass.**

A karakterállapot-fold és projection szerveroldali determinisztikus művelet legyen, amely gyakorlatilag elhanyagolható az LLM latencyhez képest.

---

# 31. Repair rate kockázat

Az új state több dolgot jelent, amit az author megsérthet:

- karakter személyisége;
- character current aim;
- relationship state;
- canon;
- StoryFact;
- typed state;
- user boundary.

Ha mindent rögtön hard gate-té teszünk, könnyen:

```text
több repair
→ több token
→ több latency
→ több 9-call ceiling failure
```

## 31.1. Javasolt kettős modell

### Hard gate azonnal

- actor ID/provenance;
- branch ownership;
- supplied-person privacy;
- impossible state reference;
- removed actor használata;
- character delta schema;
- cross-branch mismatch;
- durable fact mismatch.

### Első körben diagnostic

- NPC túl funkcionális;
- kevés embodiment;
- túl tiszta párbeszéd;
- alacsony emotional friction;
- túl nagy narratív fegyelmezettség.

Ezeket először:

- editor report;
- offline audit;
- human rating

szinten mérjük.

Csak az váljon hard repair gate-té, amiről kiderül, hogy:

- jól mérhető;
- valóban korrelál emberi minőséggel;
- nem robbantja a repair rate-et.

---

# 32. A human evaluation harness már meglepően jól elő van készítve

Forrás:

`scripts/lib/narrative-evaluation-contract.ts`

A hosszú sorozat human rating már tartalmazza:

- `humanProse`
- `immersion`
- `continuationDesire`
- `npcAutonomy`
- `protagonistHumanity`
- `structuralVariety`
- `emotionalRange`
- `systemInvisibility`
- `continuity`

Ez nagyon fontos.

A mostani Reddit-visszajelzés **nem idegen a rendszer minőségmodelljétől**.

Külön human kérdés már most is van:

> Did NPCs retain own lives?

Ez azt jelenti, hogy a mérési infrastruktúra alapja már megvan.

---

# 33. Mit kell hozzáadni az emberi értékeléshez?

A következő verzióban explicit kérdéseket javaslok:

1. Úgy érezted, hogy a visszatérő szereplők a főszereplőtől függetlenül is léteznek?
2. Volt olyan szereplő, aki saját problémát/célt hozott egy jelenetbe?
3. Volt olyan beszélgetés, amely nem maradt tökéletesen a protagonist aktuális projektjén?
4. A szereplők néha félreértették egymást anélkül, hogy a jelenet azonnal kijavította volna?
5. A fizikai környezet, idő, fáradtság, pénz vagy hétköznapi kötelezettség természetesen befolyásolta az eseményeket?
6. A protagonist érzelmi tétje érthető volt anélkül, hogy a narrátor túlmagyarázta volna?
7. A csendes jelenetek élőnek vagy sterilnek érződtek?
8. A nagyobb konfliktus nélkül is volt mozgás?
9. Éreztél mesterséges melodrámát?
10. Olvasnád-e tovább?

Az embodimentet érdemes külön dimenzióként vagy külön auditkérdésként mérni.

---

# 34. Ne a Reddit-kommentből csináljunk új prompttemplate-et

Ez fontos.

Egyetlen jó emberi kritika erős diagnosztikai jel, de nem specifikáció.

Ha közvetlenül ezekből készül:

```text
every chapter needs:
- more tension
- more physical details
- more messy conversation
- more independent NPC life
```

akkor hamar létrejön az új LLM-template:

```text
fáradt NPC
+ félbeszakított beszélgetés
+ pénzgond
+ fizikai kényelmetlenség
+ kis vita
```

és néhány fejezet múlva ugyanolyan ismétlődő lesz.

### Helyes használat

A kritika megmondja, **milyen hiányzó reprezentációt** kell beépíteni.

Nem azt, hogy minden fejezetben milyen jelenet legyen.

---

# 35. A dramaturgia és a szimuláció helyes viszonya

Az egyik legfontosabb tervezési elv:

> **A világ és a szereplők állapota korlátozza és inspirálja a történetet, de nem írja meg helyette a történetet.**

A planner továbbra is dramaturgiai planner.

Viszont ne nulláról találja ki, hogy egy szereplő mire jó.

Kapja meg:

```text
ki ő
mit akar
mi foglalkoztatja
mit vár a protagonisttól
mi maradt köztük
milyen életnyomás alatt van
```

és ezekből válasszon olyan találkozást, amely:

- okszerű;
- érdekes;
- aktuális;
- nem teljesen kiszolgálja a főhőst.

---

# 36. „Narrative function” probléma technikai kezelése

A Reddit-mondat:

> people really fulfill their narrative functions

nem oldható meg pusztán azzal, hogy több traitet adunk.

A kritikus pont az, **mikor keletkezik a karakter saját állapota**.

Ha a planner előbb eldönti:

> szükségem van valakire, aki megmondja a protagonistnak, hogy túlmagyaráz

és csak utána gyárt hozzá:

```text
independent
direct
impatient
```

személyiséget, akkor semmi nem változott.

## Javasolt sorrend

```text
existing character profile/state
          ↓
existing world/life pressure
          ↓
protagonist current goal
          ↓
possible collisions
          ↓
scene selection
```

Ezért a persistent profile értéke sokkal nagyobb, mint egy fejezeten belüli ad hoc „personality”.

---

# 37. Új fiktív szereplő létrehozása

Új recurring actor esetén az author/planner ugyanabban a package-ben létrehozhat:

```text
actor_add
+
characterProfile_add
```

A validátor kikényszerítheti:

- actorId egyezés;
- origin event egyezés;
- invented origin;
- egyedi actor;
- rövid profile;
- legalább egy `independentConcern`, ami nem üres.

De nem lehet egyszerű regexszel bizonyítani, hogy az independent concern valóban független.

Ezt az editor/human evaluationnak kell mérnie.

---

# 38. Szereplő távozása

A v8 már támogat:

```text
actor_remove
```

fiktív actor esetén.

Ez jó alap.

Az új character-state foldnak:

- ugyanazon eseményig engednie kell a karaktert;
- utána inactive/archived státuszba kell tenni;
- később ne kerüljön current projectionbe;
- historical reference továbbra is legyen olvasható.

Nem kell törölni a profile történetét.

---

# 39. Off-screen élet

Ez kényes terület.

Ahhoz, hogy egy karakter „éljen”, nem feltétlen kell minden periódusban off-screen eseményt generálni.

Sőt, az drága és zajos lenne.

## Javaslat

Az invented actor rendelkezzen:

```text
independentConcern
currentAim
currentPressure
```

amely több perióduson át élhet.

Off-screen update csak akkor:

- releváns;
- okszerű;
- vagy visszatérésekor szükséges.

Nem kell:

> „hat hónap telt el, ezért minden 12 NPC kapjon új életfejleményt.”

Ez teljes simulation explosion lenne.

---

# 40. „Világ mozog” érzés alacsony költséggel

Ehhez nem kell globális simulation.

Néhány jó mechanizmus:

- existing opportunity lejár;
- munkahelyi folyamat változik;
- recurring place bezár / változik;
- másik actor elérhetősége változik;
- relationship expectation eltolódik;
- tárgy elhasználódik;
- schedule összeütközik;
- egy earlier promise visszajön;
- cost/time constraint egyszer tényleges következményt okoz.

Ezek jelentős része már ma is modellezhető a meglévő event/StoryFact rendszerrel.

A hiány inkább az, hogy **a planner ezekből túl gyakran rendez tiszta, protagonist-központú jelenetet**.

---

# 41. Promptstratégia

Az új prompt ne nőjön korlátlan rulebookká.

V8 már hosszú és sok anti-pattern szabályt hordoz.

Ha minden új emberi kritikára 500 token új prompt kerül, az:

- növeli költséget;
- növeli modellterhelést;
- konfliktust okoz az instrukciók között;
- „compliance-writing” hatást hozhat.

## Javaslat

A szabályok egy részét **strukturált inputba kell áttenni**.

Kevesebb:

> „Characters should have independent lives.”

Több:

```json
{
  "actorId": "...",
  "currentAim": "...",
  "independentConcern": "...",
  "unresolvedMatter": "..."
}
```

És rövid prompt:

> Respect supplied character state. Do not repurpose it solely to solve the protagonist's current problem.

Ez jobb.

---

# 42. Editor stratégia

A machine editor következő verziójában külön diagnosztikát lehet hozzáadni.

Példák:

```text
npcFunctionalization
interactionOverControl
embodimentThin
emotionalStakeOpaque
```

De első körben nem mind hard gate.

### Jó machine evidence

- ugyanaz az NPC 5 megjelenésből 5-ször feedbacket ad;
- minden private-life scene a protagonist projektről szól;
- az NPC ownAim egyetlen scene-ben sem jelenik meg;
- relationship unresolved state eltűnik;
- character profile konfliktusa ellenére identikusan viselkedik.

### Nehéz machine evidence

- „ez elég emberi-e?”
- „elég messy-e?”
- „jó-e a tension?”

Ezekben a human review fontosabb.

---

# 43. Determinisztikus audit lehetősége

A v8 series-ledger megközelítés tovább bővíthető olyan **diagnosztikai** számlálókkal, amelyek nem generálnak történetet.

Például:

```text
npcRoleUsage:
- chapters present
- chapters where actor's action directly serves protagonist goal
- chapters where own concern is referenced

conversationFocus:
- protagonist-goal-only scene count

embodiment markers:
- physical action / environmental constraint density
```

De ezekkel óvatosan.

Ha ezekből kvótát csinálunk:

> every 2 chapters NPC must discuss own life

azonnal mechanikus lesz.

Ezért:

**evidence, nem schedule.**

Pont úgy, ahogy a v8 series ledger.

---

# 44. Konkrét file-szintű implementációs terv

Az alábbi nem végleges ticketlista, hanem auditból következő gyakorlati bontás.

## 44.1. Contracts

### `packages/contracts/src/fiction.ts`

Új policy snapshot:

- új planner version;
- új author version;
- új reviewer version;
- új editor version;
- új quality policy.

Ne módosítsuk visszamenőleg v8 jelentését.

### Javasolt új file

`packages/contracts/src/fiction-character.ts`

Tartalom:

- stable fictional character profile schema;
- dynamic character state schema;
- relationship narrative state schema;
- character delta;
- character projection;
- provenance enum;
- byte bounds.

Miért külön file?

Mert a `fiction.ts` már nagy, és a semantics külön domain.

---

# 45. Core

Javasolt:

`packages/core/src/fiction-character.ts`

Feladata:

- validate character profile;
- apply character delta;
- fold;
- select projection;
- validate actor origin;
- validate removed actor;
- validate supplied-vs-invented privacy;
- deterministic ordering;
- hash-stable output.

### `packages/core/src/narrative-requests.ts`

Policy-gated:

```text
if qualityPolicy >= new version:
  include characterProjection
  include lifeTextureProjection
```

A v8 request byte-for-byte maradjon változatlan.

---

# 46. Database

### `packages/database/src/fiction-memory.ts`

Bővítés:

- historical new artifact character deltas foldolása;
- projection builder hívása;
- withheld eset kezelése;
- fork prefix ugyanaz.

Nem javasolt új mutable current-state tábla az első verzióban.

### Előny

Ha egy period commit nem történik meg:

- character state sem történik meg.

Pontosan ugyanaz az atomic semantics, mint a történetnél.

---

# 47. AI layer

### `packages/ai/src/fiction-prompts.ts`

Új v9-szerű prompt:

- v8 frozen marad;
- új delta hozzáadódik az új policyhoz.

### `packages/ai/src/index.ts`

Az output parsernek a policy alapján:

- régi `FictionAuthorResult`;
- új enriched result

sémát kell választania.

Ezt úgy kell megoldani, hogy:

- v8 path ne változzon;
- max output token első körben csak mérés alapján változzon.

---

# 48. Worker

### `apps/worker/src/fiction-processor.ts`

A kívánt cél:

**ugyanaz a stage graph maradjon.**

```text
plan
author
review
fidelity
editor
```

Új policy esetén csak a typed result és validator legyen gazdagabb.

Ne legyen:

```text
simulate_people
```

külön funded stage az első verzióban.

---

# 49. Commit

Az atomikus commitnak együtt kell mentenie:

- final candidate;
- chapter;
- final story facts;
- final character delta;
- final relationship delta;
- proof bindings.

Ha bármelyik invalid:

**semmi ne kerüljön canonical historyba.**

---

# 50. V8 backward compatibility

Kötelező regresszió:

1. `fictionV8Policy()` ugyanazt adja.
2. v8 prompt hash nem változik.
3. v8 request shape nem változik.
4. v8 artifact parse változatlan.
5. v8 recovery változatlan.
6. v8 fixtures változatlanul átmennek.
7. v8 paid corpus offline audit ugyanazt adja.
8. régi artifactból új policy indításakor character state üres bootstrapból indul, nem hamis „rekonstruált pszichológiából”.

Ez utóbbi fontos.

Nem szabad a régi prózából visszamenőleg pszichológiai profilokat „kibányászni” és tényként beírni.

---

# 51. Bootstrap v8 → új verzió

Ha egy már futó v8 life később új policyt kap:

### Biztonságos bootstrap

- existing fictionalActors `role/desire/resistance/voiceCue` felhasználható mint legacy seed;
- provenance legyen `legacy_narrative_memory`;
- új mezők lehetnek null/unknown;
- csak jövőbeli történet tölti fel őket.

Nem javasolt:

> LLM olvassa el az előző nyolc fejezetet és készítsen utólag teljes személyiséget.

Ez:

- új költség;
- új rejtett inference;
- nem reprodukálható ugyanúgy;
- privacy kérdés;
- canon reinterpretation.

---

# 52. Tesztstratégia

## 52.1. Unit

### Contract

- max lengths;
- byte caps;
- origin type;
- forbidden supplied-person fields;
- duplicate actor;
- missing actor;
- actor remove.

### Fold

- add;
- update;
- no-op;
- remove;
- same prefix;
- fork divergence;
- replay determinism.

### Projection

- stable ordering;
- byte bound;
- unresolved actor priority;
- irrelevant actor dropped;
- withheld behavior.

---

# 53. Core negative controls

Különösen fontos a Reddit-probléma reprodukálása.

Szintetikus rossz történetek:

### A. Functional feedback NPC

Minden alkalommal:

> NPC reads work → gives one useful criticism → protagonist changes.

A machine auditnak legalább diagnosztikailag fel kell ismernie.

### B. Perfect topical discipline

Minden baráti beszélgetés 100%-ban a protagonist aktuális projektjéről szól.

### C. Instant emotional resolution

NPC konfliktus → 2 bekezdés → kölcsönös megértés.

### D. Personality ignored

Profile:

> avoids long abstract discussion

story:

> gives a long nuanced workshop-style interpretation.

### E. Forced messiness

Minden jelenetben:

- valaki késik;
- valami eltörik;
- vita van.

Ezt is rossznak kell tekinteni.

### F. Forced embodiment

Minden fejezetben testi kellemetlenség.

### G. Melodrama regression

Apró művészeti probléma → identitásválság / nagy veszekedés.

---

# 54. Worker/recovery tesztek

Kötelező:

- normal 5 calls;
- one repair;
- max 9;
- retry after planner;
- retry after author;
- retry after editor;
- stale checkpoint;
- hash mismatch;
- character projection mismatch;
- old v8 job resume;
- new job resume;
- artifact replay.

A character state soha ne commitolódjon félig.

---

# 55. Request-byte regresszió

A jelenlegi `fiction-v6-request-bytes.test.ts` mintájára új:

`fiction-v9-request-bytes.test.ts`

Mérje:

- planner normal;
- author normal;
- review;
- fidelity;
- editor;
- package repair worst case.

Külön:

- 1 actor;
- 4 relevant actors;
- projection max;
- story fact max;
- near-limit memory.

A byte-budgetet a mért adatok alapján kell véglegesíteni.

---

# 56. Artifact-byte regresszió

Worst-case:

- 3 new actors;
- 3 profile adds;
- dynamic updates;
- relationship updates;
- max story facts;
- long plan;
- long chapter metadata;
- report.

Ha 32 KiB-be nem fér:

előbb:

1. compact fields;
2. delta csökkentés;
3. redundant mezők kivétele.

Csak utána merüljön fel artifact cap emelése.

---

# 57. Human A/B benchmark

A helyes benchmark:

```text
v8
vs
new candidate
```

ugyanazzal:

- input profile;
- initial state;
- choice mapping;
- horizon;
- model;
- temperature/config;
- evaluation procedure.

Minimum:

- 6–8 fejezetes main sequence;
- fork;
- több profil.

A 3 fejezet kevés a „whole person” hatás mérésére.

---

# 58. Mit kell mérni a minőség mellett?

## Stabilitás

- accepted rate;
- hard failure;
- schema failure;
- fidelity failure;
- repair rate;
- recovery success.

## Gazdaságosság

- input token;
- output token;
- cost/chapter;
- cost/accepted chapter;
- request count;
- repair cost.

## Latency

- P50;
- P95.

## Minőség

- immersion;
- continuation desire;
- NPC autonomy;
- protagonist humanity;
- emotional range;
- structural variety;
- embodiment;
- perceived AI-ness;
- generic drama;
- continuity.

---

# 59. Javasolt go/no-go kapuk

Ezek audit-ajánlások, nem jelenlegi projektpolicy.

## 59.1. Hard architecture gates

A candidate nem léphet tovább, ha:

- v8 frozen regression sérül;
- max request count nő;
- max repair nő;
- új normál AI stage kerül be;
- cross-branch leakage van;
- supplied person privacy sérül;
- recovery nem exact;
- artifact nem reprodukálható;
- old v8 job nem resume-olható.

---

# 60. Költségkapu

A toleranciát **paid futás előtt** kell meghatározni.

Javaslat első méréshez:

```text
accepted cost/chapter:
v8 baseline + legfeljebb előre elfogadott tolerancia
```

Én 10–15% körüli vizsgálati sávot tartanék ésszerű kezdőpontnak, de ezt tulajdonosi termékdöntésként kell rögzíteni.

Nem szabad utólag azt mondani:

> „20%-kal drágább, de azért jó.”

A limit előre legyen.

---

# 61. Repair kapu

Ugyanez repair rate-re.

Az új rendszer értelmetlen, ha jobb a karakter, de:

- minden második fejezet repair;
- gyakran eléri a 9 call capet.

A megengedett regressziót előre kell rögzíteni.

---

# 62. Minőségkapu

A fő cél nem pusztán:

> machine editor score >= 4.

A v8 emberi feedback éppen azt mutatja, hogy magas machine score mellett is maradhat hosszú távú steril dinamika.

Ezért legalább:

- `npcAutonomy` ne romoljon;
- `continuationDesire` javuljon vagy maradjon;
- `immersion` ne romoljon;
- `emotionalRange` javuljon;
- új embodiment/whole-person human kérdések pozitív elmozdulást mutassanak;
- ne nőjön a melodráma.

---

# 63. Ajánlott fejlesztési fázisok

## Fázis 0 — v8 baseline freeze

Mielőtt kódot módosítunk:

- exact SHA;
- prompt hashes;
- policy;
- corpus;
- request metrics;
- repair metrics;
- cost;
- latency;
- accepted chapters;
- current tests

mentése.

A jelen auditált SHA:

```text
a666c905ef953cc696d5d8a0faa4f9169ec01824
```

---

## Fázis 1 — Contract-only

Még nincs új model behavior.

Implementálni:

- character profile schema;
- dynamic state;
- relationship state;
- delta;
- projection;
- provenance;
- byte cap;
- artifact next schema.

Unit tesztek.

---

## Fázis 2 — Fold és projection

Implementálni:

```text
history artifacts
→ character state fold
→ relevant projection
```

Teszt:

- deterministic;
- fork-safe;
- privacy-safe;
- bounded.

Még nincs paid generálás.

---

## Fázis 3 — Új fiction policy

Új:

- planner;
- author;
- reviewer;
- editor;
- quality policy.

Ugyanaz:

- fidelity alapelv;
- worker stage graph;
- 9 max calls;
- 1 repair.

---

## Fázis 4 — Offline negative-control teszt

A fenti funkcionális NPC / forced messiness / melodráma mintákkal.

Cél:

- ne csak „több konfliktus” legyen.

---

## Fázis 5 — Codex/offline diagnostic

Meglévő harness.

Nem emberi proof.

Cél:

- schema;
- continuity;
- character-state compliance;
- request size;
- obvious regression.

---

## Fázis 6 — Blinded human sequence test

V8 vs candidate.

Első valódi bizonyíték arra, hogy:

> a karakterek egész embernek érződnek-e.

---

## Fázis 7 — Paid full measurement

Csak explicit költségengedéllyel.

Mérni:

- cost;
- latency;
- requests;
- repair;
- acceptance;
- quality.

---

## Fázis 8 — N09 / runtime rollout proof

Csak azután production candidate.

---

# 64. Javasolt PR-bontás

## PR A — Contracts + fold, behavior nélkül

Alacsony kockázat.

- schemas;
- validators;
- fold;
- projection;
- tests.

## PR B — New policy + request/output integration

- AI schemas;
- prompts;
- request builders;
- worker typed path.

## PR C — Quality diagnostics

- editor;
- audit;
- negative controls;
- human questionnaire extension.

## PR D — Evaluation evidence

- no product behavior changes;
- stored corpus;
- reports.

## PR E — Release/recovery

- N09 inventory;
- operator compatibility;
- rollout.

Ez jobb, mint egy gigantikus feature PR.

---

# 65. Kockázati mátrix

| Kockázat | Valószínűség naiv megoldásnál | Hatás | Mitigáció |
|---|---:|---:|---|
| V8 schema kompatibilitás törik | magas | kritikus | új policy/schema, frozen v8 |
| Token/memory bloat | magas | magas | bounded projection, artifact delta |
| Repair rate megugrik | közepes–magas | magas | structural hard gate, literary diagnostic first |
| NPC továbbra is plot device | magas | magas | persistent pre-scene state |
| NPC túl merev lesz | közepes | magas | rövid behavioral cues, nem RPG stats |
| Melodráma visszajön | közepes | magas | anti-melodrama human + editor control |
| „Messiness template” alakul ki | magas | közepes | nincs kvóta, evidence not schedule |
| Supplied real person privacy sérül | közepes | kritikus | provenance + külön schema/validator |
| Cross-branch character bleed | közepes | kritikus | artifact-prefix fold |
| Recovery nem ismeri új policyt | magas rolloutnál | kritikus | N09 explicit coverage |
| Cost nő extra call nélkül is | közepes | magas | request/token/cost gate |
| Latency nő | közepes | magas | no sixth pass; measure P50/P95 |
| World simulation elnyomja plotot | közepes | magas | dramaturgical selection layer |
| Planner prompt túl hosszú lesz | magas | közepes | structured projection, rövid szabály |
| Human quality nem javul | közepes | magas | v8 A/B, human sequence evidence |
| Régi v8 sorozatból hamis personality inference | közepes | magas | empty/legacy seed, nincs retroactive profiling |

---

# 66. Alternatívák, amelyeket az audit nem javasol

## 66.1. Csak prompttuning

**Nem elég.**

A jelenlegi prompt már explicit kéri az autonóm emberi viselkedést, mégis fennmaradt a probléma.

---

## 66.2. Teljes multi-agent NPC simulation

Minden fontos szereplő külön agentként gondolkodik.

**Nem javasolt most.**

Miért?

- call explosion;
- latency;
- state coordination;
- cost;
- privacy;
- recovery;
- nondeterminism.

Lehet későbbi kutatási irány, de nem következő production architecture.

---

## 66.3. Egy extra „world builder” LLM minden fejezet előtt

Nem indokolt első lépés.

Ha ugyanaz az információ strukturált state-ből és plannerből megoldható, csak költséget és hibafelületet növel.

---

## 66.4. Nagy personality blob minden actorhoz

Nem javasolt.

Az LLM elkezdi felmondani és dramatizálni a karakterlapot.

---

## 66.5. Numeric relationship simulator

Nem javasolt első verzióban.

A `trust=73` típusú modell túl sok hamis precizitást és game-design mellékhatást visz be.

---

# 67. Mi maradjon a v8-ból változatlanul?

Ez az audit egyik legfontosabb része.

## Kötelezően megőrzendő

- Life V2 canonical typed state;
- deterministic state replay;
- author-final-canon modell;
- StoryFact provenance;
- owned history prefix;
- branch/revision check;
- privacy withholding;
- hash-bound requests;
- checkpoint recovery;
- atomic period commit;
- max 9 physical requests;
- max 1 content repair;
- old frozen policyk;
- deterministic series evidence filozófia;
- offline audit;
- explicit paid budget guard;
- human evidence különválasztása diagnostic AI-tól.

A fejlesztés ezekre épüljön.

Ne ezek helyett készüljön.

---

# 68. Hol kell viszont érdemben változtatni?

Nem csak kozmetikai módosítás kell.

## A. Character representation

Jelenlegi:

```text
role
desire
resistance
voiceCue
```

→ új:

```text
stable behavioral profile
+
current independent state
+
relationship state
```

## B. Planner input

A karaktert ne az aktuális scene funkciójából találja ki.

## C. Planner output

Explicit legyen, hogy az NPC mit akar a saját oldaláról.

## D. Author final package

A character-state változás a final canon csomag része legyen.

## E. Memory reconstruction

Artifact fold.

## F. Evaluation

Whole-person + embodiment human evidence.

Ez valódi architekturális fejlesztés.

---

# 69. A történetépítési folyamat javasolt végleges modellje

A korábbi felvetés kritikus átdolgozása:

## 1. Canonical reality

A protagonist kiinduló élete és elfogadott branch state.

## 2. Persistent cast

Az emberek, akik már léteznek.

Mindegyiknek csak annyi tartós belső struktúrája van, amennyi viselkedést okoz.

## 3. Living context

Mi foglalkoztatja őket most?

Milyen kapcsolatban vannak a protagonisttal?

## 4. Environmental pressure

Idő, pénz, munka, hely, rutin, opportunity, artifact, korábbi ígéret.

## 5. Collision generation

Mely állapotok találkozhatnak?

## 6. Dramaturgical selection

Melyikből lesz olvasásra érdemes fejezet?

## 7. Authoring

A prose szabadon megírja.

## 8. Validation

Canon, privacy, character consistency, quality.

## 9. Commit

Csak a validált final package lesz igaz a branchen.

Ez szerintem az Alterwardhoz helyes narratív architektúra.

---

# 70. Kritikai megjegyzés: a „valódi személyiség” önmagában nem old meg mindent

Fontos nem túlbecsülni a karaktermodellt.

Egy kiváló personality state mellett is lehet unalmas történet.

Miért?

Mert ha a planner mindig:

- craft meetinget;
- feedbacket;
- kis félreértést;
- finom korrekciót

választ, akkor a szereplők csak **hitelesebben** fogják ugyanazt csinálni.

Ezért a fejlesztésnek egyszerre kell javítania:

1. character autonomy;
2. life/world intrusion;
3. emotional stakes;
4. event selection;
5. dramaturgiai amplitúdó.

Nem feltétlen nagyobb drámát.

Nagyobb **változatosságot abban, hogy mi számít egy fejezetben problémának**.

---

# 71. Kritikai megjegyzés: a világ nem lehet puszta „zaj”

A másik véglet:

> tegyünk be sok hétköznapi eseményt, és majd életszerű lesz.

Nem.

Ha a fejezet tele van:

- buszkéséssel;
- bevásárlással;
- időjárással;
- random beszélgetéssel;

de ezek semmilyen feszültséget, döntést vagy karaktermozgást nem okoznak, akkor csak hígítják a történetet.

Ezért:

> a világ legyen független, de a narrátor legyen szelektív.

---

# 72. Kritikai megjegyzés: az autonóm NPC néha rontja a protagonist történetét — és ez jó

Ha Nessa saját ember, néha:

- nem ad feedbacket;
- félbeszakítja a témát;
- nemet mond;
- mást akar csinálni;
- nem érti;
- nem akarja megbeszélni.

Ez rövid távon „kevésbé efficient” jelenet.

De éppen ettől lehet:

- hiteles;
- érzelmileg érdekes;
- később fontos.

A plannernek ezt engednie kell.

Ugyanakkor a dramaturgiai rétegnek biztosítania kell, hogy a fejezet egésze ne váljon céltalanná.

---

# 73. Auditált megvalósíthatósági döntés

## GO — feltételekkel

A fejlesztés megvalósítható.

**Nem látok a jelenlegi kódban olyan alapvető architekturális akadályt, amely miatt az autonómabb karakter- és életszerűbb világmodell csak a v8 stabilitásának feladásával lenne megoldható.**

Sőt, több jelenlegi tervezési döntés kifejezetten támogatja:

- artifact-based memory;
- versioned policies;
- deterministic projections;
- typed canon;
- final author package;
- branch-scoped history;
- request hashing;
- bounded memory;
- explicit quality harness.

## De a GO nem „low risk”

A fejlesztés hibás megvalósítása könnyen:

- megduplázhatja a narratív state-et;
- túlterhelheti a contextet;
- növelheti a repairt;
- törheti a recoveryt;
- privacy problémát okozhat;
- vagy új template-et hozhat létre.

Ezért **külön architekturális feature-ként** kell kezelni.

---

# 74. Ajánlott termék/engineering döntés

A következő történetmotor-verzió fő célját így fogalmaznám:

> **Preserve v8's bounded, deterministic fiction pipeline while giving recurring characters persistent independent state and giving each period a bounded projection of the protagonist's wider lived world, so scenes emerge from collisions between people and circumstances rather than assigning people a narrative function.**

Magyarul:

> **A v8 determinisztikus és költségkorlátos gerincének megtartása mellett a visszatérő szereplők kapjanak tartós, saját viselkedést okozó állapotot, a planner pedig kapjon egy korlátozott képet a protagonist tágabb élethelyzetéről, hogy a jelenetek emberek és körülmények ütközéséből szülessenek, ne pedig szereplőkhöz rendelt narratív funkciókból.**

---

# 75. Konkrét „Definition of Done”

A fejlesztés akkor tekinthető technikailag késznek, ha:

- [ ] új policy verzió létezik;
- [ ] v8 változatlan marad;
- [ ] fiktív actor stable profile létezik;
- [ ] dynamic state létezik;
- [ ] relationship state létezik;
- [ ] supplied actor privacy külön validált;
- [ ] state immutable artifactból foldolható;
- [ ] fork-safe;
- [ ] bounded projection;
- [ ] withheld-safe;
- [ ] request hash tartalmazza;
- [ ] final author package tartalmaz delta-t;
- [ ] atomic commit;
- [ ] worker normál path továbbra is 5 AI-stage;
- [ ] max 9 physical requests;
- [ ] max 1 repair;
- [ ] request byte regression teszt;
- [ ] artifact byte regression teszt;
- [ ] old v8 recovery teszt;
- [ ] new recovery teszt;
- [ ] negative controls;
- [ ] human whole-person evaluation;
- [ ] paid cost/latency measurement külön engedéllyel.

---

# 76. Mit nem bizonyított ez az audit?

Ez a dokumentum statikus forrásaudit.

Nem bizonyítja, hogy:

- az új prompt biztosan jobb történetet fog írni;
- a költség biztosan változatlan;
- a request méret biztosan egy adott számon marad;
- a repair rate biztosan nem nő;
- a latency biztosan nem nő;
- az emberi preferencia biztosan javul.

Ezekhez implementáció és mérés kell.

Amit az audit bizonyít:

> **A jelenlegi architektúra rendelkezik azokkal a megfelelő extension pointokkal és védelmi rétegekkel, amelyek mellett a fejlesztés kontrolláltan megvalósítható, anélkül hogy a v8 gerincét fel kellene áldozni.**

---

# 77. Végső ajánlás

**A fejlesztést érdemes elindítani.**

De a következő elv alapján:

> **Ne a v8-at „okosítsuk fel” in-place. Készítsünk egy új, explicit policy-generációt, amely a v8 invariánsait örökli, és csak a hiányzó karakter-/életvilág reprezentációt adja hozzá.**

Első körben:

- ne legyen új modell;
- ne legyen új funded stage;
- ne legyen extra repair;
- ne legyen teljes world simulator;
- ne legyen új mutable character DB;
- ne legyen v8 schema mutation.

Legyen:

- új compact character state;
- artifact delta;
- deterministic fold;
- bounded projection;
- planner/author integration;
- privacy-aware validation;
- human A/B proof.

Ez a legjobb esély arra, hogy az Alterward következő lépcsője ne egyszerűen „jobb AI-próza” legyen, hanem valóban:

> **egy olyan alternatív élet, amelyben a többi ember nem azért létezik, mert a történetnek éppen szüksége van rájuk.**

---

# Függelék A — auditált főbb források

## Contracts

- `packages/contracts/src/life-v2.ts`
- `packages/contracts/src/narrative.ts`
- `packages/contracts/src/fiction.ts`

## Core

- `packages/core/src/life-v2.ts`
- `packages/core/src/narrative.ts`
- `packages/core/src/fiction.ts`
- `packages/core/src/fiction-series.ts`
- `packages/core/src/fiction-casting.ts`
- `packages/core/src/narrative-requests.ts`
- `packages/core/src/narrative-runtime.ts`

## AI

- `packages/ai/src/index.ts`
- `packages/ai/src/fiction-prompts.ts`

## Database

- `packages/database/src/fiction-memory.ts`
- `packages/database/src/narrative-memory.ts`
- `packages/database/src/narrative-artifact.ts`
- `packages/database/src/life-jobs.ts`

## Worker

- `apps/worker/src/fiction-processor.ts`
- `apps/worker/src/life-processor.ts`

## Tests / evaluation

- `tests/fiction-v8-candidate.test.ts`
- `tests/fiction-v7-candidate.test.ts`
- `tests/fiction-v6-request-bytes.test.ts`
- `tests/fiction-human-evaluation.test.ts`
- `tests/fiction-worker.test.ts`
- `tests/narrative-memory.test.ts`
- `tests/narrative-storage.test.ts`
- `tests/life-job-recovery.test.ts`
- `scripts/lib/narrative-evaluation-contract.ts`
- `scripts/lib/narrative-series-audit.ts`

## Docs / current state

- `docs/STATUS_HU.md`
- `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`
- `docs/plans/047_fiction_v8_series_evidence.md`
- N09 / funded-runtime upgrade kapcsolódó dokumentáció

---

# Függelék B — jelenlegi kulcsinvariánsok

```text
FICTION_MODE = narrative-fiction-v2
v8 qualityPolicy = 2.7.0
maxPhysicalRequests = 9
maxContentRepairs = 1
target prose = 650–950 words
Narrative memory = 12 KiB
Narrative artifact = 32 KiB
normal logical AI stages = 5
```

Ezeket a következő verzió tervezésénél baseline-ként kell kezelni.

---

# Függelék C — implementációs döntési lista, a tulajdonos jóváhagyásával

**Státusz: a tulajdonos 2026-10-20-án jóváhagyta** (a projekt szálban, a koordinátor javaslatai alapján; a költségfeltételt a tulajdonos maga szabta). Az élő világ fejlesztése a béta elé került. Ez a lista rögzíti a döntéseket; nem rollout- és nem fizetős futás engedély. Az eredeti, jelöletlen lista az audit szövege volt; a számok kijelölt ideiglenes értékek, amelyeket a 3. fázis mérése után véglegesítünk.

1. [x] **Új policy-generáció.** A v8 befagy, mellé új generáció jön: planner/author/reviewer **v9**, editor **v8**, qualityPolicy **2.8.0**. A v8 nem okosodik in-place; ez tartja visszaállíthatóvá és összevethetővé. A pontos prompt-azonosítók az implementációban rögzülnek (a §23.2 nevei illusztratívak voltak).
2. [x] **Artifact-stratégia.** A meglévő artifact-család marad, opcionális, policy-hoz kötött mezőkkel (§24); ha a parser nem tud egyértelműen diszkriminálni, vagy a recovery/binding jelentése változik, külön artifact-verzió. A 32 KiB limit nem emelkedik automatikusan, előbb compact delta (§17, §56).
3. [x] **Karakterprofil mezői (csak fiktív szereplő):** actorId, originEventId, socialRole, coreWant, independentConcern, conflictStyle, attentionStyle, valueCue[], voiceCue, establishedAtPeriodId (§8.2). Nincs numerikus trait.
4. [x] **Valós/megadott személyek védelme.** Megadott, valós személyhez a modell nem találhat ki magánéleti állapotot (titkos félelem, anyagi gond, trauma, diagnózis, rejtett kapcsolat). Provenance: `user_supplied`, `branch_fiction`, `interaction_derived`; a `branch_fiction` nem válhat privát valós ténnyé (§11, §28). Adatvédelmi határ, nem lazítható.
5. [x] **Dinamikus állapot mezői:** actorId, currentAim, currentPressure, attentionOn, stanceTowardProtagonist, unresolvedMatter, lastMeaningfulChangePeriodId; csak releváns változáskor frissül (§9).
6. [x] **Kapcsolati állapot mezői:** actorId, currentDynamic, expectation, unresolvedInteraction. Nincs számskála (nincs „bizalom = 73") (§10, §66.5).
7. [x] **Projection relevancia:** a §15.3 szerint (szerepel az aktuális candidate-ben, nyitott kapcsolati/konfliktus szál érinti, friss szereplő, rég nem látott magánéleti szereplő, megoldatlan ügy, a protagonist célját vagy aktuális opportunity-t érinti).
8. [x] **Projection felső határa: 8 KiB** (ideiglenes; a 3. fázis tényleges request-bájt mérése után véglegesítjük, §29.2, §55).
9. [x] **Egy fejezetben legfeljebb 6 szereplő állapota frissülhet** (ideiglenes; mérés után véglegesítjük, §15.3, §56).
10. [ ] **V8 baseline hash-ek** — nem döntés, hanem mérési feladat; a 0. fázis (§63) végzi.
11. [x] **Költségtolerancia: fejezetenként legfeljebb +15% a v8 baseline-hoz képest** (kb. 0,37 helyett legfeljebb kb. 0,43 USD), **csak a fejlesztési szakaszra**. A tulajdonos feltétele: ha a helyzet stabil, és a költség tartósan a v8 fölött marad, meg kell vizsgálni az okot és javítani kell, mert különben az előzetes gazdasági terv (0,37 USD/fejezet) borul. Ez **kiadási kritérium / follow-up kapu**: a béta és minden szélesebb kiadás előtt a tartós költségkülönbséget meg kell magyarázni és csökkenteni. A toleranciát paid futás előtt rögzítjük, utólag nem módosítjuk (§60).
12. [x] **Javítási tolerancia:** a javítóköröket kapó fejezetek aránya legfeljebb 10 százalékponttal nőhet a v8-hoz képest, és egyetlen fejezet sem érheti el a 9 hívásos plafont. A v8 pontos arányát a 0. fázis méri ki (§61).
13. [x] **Emberi embodiment-kérdések:** a §33 tíz kérdése, az embodiment külön dimenzióként vagy külön auditkérdésként.
14. [x] **N09-sorrend: (b)** — az új verzió fejlesztési ágon készül, az N09 ág utólag kapja meg az új policy-t (rebase + explicit új policy-coverage). Az új policy nem kerülhet élesbe, amíg a Linux-helyreállítás nem ismeri (§27).
15. [x] **Karakterállapot forrása és az adatbázis-út.** Az első körben a fejezet-artifactok az igazság forrása, a szereplőállapot fold és projection útján áll elő. Szereplő-adatbázis felé külön, leírt út vezet (materializált nézet, amely az artifactokból visszamenőleg, adatvesztés nélkül felépíthető). A váltás feltételei és a döntés részletei az ADR-ben: [ADR-009](../decisions/ADR-009-character-state-artifact-fold.md).

Kapcsolódó kapuk (§59, §62) változatlanok. Az implementáció sorrendje: 0. fázis (baseline), majd PR A (contractok + fold + projection, viselkedés nélkül); ezek külön feladatleírással indulnak.

# Függelék D — v8 baseline (0. fázis), 2026-10-20

A 0. fázis (§63) kimenete. Új modellhívás és új mérés nélkül készült: a kód a kiinduló SHA-ról, a mérőszámok a [047 terv](047_fiction_v8_series_evidence.md) már rögzített, fizetős v8-mérési szakaszaiból származnak (a fizetős `report.json`-ok a tulajdonos gépén vannak; ezeket itt nem olvastuk). Ez a baseline a v9 összehasonlítási alapja; a v8 policy ettől kezdve befagyott, és a `tests/fiction-v8-baseline.test.ts` őrzi.

## D.1. Kód és policy

| Elem                                               | Érték                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kiinduló SHA                                       | `a666c905ef953cc696d5d8a0faa4f9169ec01824` (a `packages/` és `apps/` ezzel bájtra azonos azon az ágon, amelyen a baseline készült)                                                                                                                                                                            |
| Policy                                             | `fictionV8Policy()` = planner `life_fiction_plan.v8`, author `life_fiction_author.v8`, plan reviewer `life_fiction_plan_review.v8`, fidelity `life_fiction_fidelity.v1`, editor `life_fiction_editor.v7`, qualityPolicy `2.7.0`, memória `2.0.0`, legfeljebb 9 fizikai kérés, 1 tartalmi javítás, 650–950 szó |
| Prompt-hash (SHA-256, `en`)                        | planner `414be922…8247`, author `17ada823…b100`, review `d18b0363…90cf`, fidelity `0af915d7…ee25b`, editor `7309abf8…fc6d`                                                                                                                                                                                    |
| Prompt-hash (SHA-256, `hu`, tárolt/kutatási nyelv) | planner `64848d27…cf03`, author `81fc3166…2930`, review `2fdeeb0c…b6d5`, fidelity `a2b40d16…49ada`, editor `3a785d84…af80`                                                                                                                                                                                    |
| Request-alak                                       | a planner/author/review/fidelity/editor kérés kulcskészlete a baseline tesztben rögzített; a v9 projection-nek ehhez képest csak policy-kapuval, új kulccsal szabad érkeznie                                                                                                                                  |

A teljes hash-ek a baseline tesztben vannak; a prompt-bájtok `fictionPrompts(locale, fictionV8Policy().promptVersions)` kimenetéből számolódnak.

## D.2. Korpusz és elfogadás

| Futás                | Forrás    |                              Minta | Elfogadva | Megjegyzés                                                   |
| -------------------- | --------- | ---------------------------------: | --------: | ------------------------------------------------------------ |
| Stage A előpróba     | `b9f3195` |            3 (career, fork nélkül) |         3 | 0 javítás                                                    |
| Stage B (részleges)  | `b9f3195` | 16 (creative 8 + fork, career 1–7) |        16 | a career 8. fejezet és a fork a kontextushiba miatt hiányzik |
| Pótló career-sorozat | `8bc2d36` |      9 (8 + fork, javított forrás) |         9 | a Stage B career-mintái ugyanarra a seedre más forráson      |

Összesen 28 elfogadott minta, 0 irodalmilag elutasított. A Stage B és a pótló futás különböző forrás-hash; a kettő összevonása trendjelző, nem egyetlen mérés.

## D.3. Request-, hívás- és javítási mérőszámok

| Mutató                | Stage A | Stage B | Pótló | Teljes hosszúságú két futás együtt (25 minta) |
| --------------------- | ------: | ------: | ----: | --------------------------------------------: |
| Fizikai hívás         |      15 |      95 |    53 |                                           148 |
| Hívás / minta         |    5,00 |    5,94 |  5,89 |                                          5,92 |
| Javítást kapott minta |       0 |       6 |     2 |                                 **8 (32,0%)** |
| Javított arány        |      0% |   37,5% | 22,2% |                                         32,0% |

- Javítási kapu (C/12): a v8 arányából legfeljebb +10 százalékpont engedett. Javasolt viszonyítás a két teljes hosszúságú futás együttes aránya, **32,0%**, azaz a kapu **legfeljebb 42,0%**. A minta kicsi (25), a két futás szórása nagy (22,2–37,5%); a v9 mérést összevethető mintaszámmal kell értékelni. A viszonyítási alap kiválasztását a tulajdonos hagyja jóvá, mielőtt fizetős mérés indul.
- A 9 hívásos plafont elérő fejezetek száma **nem származtatható** a 047-ből (az átlag 2,5 plusz hívás javított fejezetenként, de a fejezetenkénti maximum nincs közölve). Forrás: a három futás `report.json`-ja a tulajdonos gépén; a C/12 „egyetlen fejezet sem éri el a plafont" feltétel ellenőrzéséhez ezt a v9 mérés előtt ki kell olvasni.
- Szolgáltatói hiba: a pótló futás ch6 javítása az editor hiányos válasza (`AI_INCOMPLETE_OR_REFUSED`) miatt volt, nem minőségi elutasítás; a javítási arányba beleszámít, jelölve.

## D.4. Költség

| Mutató        | Stage A | Stage B | Pótló | Teljes hosszúságú két futás együtt |
| ------------- | ------: | ------: | ----: | ---------------------------------: |
| Elszámolt USD | 0,81911 | 5,78719 |  3,31 |                            9,09719 |
| USD / minta   |   0,273 |   0,362 | 0,368 |                          **0,364** |

- Költségtolerancia (C/11): fejezetenként legfeljebb +15%, csak a fejlesztési szakaszra. A tulajdonos által megadott kb. 0,43 USD a 0,37-es gazdasági tervből jön (0,37 × 1,15 = 0,4255); a mért 0,364-ből 0,419 USD. A paid futás előtt rögzítendő küszöb: a tulajdonos válasszon a két érték közül (javasolt: 0,43 USD, a gazdasági tervvel egyező).
- A tartós költségkülönbség magyarázata kiadási kritérium marad (C/11).
- A v9 mérés előtt ledger: 928 hívás, 50,00253 USD; a keret 6,24 USD-ból kb. 2,93 USD maradt (047).

## D.5. Latency

| Mutató (s, medián / P95 / max) | Stage B         | Pótló                           |
| ------------------------------ | --------------- | ------------------------------- |
| plan                           | 116 / 132 / 175 | medián 129                      |
| author                         | 95 / 106 / 112  | medián 112                      |
| plan_review                    | 6 / 8 / 14      | —                               |
| fidelity                       | 5 / 7 / 9       | —                               |
| editor                         | 22 / 37 / 40    | —                               |
| fejezet falióra                | 262 / 387 / 401 | medián 293; javított 393 és 477 |

Egyik v8-hívás sem lépte át a 180 s-ot (legnagyobb: Stage B creative fork plan 175 s, pótló ch8 plan 155 s). A Stage A P95 generálási ideje 257,2 s. Javítás nélküli fejezet 206–271 s, javított 335–477 s. Következmény: a termékben háttérgenerálás kell; a v9 request-mérete (projection) a plan/author hívások latency-jét emelheti, ezért a 3. fázisban a plan és author hívás külön mérendő.

## D.6. Minőségi és memória jelzők (audit, nem irodalmi pontszám)

Súrlódásszó 0/8 (pótló), 1/8 (Stage B creative), visszhang-jelölés 1/8; maradék ismétlődő mondatnyitás (×3–×4); magánélet-szálak név szerint jelen vannak (v7: 0). Az `actor_remove` egyszer sem fordult elő. A szereplők száma: a pótló főszálban 8 `actor_add`. A memória a 9. fejezetnél 10 491 B (főszál) / 12 114 B (fork) a 12 KiB-os (12 288 B) keretből; a szereplőprofilok (`fictionalActors`) kb. 3,1 KB-ot visznek el, ez az a keret, amelyet a v9 szereplőállapot-projection nem terhelhet (a projection a memóriakereten kívül, a 8 KiB-os külön korláttal utazik; a teljes bemeneti bájtkorlátba számít, §55).

## D.7. Nem elérhető / következő lépés

- Fejezetenkénti hívás-, javítás- és latency-eloszlás, 9 hívásos plafon: a `report.json`-okból kiolvasandó (a tulajdonos gépén); a 047 összesített mérőszámokat közöl.
- Tesztszám: a v8 főág teljes tesztfutása a CI-n él; a baseline-hoz külön, determinisztikus teszt készült (`tests/fiction-v8-baseline.test.ts`).
- A v9 mérés ugyanazokat a mutatókat adja, ugyanebben a bontásban; eltérés csak dokumentált okkal.
