---
status: active-supporting
owner: personal-simulation
last_reviewed: 2026-10-16
related:
  - ../DEVELOPMENT_PLAN_HU.md
  - ../architecture/ARCHITECTURE_HU.md
---

## Aktuális implementáció és mérési állapot (2026-10-15)

Az N00–N07 implementáció (PR #25–#33) és a PR #35–#38 beolvadt; az új narratív kód legutóbbi merge-je `fd10b856`. N00–N07 kész. N08 mérőeszköz implementált; 87 fájl / 906 offline teszt és Verify/container CI sikeres, teljes mock korpusz 68 fejezet / 34 pár / 248 transport. A review markerrel új queue öt normál/max8 fizikai kérést használ, régi frozen policy négy/max7; egy globális tartalmi javítás, eredeti monetary/privacy/recovery kapuk megmaradnak. Planner v3, külön tervellenőr v1 és writer v3 csak a megfelelő befagyasztott policy szerint fut. Az eredeti munkacsomag-specifikációk és az alábbi korábbi részállapotok nem jelentik a már elkészült lépések újrakezdését; eltérésnél ez az aktuális összefoglaló és az utolsó tervmódosítás érvényes.

A kétprofilos, egyidőszakos paid diagnózisban mindkét első teljes új fejezet átment öt-öt hívással, javítás nélkül. Összes ilyen költség 0,2674625 USD; 0,13373125 USD/modellkapun átment fejezet. A két külön fix-kánon íróteszt fidelityn átment, editor momentum 2/5 miatt elutasított. A tervellenőr befejezetlen mezővégeket is jelzett. Két első fejezet nem többfejezetes/alternatív ágas vagy független emberi minőségbizonyíték: complete=false, qualityRelease=false.

Összes külön fejlesztési költés 101 hívás / 2,158755 USD accounted / 1,9980987 USD usage-becslés; minden használat ismert, hozzárendeletlen foglalás nincs. Maradék 2,841245 USD ugyanabból az összesített 5 USD-ból. A korábbi források hibái és a ledger megmaradnak. A fejlesztési számla nem a termék fejezetára, és nem a production béta költése.

N08 következő feladatai: befejezetlen tervmezők forrásának vizsgálata; fix-kánon anyag hat hónapra elégtelen előrehaladása; valódi többidőszakos és fork mérés, hash-bound szemantikai döntésreview és vak emberi értékelés. Nem jóváhagyott párosításhoz reviewed=true nem írható. Az előzetes [gazdaságossági javaslat](PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) nem módosít árat, csomagot vagy minőségkaput.

N09 kiadási előkészítés részleges: az eredeti normál Linux-operátori migráció megtörtént, de a már funded runtime új narrative forrásra frissítésének támogatása külön Issue #34. Pontos forrás/audit/CI, schema és tárolt prompt-policy kompatibilis recovery, drain/fence/reconcile és target/apply/readback marad kötelező. Új narrative production rollout nincs; a béta korábbi aktiválását nem ismételjük és a window/ledger nem nullázható.


## N08 következő célzott implementáció (Issue #43, 2026-10-16)

Az új queue-jelölt planner v4 / reviewer v2 / writer v3 változatot választ. A tervellenőr 1.1.0 readiness mezői külön vizsgálják a teljes összefoglalókat, teljes decisionPattern jelentést és az időszakhoz elegendő előrehaladást; bármely false programozottan zárja a próza útját. A frozen régi planner/reviewer/writer promptok és reportok megmaradnak; schema-verzió downgrade nem pótolja a readiness bizonyítékot. Öt normál feladat, max8 és egy javítás, budget/privacy/lease/artifact korlát változatlan.

A két bukott fix-kánon eredeti anyaga változatlan negatív kontroll. Külön developed-v2 bemenet kerül a két érintett profil összehasonlításába, 5. hónapi mérföldkővel és forráshoz kötött materialVersion jelöléssel. A writer v3 egyelőre változatlan, hogy jobb bemenet és jobb írás hatása külön mérhető legyen. Részletek: [mérési runbook](../operations/NARRATIVE_EVALUATION_HU.md). Ez offline implementációs jelölt, nem új paid/human vagy production PASS; N08/N09 PARTIAL marad.

## N02 konkrét implementáció – a munkacsomag eredeti részállapota

A narrative szerződések és JSON-sémák 1.0.0 verzióval készülnek; a Life V2 JSON-sémák változatlanok. A scene/choice/thread/NPC/delta/editor/artifact strict objektumok nem tartalmazhatnak szabad state patch-et. A context mód JSON-sémája és runtime validátora továbbra is üres thread/NPC tömböt követel. A narrative-v1 futási flag még tiltott.

A jelenetterv kánonhashhez, branchhez és revízióhoz kötött. Első verzióban a jelenetek nem osztoznak eventId-n: a chronology nem kereszteződhet. A szereplőnek az adott első scene event állapotában léteznie és a hivatkozott eseményekben részt vennie kell. A stakes pontosan fedi az utolsó decision opcióit; az utolsó elfogadott choice következménye kötelező, késleltetéshez nyitott, fix határidejű szál kell.

Folytatáshoz explicit, szerver által előállított owned-history reference snapshot kötelező. Ez tartalmazza a teljes prefix periodPositions/historyEventIds/usedThreadIds/forbiddenActorIds halmazait; a bounded model memory önmagában nem bizonyítja a lezárt thread ID-k hiányát. A későbbi queue/commit integráció plain JSON tömbökből építse a Map/Set objektumokat, mert a core hash nem Map/Set szerializáló. A referencia-snapshot nem modell által adott authority és nem engedély a privát múlt AI-nak küldésére.

A thread eredete és deadline-ja immutable; a lejárt szál rendezést vagy indokolt lezárást igényel. Új kitalált szereplő csak actor_add útján kaphat provenance-t, időszakonként legfeljebb egy; supplied identity címkéjét nem klónozhatja, a Shared tiltott identitásait nem használhatja. A validated actor/thread delta továbbra sem írhat közvetlen WorldState-et.

A validateNarrativeChapterV1 kemény szótartománya 250–950, míg a régi validatePeriodChapterV2 250–600 marad. Ez követi a terv puha 650–950 szavas írói célját: egy erős 550 szavas fejezet nem bukik pusztán a hosszon. A teljes narrative-v1 integráció ezt az új validátort kizárólag a megfelelő job policy alatt használhatja.

A program nyolc editor pontból számol gate-et; pass verdict nem ment meg gyenge kritikus score-t vagy major issue-t. A bekezdés- és event hivatkozások valóban létezzenek. A 32 KiB artifact a policy/plan/delta/editor/hash és receipt provenance konzisztenciáját követeli. Az input hash-ek mellett planningOutputHash és fidelityOutputHash is rögzül, és az utolsó planner/writer/fidelity/editor receiptnek a végső eredményhez kell kötődnie. Az artifactot később a worker szerkeszti össze, nem a modell állítja elő authorityként.

## N01 konkrét implementáció

A queue opcionális narrativeContext envelope-ot fagyaszt le. Strict context policy, memory version 1.0.0; alapból legacy, üres cohort; egyelőre csak context fogadható el, narrative-v1 konfiguráció tiltott. Az aw_history legfeljebb nyolc időszakos prefixe és az acceptedDecisionIds által megengedett legfeljebb tíz tárolt választás kerül a bemenetbe. Két recent chapter excerpt engedett, a memória UTF-8 limitje 12 KiB. N01-ben openThreads és fictionalActors szigorúan üres: validált melléklet nélküli NPC-belvilág nem állítható elő.

A writer és fidelity ugyanazt az owned historical contextet kapja, új explicit promptverzióval. Legacy envelope hiányában nincs új mező és megmaradnak a régi request/cache hash-ek. Context checkpointok policy/memória-változásánál a candidate/chapter/fidelity cache kötését újra ellenőrzi a worker. Lejárt lease, budget és Shared privacy védelem változatlan.

A withheld memória kizárólag semleges summaryt és null excerptet enged; a SQL ilyenkor nem olvassa a chapter oszlopot, choices nem kerülnek bele. A child fork saját prefixet és saját kiválasztott optiont kap, nem a szülő jövőjét. A memória méretcsökkentése teljes elemeket hagy el; a próza után szükség esetén a régebbi choice rekordokat is elhagyja, a legutóbbit megtartva.

Nincs migráció, sidecar, editor hívás, modellváltás, éles flagváltoztatás vagy fizetett próba. A context mód és allowlist szerveroldali mintakonfigurációja `.env.example`-ben szerepel; valós azonosító nincs commitolva.

## Végrehajtási állapot

Issue: https://github.com/Muzsy/future_flow/issues/24

Az eredeti N00–N07 implementáció PR #25–#33-ban elkészült; N08 és N09 jelenlegi állapotát a dokumentum eleje rögzíti. Az alábbi specifikáció és korábbi mérési szakaszok az előzményeket és az invariánsokat őrzik; nem bizonyítanak önmagukban aktuális paid/human vagy production PASS-t.

Implementáció előtti pontosítás: a core `validatePeriodChapterV2` nemcsak a 500–10000 karakteres sémát, hanem a 250–600 szavas domainkorlátot is érvényesíti. N02-ben külön policyhoz kötött narratív hosszvalidátor szükséges, mind workerben, mind commitkor: a kemény tartomány 250–950 szó, a 650–950 szavas írói cél puha marad; a legacy validátor és régi munkák 250–600 szavas kapuja változatlan marad. Ez explicit fejlesztési követelmény, nem prompt-only módosítás.

Az eredeti terv kódalapja a165f974 volt. A jelenlegi kód és O01/P08 állapot a dokumentum elején és a kanonikus STATUS/DEVELOPMENT_PLAN fájlban szerepel; a dokumentáció nem állítja vissza a futó konfigurációt és nem nyit új AI-ablakot.

# Alterward történetmesélési fejlesztési terv

Végrehajtható fejlesztési specifikáció • 2026. október 14. • 1.0

A terv célja, hogy az Alterward személyes élettörténetei következetes, emlékező, jelenetekben megírt és valódi következményeket mutató folytatásokká váljanak. A fejlesztés a meglévő eseménykánonra, elágazásokra, munkasorra és adatvédelmi védelemre épül. Az új írói réteg nem írhatja felül a szimuláció igazolt tényeit.

A dokumentum címzettje a fejlesztést végző ügynök és a változtatásokat ellenőrző reviewer. A döntések és alapértékek az első megvalósításra vonatkozó specifikációk; a jelenlegi működést külön jelöljük. A fejlesztést tíz egymásra épülő munkacsomagban kell elvégezni. A fizetett összehasonlító próba és az éles kiadás külön kapu: a fejlesztési terv nem engedélyezi automatikusan ezek végrehajtását.

## 1 A fejlesztés eredménye és határai

Az olvasó minden új fejezetben érzékelje, hogy az előző döntése megváltoztatta a történetet. Legalább egy korábban elindított folyamat jusson kézzelfogható következményig, vagy kapjon indokolt, időben korlátozott késleltetést. A főszereplő céljai ütközzenek helyzetekkel és más szereplők érdekeivel. A végső döntés a megélt eseményekből következzen, és a választásoknak legyen eltérő ára, bizonytalansága és várható iránya.

A cél nem teljesíthető kizárólag hosszabb prózával. Először az eseménytervet kell megjavítani, majd az írónak átadni a megfelelő múltat és jelenettervet, végül külön ellenőrizni az irodalmi minőséget. A történet maradjon fikció: siker, bukás, félreértés, kockázat és változás megengedett, de a program nem tehet valós életre vonatkozó ígéreteket.

**Első körben benne van:** a személyes V2 élettörténet generálása, korábbi személyes döntések következményei, kitalált mellékszereplők következetessége, új történeti memória, jelenetvezetés, szerkesztői ellenőrzés, korlátozott javítás, költség- és megszakításkezelés, kompatibilis tárolás, célzott UI hibaüzenetek és összehasonlító minőségmérés.

**Későbbi fejlesztés:** új világmodell, dinamikus időlépés, teljes NPC kapcsolatháló, személyiségteszt, vektoradatbázis, külön ügynökplatform, teljes Shared vagy nyilvános történetgenerálási áttervezés. A meglévő Shared és nyilvános funkciók adatvédelmi kompatibilitását már ebben a körben biztosítani kell.

**Megőrzendő viselkedés:** a hat hónapos személyes időlépés, a kánon elsőbbsége, a döntés előtti fejezetvég, a meglévő Life V2 szerződések, a költségkorlát, a naponta megengedett generálások, az egyidejűség korlátja, a felhasználói tulajdon ellenőrzése, a törlés és export, a munkák újraindíthatósága. Az alkalmazás új generálásai továbbra is angolul készülnek; a régi magyar tartalmak olvasása és exportja működjön.

## 2 Ellenőrzött kiinduló állapot

### 2.1 A forrás és a vizsgálat alapja

Repository: Muzsy/future_flow. A vizsgált main commit: `a165f974ae7fb8c7830d7ac0ddf5684cd2843d4b`. A munkahelyi példány a beszélgetés munkakönyvtárának `work/future_flow` könyvtárában található. A tervben szereplő utak repositoryhoz viszonyított utak, így más gépen is használhatók.

A korábban tesztelt alkalmazás runtime commitja `827d72aceabd7360c9cfbc120166d87cc11e2425`. A megvizsgált main újabb dokumentációt és consent-origin regressziós teszteket tartalmaz; a jelenlegi személyes AI folyamatot érintő fájlok nem változtak ettől a runtime alaptól. A megvalósító ügynök induláskor ellenőrizze újra a HEAD-et, az AGENTS.md-t, a migrációkat és a terv érintett függvényeit. Eltérés esetén dokumentáljon rövid változásjegyzéket, és igazítsa a tervet az aktuális kódhoz.

A történetminőség kiinduló példája egyetlen, konzervatív karriercélú tesztprofil három fejezete. A profil hat hónapos koordinációs karrierfeltárást kért a munka megtartásával, heti hat óra és védett hétvégék mellett. Három fejezet, vagyis tizennyolc szimulált hónap során a történet sok előkészítést és kevés külső következményt mutatott. A harmadik fejezetig egy tényleges javaslatbenyújtás jutott el; válasz vagy próba még nem következett.

Az értékelésben a személyre szabás és kánonkövetés erős volt, a jelenetek és a történeti lendület gyengébb. Ez a megfigyelés konkrét javítási irányt ad, de nem reprezentatív teljes termékminőség-mérés. A későbbi értékelésben többféle cél, erőforrás és karakter szükséges.

### 2.2 A jelenlegi folyamat pontos gyenge pontjai

| Terület             | Ellenőrzött jelenlegi működés                                                                       | Fejlesztési következmény                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Eseménytervezés     | A provider 2–5 eseményt és végső döntést kér; reflexiós, állapotot nem módosító esemény megengedett | A valid kánon önmagában nem garantál történeti előrelépést                  |
| Memória             | A queue két korábbi időszak eseményeit és legfeljebb tíz döntést adja az eseménytervezőnek          | Több fejezeten átívelő szálak és visszatérő motívumok elveszhetnek          |
| Író bemenete        | PeriodStoryInput: locale, identity, goals, events és opcionális sharedEvents                        | A személyes múlt és elfogadott döntések nem jutnak el közvetlenül az íróhoz |
| Prózafeladat        | 250–600 szó, második személy, 1–2 konkrét pillanat                                                  | Nem kötelező a teljes jelenet, fordulópont vagy korábbi döntés kifizetése   |
| Ellenőrzés          | A life_fidelity nyelvet, kánont és biztonságot vizsgál                                              | Jóváhagyhat helyes, de ismétlődő vagy eseménytelen fejezetet                |
| Javítás             | Egy közös tartalmi javítás van eseményre vagy történetre                                            | Az új szerkesztő nem kaphat korlátlan újrapróbálkozást                      |
| Commit kész állapot | lifeJobReadyToCommit jelenleg a candidate, chapter és fidelity alapján dönt                         | Az új módban szerkesztői igazolás és hashkötés is szükséges                 |
| Olvasási DTO        | A privát branch lekérdezés p.* oszlopokat olvas                                                     | Új belső JSON oszlopot explicit el kell választani a megjelenítési DTO-tól  |

### 2.3 A fő fájlok és felelősségek

- `packages/contracts/src/life-v2.ts`: Actor, LifePeriodInput, PeriodCandidateV2 és PeriodChapterV2 szigorú sémák. A chapter body jelenlegi korlátja 500–10000 karakter. A candidate 6 vagy 12 hónapot enged, de a személyes worker hat hónapot érvényesít.
- `packages/ai/src/index.ts`: provider interfészek, promptok, Structured Outputs, tokenkorlát, fizetett hívások guardja, átmeneti hibák kezelése és receipt.
- `apps/worker/src/life-processor.ts`: eseménytervezés, szimuláció, fejezet, fidelity, checkpointok és közös javítás.
- `packages/core/src/life-v2.ts`: `simulatePeriodV2` és `validatePeriodChapterV2`. Ezek maradnak a kanonikus igazság ellenőrzői.
- `packages/database/src/lives.ts`: queue, branch view, döntés elfogadása, fork és retry. A fork történeti prefixet örökít, és másolja a releváns korábbi választásokat.
- `packages/database/src/life-jobs.ts`: lease, checkpoint, fail és tranzakciós complete; commitkor újra ellenőrzi a kánont és az alaprevíziót.
- `packages/database/src/life-job-state.ts`: commitképes checkpoint felismerése a claim és retry korlátjainál.
- `packages/database/src/repository.ts`: saját adat exportja. `packages/database/src/life-deletion.ts`: élettörlés és kapcsolódó adatvédelmi érvénytelenítés.
- `apps/web/components/life-experience.tsx`: a fejezet címének és bekezdéseinek megjelenítése, döntések és folyamatállapotok.
- `packages/contracts/src/error-messages.ts`: olvasónak szánt hibaüzenetek. `apps/web/lib/client.ts`: kliens hibakezelés.

## 3 A választott architektúra

### 3.1 Az új generálás lépései

Az első teljes új mód neve `narrative-v1`. A normál folyamat négy logikai AI hívásból áll:

1. A queue felépíti a branchhez tartozó, adatvédelmileg megengedett memóriát, és lefagyasztja a generálási szabályokat a job payloadjában.
2. A tervező egyetlen válaszban adja a jelenlegi V2 eseményjavaslatot, a jelenettervet és a történeti memóriaváltozást.
3. A program lefuttatja a meglévő szimulációt és az új determinisztikus tervellenőrzést. Hibás terv esetén a közös egy javítási lehetőség használható.
4. Az író a validált kánon, a memória és a jelenetterv alapján írja meg a fejezetet.
5. A meglévő, külön fidelity hívás ellenőrzi a tényeket, a nyelvet és a biztonságot.
6. Egy külön szerkesztői hívás pontozza a történetmesélést és konkrét hibákat azonosít.
7. A worker kizárólag minden kapu teljesülése után commitol; az adatbázis ugyanabban a tranzakcióban tárolja a fejezetet és a narratív mellékletet.

A kritikus biztonsági és tényellenőrzés nem olvad össze az írói pontozással. A tervhez, íráshoz és szerkesztőhöz a jelenlegi modellkonfigurációt kell elsőként használni. Modellváltás csak összehasonlító mérés alapján kerüljön külön PR-ba; új árakat vagy minőségi ígéreteket ne hardcode-oljon az ügynök.

### 3.2 Bevezetési módok és visszamenőleges kompatibilitás

Új, szerveroldali beállítás: `NARRATIVE_PIPELINE_MODE=legacy|context|narrative-v1`, alapérték `legacy`. A `context` átmeneti mód az író számára teszi elérhetővé a személyes múltat, és továbbra is a jelenlegi három hívást használja. A teljes `narrative-v1` csak az összes tárolási, worker-, budget- és ellenőrzési feladat után kapcsolható be.

A queue a módot és az összes lényeges szabályt a job policyban rögzíti. Régi payloadban a policy hiánya pontosan legacy viselkedést jelent. A worker nem a futáskori flag alapján választja ki egy régi job folyamatát. Így a telepítés nem érvényteleníti csendben a már kifizetett, checkpointolt fejezetet. A context és narrative módú payloadok külön verziót kapnak.

A flaget a queue-t használó API konfigurációja és a worker konfigurációja egyaránt validálja. A bekapcsoláshoz szerveroldali NARRATIVE_COHORT_USER_IDS allowlist is szükséges: alapból üres, csak hitelesített saját userId alapján dönthet, nem query/body paraméterből. Az üres lista minden új jobot legacy módban tart. A lista privát konfiguráció, nem kerülhet repositoryba vagy logba. A narrative módú worker induláskor ellenőrizze, hogy az új provider metódusok léteznek. Ne kezdjen fizetett generálásba hiányos képességgel. A web és a kliens nem küldhet felülbíráló módot vagy költségszabályt.

A meglévő Life V2 strict objektumok és 2.0.0 verzió megmaradnak. Az új mezők független, verziózott szerződésekben legyenek; ne kerüljenek ellenőrizetlen extra mezők a candidate, actor vagy chapter objektumba. Régi fejezetekhez nincs AI újragenerálás és nincs visszamenőleges UPDATE.

### 3.3 Új fájlok és módosítási határok

Javasolt új fájlok: `packages/contracts/src/narrative.ts`, `packages/core/src/narrative.ts`, `packages/database/src/narrative-memory.ts`, `packages/ai/src/narrative-prompts.ts`, `tests/narrative-contracts.test.ts`, `tests/narrative-memory.test.ts`, `tests/narrative-quality.test.ts`, `tests/narrative-job-recovery.test.ts` és `scripts/evaluate-narrative.ts`.

Ezek javasolt új utak, nem létező funkciókra való hivatkozások. Exportjaikat az adott package jelenlegi indexéből kell elérhetővé tenni. Ne hozzon létre új szolgáltatást, új adatbázist vagy általános ügynökkeretrendszert. A provider közös számlázási és retry rétegét használja, ne másolja le azt a narratív modulba.

## 4 Az új szerződések részletes specifikációja

### 4.1 Általános szabályok

Minden új séma Zod strict objektum legyen, explicit nullokkal, tömbkorlátokkal és enumokkal. Szabad szöveg csak a kijelölt mezőkben szerepeljen. Nem kell JSON Path, szabad állapotpatch vagy modell által végrehajtható utasítás. Az új séma verziója `1.0.0`. A NarrativePeriodInput a meglévő LifePeriodInput és a policy, illetve narrativeMemory mezők verziózott envelope-ja; a strict Life V2 objektumokba ne kerüljön új mező. A típusvázak specifikációk; a Zod kódot az ügynök írja meg a package stílusa szerint.

A ref típusai: `eventId` a már elfogadott történeti prefixből vagy az új candidate eseményeiből; `decisionId` és `optionId` a ténylegesen tárolt választásokból; `actorId` az állapotból vagy szabályos actor_add változásból. Az ID szintaktikai validitása nem elég: minden referenciát az aktuális, tulajdonolt branch kontextusában kell feloldani. Másik felhasználó ID-ja ugyanúgy érvénytelen, mint egy nem létező ID.

### 4.2 NarrativeJobPolicy

```typescript
type NarrativeJobPolicy = {
  version: '1.0.0';
  mode: 'context' | 'narrative-v1';
  promptVersions: {
    planner: string | null;
    writer: string;
    fidelity: string;
    editor: string | null;
  };
  memoryVersion: '1.0.0';
  qualityPolicyVersion: '1.0.0' | null;
  maxPhysicalRequests: number | null;
  maxContentRepairs: 1;
  targetWords: { min: number; max: number };
};
```

Narrative-v1: négy explicit promptverzió, qualityPolicy 1.0.0, hét fizikai request felső határ, egy közös tartalmi javítás, 650–950 célszószám. Context: planner/editor null, a meglévő retry-korlát megtartása maxPhysicalRequests null értékkel, 250–600 szavas cél. A null nem korlátlan engedély: a legacy transport retry és meglévő budget guard továbbra is érvényes.

A kód ne fogadjon tetszőleges kliensértékeket. A policyt szerveroldali konstansokból állítsa elő a queue. Hash-eléshez a repository meglévő core `hash` függvényét használja, ne vezessen be eltérő JSON rendezési szabályt.

### 4.3 NarrativeMemory

```typescript
type NarrativeMemory = {
  version: '1.0.0';
  branchId: string;
  baseRevision: number;
  history: PeriodMemory[];
  recentChoices: ChoiceMemory[];
  openThreads: ThreadMemory[];
  fictionalActors: FictionalActorMemory[];
  recentDecisionPatterns: string[];
  withheld: boolean;
};
```

A `PeriodMemory` tartalma: periodId, startDate, endDate, saját branchbeli sorrend, 80–500 karakteres summary, legfeljebb három salient eventId, legfeljebb két újabban olvasott fejezetnél 1200 karakteres excerpt vagy null. Legfeljebb nyolc időszak szerepelhet a historyban. A summary elbeszélt eseményeket rögzít; nem állítja, hogy a fejezet végi döntést már meghozták.

A `ChoiceMemory`: decisionId, optionId, a tárolt elfogadás ideje ISO dátumként, 1–200 karakteres option label és a tényleges typed changes 0–500 karakteres összefoglalása. Legfeljebb tíz elem. A modell ne írja újra a választás tényét. A `ThreadMemory` és `FictionalActorMemory` mezőit a következő részek definiálják. `recentDecisionPatterns` legfeljebb négy, legfeljebb 80 karakteres címke; ezek anti-ismétlési jelzések, nem döntéskényszerítő utasítások.

A memória maximális mérete UTF-8 JSON szerint 12 KiB. Ez kizárólag az új memóriaobjektum korlátja, nem a teljes prompté és nem az operátori state.json korlátja. A csökkentés sorrendje determinisztikus: régebbi excerpt eltávolítása; régebbi history elemek elhagyása; régebbi mintacímkék elhagyása; alacsonyabb prioritású szálak elhagyása. Teljes elemeket hagyjon el, ne vágjon szét JSON-t vagy ID-t. Az aktuális branch binding és a legutóbbi tényleges döntés maradjon meg. Ha ezek önmagukban túllépik a korlátot, a queue álljon meg validációs hibával, fizetett hívás nélkül.

### 4.4 NarrativePlan és a tervező válasza

```typescript
type NarrativePlanningResult = {
  version: '1.0.0';
  candidate: PeriodCandidateV2;
  plan: {
    premise: string;
    centralTension: string;
    scenes: ScenePlan[];
    turningPointEventId: string;
    choiceConsequences: ChoiceConsequence[];
    decisionStakes: DecisionStake[];
    decisionPattern: string;
    memoryDelta: NarrativeMemoryDelta;
  };
};
```

`premise`: 80–400 karakter; `centralTension`: 80–400 karakter. `scenes`: 2–3 elem. ScenePlan mezői: sceneId, eventIds 1–3 elem, purpose enum setup|pressure|payoff|turning_point, locationRef string vagy null, actorIds 0–4 elem, visibleAction 40–300 karakter, obstacle 40–300 karakter, shift 40–300 karakter, dialogueIntent 0–200 karakter vagy null. A locationRef csak ismert kanonikus helyre vagy általános helytípusra utalhat; új vállalat, pontos cím vagy fontos élethelyszín nem állítható be ezzel.

`choiceConsequences`: 0–3 elem. Mindegyik: decisionId, optionId, eventIds 1–3 elem, disposition enum paid_off|advanced|delayed, explanation 40–300 karakter, threadId string vagy null. Csak valóban elfogadott choice lehet benne. Delayed esetben létező vagy most létrehozott, határidős thread kötelező. Ha volt előző választás, legalább egy consequence kötelező, kivéve az adatvédelmi visszatartást.

`decisionStakes`: a végső decision valamennyi optionId-ja pontosan egyszer, eventIds 1–3, cost 20–200, possibleGain 20–200, uncertainty 20–200 karakter. A szöveg a kánonból és a választási lehetőségből következzen; garantált eredményt ne állítson. A különböző lehetőségek között tényleges cselekvési vagy erőforrásbeli különbség szükséges.

`turningPointEventId`: az új candidate egyik eseménye. `decisionPattern`: legfeljebb 80 karakteres leírás, például bounded_trial_vs_external_exploration. Nem szabad ugyanazt a két lehetőséget csak átnevezni három egymást követő fejezetben. A program az ismételt mintát szerkesztői figyelmeztetésként kezeli; nem kényszerít mesterséges válságot.

### 4.5 Narratív szálak és kitalált szereplők

`ThreadMemory`: id, originPeriodId, originEventId, kind enum goal|relationship|opportunity|conflict|motif, summary 40–300 karakter, status enum open|progressed|resolved|dropped, dueByPeriodOffset 1|2, lastTouchedPeriodId, eventRefs legfeljebb négy. Egyszerre legfeljebb hat nyitott szál. A határidő az induló periodhoz viszonyított folytatások számát jelenti; nem tolható végtelenül előre. A második folytatás végéig rendezés, látható változás vagy indokolt lezárás szükséges. A lezárás lehet negatív vagy bizonytalan eredmény is.

A cél az ígéretek követése, nem minden szál erőltetett happy endje. A thread nem hoz létre kanonikus állapotot: munkahelyváltáshoz, új szereplőhöz, pénzügyi vagy célhaladásbeli változáshoz továbbra is typed event change kell.

`FictionalActorMemory`: actorId, introducedByEventId, role 20–120 karakter, desire 20–200, resistance 20–200, voiceCue 20–120, lastSeenPeriodId. Legfeljebb tizenkét elem a memóriaobjektumban. A provenance kizárólag olyan szereplőt minősíthet kitaláltnak, aki a generált kánonban szabályos actor_add változással jelent meg. A felhasználó által megadott valós személy nem kap automatikusan belső motivációt, diagnózist vagy titkot. Shared résztvevőből nem válhat engedély nélkül NPC.

A jelenlegi Actor strict séma változatlan marad: id, label, relationship. A hang és motiváció a narratív mellékletben tárolódik. Egy új fejezetben legfeljebb egy új visszatérő kitalált NPC legyen; nem kötelező NPC-t létrehozni, ha a történet működik nélküle. Az NPC cselekvésének állapotkövetkezménye az eseménykánon része, a voiceCue csak írói segítség.

### 4.6 Szerkesztői jelentés és tárolt melléklet

A `NarrativeEditorialReport` mezői: version, scores, issues, verdict. A scores nyolc egész 1–5 pontszám: causality, momentum, sceneCraft, character, personalization, choiceStakes, novelty, prose. A `verdict` pass|revise. Az issues legfeljebb nyolc elem: dimension, severity minor|major, paragraphIndex 1-alapú integer vagy null, eventIds legfeljebb három, explanation 30–350 karakter, suggestedFix 30–350 karakter.

Az overall értéket a program számolja a nyolc dimenzió számtani átlagaként, két tizedesre kerekítve. Pass feltétel: causality, momentum, sceneCraft, choiceStakes és prose mind legalább 4; overall legalább 4.00; nincs major issue. A karakterdimenzió alacsony pontja önmagában nem kényszerít egyedül játszódó történetbe mesterséges NPC-t. Az AI verdict nem írhatja felül a számított kaput. A fidelity külön, kötelező pass marad.

A `NarrativeArtifact` egy strict, 1.0.0 verziójú JSON melléklet: pipelineVersion, policy, validatedPlan, validatedMemoryDelta, editorialReport, bindings és provenance. A bindings tartalma policyHash, memoryHash, candidateHash, canonHash, storyInputHash, chapterHash, fidelityInputHash, editorialInputHash. Provenance: promptverziók és a tárolt receipt hivatkozások; titok, API kulcs és teljes provider request nem kerül bele. Maximum 32 KiB UTF-8; a memória bemenet teljes másolata nem tárolandó ebben. A már meglévő job payload és own export tulajdonoshoz kötött kezelését kell követni.

## 5 A memória összeállítása és az elágazások

### 5.1 Determinisztikus építési algoritmus

A `buildNarrativeMemory` új függvény a queue tranzakciójának felhasználóhoz és branchhez kötött olvasásából dolgozzon. Bemenete a branch revíziója, az aw_history rendezett prefixe, a hozzá tartozó periodok, az aktuális ágon tárolt választások és az ugyanitt megengedett Shared privacy projection. Kimenete a validált, méretkorlátozott NarrativeMemory. A függvény nem hív AI-t.

1. Az aw_history adja a történeti tagságot és sorrendet. Ne a periods.branch_id alapján építse a múltat, mert a fork korábbi fejezetei örököltek lehetnek.
2. Vegye az utolsó nyolc időszakot; a régebbi, még nyitott szálakhoz szükséges eredethivatkozást az ugyanazon historyban lévő korábbi periodból ellenőrizze, ne idegen branchből.
3. Új periodnál a validált melléklet összefoglalója és delta adja a memóriát. Legacy periodnál a kánon eseménycímeiből és összefoglalóiból készítsen rövid, determinisztikus fallbackot. Ne generáljon utólag fizetett összefoglalót.
4. Az aktuális ágba már átmásolt vagy itt elfogadott választásokból vegye az utolsó tízet. Az option label és change az eredeti period pending decisionjéből legyen feloldva. Ne használja a szülőág jövőbeli választásait.
5. A szálak deltáit történeti sorrendben foldolja, ellenőrizve az eredetet, a státuszátmenetet és a határidőt. A legutóbbi szereplői voiceCue csak megfelelő provenance és változatlan actorId mellett írható felül.
6. A Shared visszatartás és vetítés után alkalmazza a 12 KiB korlátot, majd parse-olja újra a végső objektumot. A memoryHash a végleges, valóban elküldendő objektum hash-e.

A történeti szálak és kitalált szereplők állapotához a teljes saját history prefix validált mellékleteit kell foldolni; csak a prózai history kivonat korlátozódik nyolc periodra. Az eredethivatkozás ellenőrzése nem jogosítja fel a függvényt régi, privacy miatt visszatartott szöveg elküldésére.

A delta pontos sémája: `periodSummary` 80–500 karakter; `salientEventIds` 1–3 új eventId; `threadUpdates` legfeljebb hat elem; `actorUpdates` legfeljebb két elem; `decisionPattern` legfeljebb 80 karakter. Minden thread update tartalmazza az id-t, status-t, summaryt és új eventRefeket. Új szálnál originPeriodId, originEventId, kind és dueByPeriodOffset kötelező; meglévőnél ezek változatlanok. Meglévő szál státusza resolved vagy dropped után nem nyitható újra ugyanazzal az ID-val. Az actor update új actorra a teljes provenance mezőket, meglévőre csak engedélyezett role/desire/resistance/voiceCue frissítést tartalmazhat.

A plan és delta decisionPattern értéke kötelezően egyezzen. A periodSummary a végső, még meg nem hozott választás előtt áll meg. A delta nyelvi állításait a fidelity is ellenőrizze a kánon ellen, ne csak a chapter bodyt. A ref és karakterkorlát ellenőrzése önmagában nem igazolja egy összefoglaló valósághűségét.

### 5.2 Elágazási invariánsok

A jelenlegi `fork()` az aw_history megfelelő prefixét és a releváns korábbi choice rekordokat másolja. Ezt kell használni; nem kell új, rekurzív szülőág-keresés. Az új delta egy fejezet előtti történetállapotot és a fejezetben elmesélt eseményeket rögzít, de a végén felkínált döntés eredményét nem.

A fork után a queue a másolt historyból épít memóriát, majd a ténylegesen választott fork optiont teszi a recentChoicesba. Ne másoljon teljes, a szülőág későbbi döntését már tartalmazó kész memória-cache-t. A kánon state-je és az acceptedDecisionIds továbbra is az aktuális ág igazsága.

Kötelező példa: A ág harmadik fejezete benyújtást ajánl; A később külső pályázatot választ. B ugyanott belső bemutatót választ. B negyedik fejezetének promptja tartalmazza a közös első három fejezetet és a belső bemutatót, de nem tartalmazhatja A külső pályázatát vagy A negyedik fejezetének eseményeit. Ugyanez legyen igaz rollback, retry és örökölt NPC mellett.

### 5.3 Adatvédelmi visszatartás

A jelenlegi queue adatvédelmi érintettségnél semleges eseményszöveggel dolgozik és visszatartja a választási memóriát. Az új memória nem lehet kerülőút. Ha a meglévő personal privacy szabály a kontextust visszatartja, az új excerpt, summary, nyitott szál, karakterjellemzés és mintacímke sem olvasható vissza nyers chapterből vagy mellékletből. Az első verzió konzervatív: ilyen esetben withheld=true, a szöveges history semleges, recentChoices/openThreads/fictionalActors/recentDecisionPatterns üres, excerpt null.

A planner ilyenkor csak a megengedett aktuális állapotból dolgozik, és nem köteles a visszatartott múlt következményét igazolni. Ez szerveroldali kivétel, nem a modell által bekapcsolható mentesség. A worker a provider előtt és a commit előtt is futtassa a meglévő Shared privacy ellenőrzést. SHARED_PRIVACY_CHANGED esetén a jelenlegi friss queue útvonal állítja elő az új kontextust.

A nyilvános draft, fork, scenario és Shared payload ne kapja meg a privát mellékletet. Nyilvános fork indulásakor csak a jelenleg megengedett, materializált nyilvános kánon használható. A publikus adatcsatornák explicit allowlistje és a saját export tulajdonosi ellenőrzése külön tesztet kapjon.

## 6 A történet dramaturgiai szabályai

### 6.1 Az eseménytervező feladata

A jelenlegi `period()` helyett narrative-v1 módban új `planNarrativePeriod()` metódus készüljön. A meglévő LifeAiProvider metódusai megmaradnak. Az új interfész, például NarrativeAiProvider, külön képességként kínálja a planner, writer és editor metódust; a fidelity a meglévő mechanizmust használja új, verziózott bemenettel. Ez megőrzi a legacy tesztfixture-ök és a régi munkák szerződését.

A tervező elsőként az előző elfogadott döntést, az aktív célt, az elvarratlan szálakat és a legutóbbi döntésmintákat vizsgálja. Az új hat hónapban legyen látható kísérlet, akadály és változás. Egy fejezet ne váljon ismét teljes felkészülési időszakká, ha az előző végén már egy végrehajtható cselekvést választott az olvasó.

Legalább egy esemény mutasson megfigyelhető eredményt vagy visszajelzést: megvalósult próba, elutasítás, válasz, részleges siker, felismerhető kudarc vagy megváltozott lehetőség. Az eredmény lehet szerény. Nem követelmény a nagy dráma, a tragédia, a fizetésemelés vagy az új munka. Ha az esemény állapotot módosít, a typed changes tartalmazza ezt. Egy megbeszélés külső visszajelzése lehet kánonesemény üres változáslistával is, ha nem állít új tartós állapotot.

Az események 2–5 közötti jelenlegi korlátja megmarad. Az új jelenetterv legalább két eseményt dramatizáljon, a többiek rövid időáthidalásként szerepelhetnek. Minden kánonesemény megjelenjen a fejezetben. A végső decision az utolsó eseményhez és a period végéhez kötődjön, és ne legyen már elmesélt választásként kezelve.

### 6.2 A terv determinisztikus ellenőrzése

Új core függvények: `validateNarrativePlan`, `validateNarrativeMemoryDelta` és `evaluateNarrativeEditorialGate`. A simulatePeriodV2 után futó tervvalidátor ellenőrizze:

- A scene eventIds csak az új kánonból jönnek, nincs ismételt sceneId, és a jelenetek első eseményének ideje nem csökken. Egy esemény több jelenetben csak kifejezett folytatásként szerepelhet; az event coverage az egész fejezetre továbbra is kötelező.
- A turningPointEventId létezik; legalább egy jelenet payoff vagy turning_point célt kap. Ez formai minimum, nem helyettesíti a szerkesztő ítéletét.
- Minden consequence decisionId/optionId megegyezik egy elfogadott branch choice-szal. Visszatartás kivételével az előző choice legalább egyszer szerepel.
- A decisionStakes optionhalmaza pontosan egyezik a kánon végső döntésével; nincs extra, hiányzó vagy duplikált option.
- A scene actorIds léteznek az adott esemény pillanatában: új actor csak az actor_add után szerepelhet. Real és Shared szereplőhöz nem adható kitalált provenance.
- A delta thread és actor hivatkozásai a saját historyra vagy az új eseményekre mutatnak. Lejárt szál nem tolható át pusztán új határidővel. Az állapotváltozást továbbra is a szimuláció vizsgálja.

A program nem tudja determinisztikusan bizonyítani, hogy egy szöveges fordulópont érdekes. A szerkesztő ezért kötelező; a tesztek különítsék el a formai validitást és az irodalmi minőséget.

### 6.3 Az író konkrét feladata

Új `writeNarrativeChapter()` bemenet: locale, identity, goals, a szimulált events, a validált plan, a megengedett NarrativeMemory és a jelenlegi Shared projection. A worker sem az eredeti, még nem validált candidate-et, sem idegen actor state-et ne adja át írói tényként. Az eseményszövegek és a felhasználói szövegek továbbra is untrusted data.

Alapcél: 650–950 angol szó, második személy, 2–3 jelenet és rövid időáthidalások. A body hard limit marad 10000 karakter, a minimális 500 karakteres szerződés szintén megmarad. A célszószám írói és szerkesztői irány, nem a meglévő DB szerződés megváltoztatása. A hossz önmagában nem pass feltétel.

Az első bekezdés konkrét helyzetben kezdődjön, és kapcsolódjon az előző választáshoz. A jelenetben legyen cselekvés, ellenállás és a jelenet végére megváltozott viszony vagy lehetőség. Dialógus csak kánonból levezethető állítást és jeleneten belüli textúrát adhat; ne csempésszen bele nem szimulált felvételt, pénzügyi megállapodást vagy új valós személyt. A narrátor ne sorolja fel minden fejezetben újra az órakeretet és minden kockázati korlátot.

A fejezet végén a döntésnek történeti oka legyen: az olvasó lássa, miért kell most választani. A narrátor ne döntse el helyette, és ne dicsérje automatikusan a legóvatosabb opciót. A józan korlátoknak lehet ára: lassabb haladás, elmulasztott lehetőség vagy más szereplő türelmetlensége. A főszereplő ne váljon állandóan optimalizáló tanácsadási ügyféllé.

### 6.4 Az írói és tényellenőrző promptok szerkezete

A promptok külön modulban, verziózott konstansokkal legyenek. Javasolt új task nevek: life_narrative_plan, life_narrative_chapter és life_narrative_editor. Az új fidelity prompt például life_fidelity.v4.en; legacy módban a jelenlegi v3 marad. A meglévő generate promptVersion elágazását explicit registryre kell bővíteni, nehogy minden új life_ task tévesen v2 verziót kapjon.

A planner rendszerutasítása tartalmazza: fikciós keret; kánon és untrusted text elválasztása; hat hónap; előző choice következménye; nyitott szálak; új szereplő csak actor_add útján; külső visszajelzés; végső döntés meg nem oldása; strict sémakimenet. Az író rendszerutasítása tartalmazza: 2–3 jelenet; következetes visszautalás; változó ritmus; konkrét cselekvés; valós tények megtartása; nincs utólagos életvezetési tanács.

Az editor külön dimenziónként kérjen indoklást és bekezdéshivatkozást. Ne lássa a szerző önértékelését. A fidelity kapja meg a kánont, a fejezetet, a validált tervet és a deltát, és vizsgálja mindhárom szöveges felület tényeit. A memory nem írhatja felül a jelenlegi kanonikus state-et.

A promptméret, bodyméret és output tokenkeret külön limitek. A jelenlegi generate life_ feladatokra legfeljebb 6500 output tokent enged. Az első körben ezt ne emelje automatikusan: a séma- és 950 szavas maximum alapján mérje a csonkolódást. Csonkolt structured output hibának számít, a közös javítási és budget szabályok szerint kezelendő.

## 7 Worker checkpoint és költségkezelés

### 7.1 A job állapotának bővítése

A narrative-v1 checkpointjai: policy és policyHash; planningResult és planningInputHash; validált candidate és candidateHash; narrativePlan és planHash; memoryHash; chapter és storyInputHash; fidelityResult, fidelityInputHash és fidelityPassed; editorialReport, editorialInputHash és editorialPassed; repairUsed és repairKind; providerRequestCount; a meglévő receipt gyűjtemény és scope binding.

A hash mindig a tényleges bemenetet kösse, beleértve a verziókat, policyt és javítási kontextust. Az editorialInputHash a chapter body, canon, plan, megengedett memory és quality policy együtteséből készüljön. Az editor report egy módosított fejezetre nem újrahasználható. A chapter módosítása a fidelity és editor eredményét egyszerre érvényteleníti.

Új process lépések: dispatch policy alapján; privacy ellenőrzés; tervezés vagy hash szerint újrahasználható checkpoint; kanonikus szimuláció; tervvalidáció; írás; chapter validáció; fidelity; editorial gate; atomic complete. Minden lépés a meglévő lease alatt működik. Lejárt lease után nincs új provider request és nincs commit.

### 7.2 Egyetlen tartalmi javítás

A meglévő, közös `repairUsed` szabály megmarad. Esemény-, terv-, fidelity- vagy minőségi hiba esetén összesen egyszer lehet tartalmat újragenerálni. A repairKind bővülhet narrative_plan vagy narrative_editor értékkel; az enum és tesztjei egyezzenek a tényleges checkpoint típussal.

Tervezési hiba esetén új terv készül a pontos validációs hibákkal, majd az író az új kánonnal dolgozik. Ténybeli vagy írói hiba esetén csak a fejezet írható újra azonos validált tervből; utána új fidelity és editor kell. Ha az editor olyan hibát talál, amihez a kánont kellene megváltoztatni, azt ne próbálja prózajavítással meghamisítani: a job minőségi hibával álljon meg, és a fixture vagy planner prompt fejlesztése legyen a következő lépés.

Normál menet négy logikai hívás. Egy editorial vagy fidelity javítás legrosszabb logikai menete hét hívás: planner, writer, fidelity, editor, új writer, új fidelity, új editor. A transport retry fizikai hívásai is beleszámítanak az új mód hét requestes plafonjába. Egy átmeneti hiba így elhasználhat olyan slotot, amely miatt később nem fér bele a javítás; ilyenkor a program megáll, nem emeli magától a korlátot.

### 7.3 A fizikai request keret megvalósítása

A provider közös `parseWithRetries`/generate útjában, közvetlenül az egyes tényleges requestek előtt hívjon jobhoz kötött request admission hookot. A hook egy lease-ellenőrzött, atomikus checkpointmódosítással növeli a providerRequestCountot, ha az kisebb hétnél. Ugyanennek a logikai hívásnak a transport retryja is új slotot igényel. A több processből jövő kísérletek ne végezhessenek egyszerű read-modify-write műveletet lost update kockázattal.

A sorrend legyen dokumentált: lease/request slot és budget reservation ellenőrzés; tényleges kérés; receipt/usage és budget settlement. Budget elutasítás előtt ne fusson tényleges provider kérés. Ha a slotot már lefoglalta, de a budget nemet mond, a slot konzervatívan elhasználtnak tekinthető; az ügynök ne vezessen be könnyen visszaélhető slotvisszaadást. Ismeretlen kimenetelű hálózati megszakítás után a slot nem szabadítható fel.

A meglévő DatabaseAiBudget és ExperimentAiBudget guard együttes használata kötelező. A slotplafon nem helyettesíti az USD korlátot. A mostani konfigurált modellek, a fizetett ablak, user- és projektbudget változatlanok. A tesztelő aktív keretét ne használja összehasonlító fejlesztői generálásokhoz.

A normál retry ugyanazt a payloadot, request countot és repairUsed értéket őrzi. A lease recovery sem nullázza ezeket. A privacyváltozás miatti új queue a jelenlegi szabály szerint friss, megengedett kontextust kap; nem szolgálhat olcsó keretmegkerülésként. A receipt és budget ledger mutassa az elhasznált hívásokat az előző jobon is.

### 7.4 Commitkész állapot és végső ellenőrzés

A `lifeJobReadyToCommit` új módra csak akkor adhat true-t, ha a policy, candidate, chapter, fidelity és editor valamennyi kötelező hashkötése ellenőrizhető és pass. Egy magányos fidelityPassed=true vagy editorialPassed=true nem bizonyíték. A helper kaphat új típust vagy külön szigorú narrative ágat; a legacy ág pontos viselkedése maradjon kompatibilis.

A claim attempt és lease recovery felső korlátja után kizárólag kész, ellenőrzött eredmény commitolható. Ilyenkor nulla új AI hívás megengedett. A `complete()` újra ellenőrizze a job tulajdonát, lease-t, branch revíziót, kanonikus state hash-t, privacy-t, candidate-et, chaptert, tervreferenciákat és a quality gate kötését.

A commit utáni checkpointkompaktálás jelenleg receiptOrdert és generationBindingot őriz. Az új melléklet/policy/editor hash és pipelineverzió szükséges auditadatai ne vesszenek el. Teljes belső prompt és nyers modellválasz nem szükséges tartós, kliensnek hozzáférhető metadata gyanánt. A receiptben a feladat, promptverzió, modell, hash, token és latency maradjon visszaolvasható.

## 8 Adatbázis tárolás és adatvédelem

### 8.1 Migráció

Új nullable JSONB oszlop: `aw_periods.narrative_artifact`. A vizsgált kódban a legutolsó migráció 037; a tervezett út `database/migrations/038_narrative_artifacts.sql`, de csak akkor használható, ha a megvalósítás kezdetén továbbra is ez a következő sorszám. Ne írja át a korábbi migrációk checksumát. Az SQL alapja egy új oszlop hozzáadása default és index nélkül; a JSON strict és méretellenőrzése alkalmazásszinten történjen a commit előtt.

A meglévő immutable period trigger maradjon aktív. Régi periodnál null az érték; nincs backfill és nincs UPDATE. Új narrative-v1 periodnál a melléklet kötelező a complete alkalmazási szabályában, és ugyanabban az INSERT-ben tárolandó, mint a chapter és a canon_hash. Legacy vagy context mód új periodja null mellékletet kaphat, így az átmeneti bevezetés nem hoz létre félkész narratív adatot.

Nem kell új RLS policy vagy új idegen kulcs egy oszlophoz, de a meglévő jogosultságok és a backup/restore invariánsai ellenőrizendők. A database read típusa külön nullable mezőt kapjon; a web által olvasott Period DTO ne kapja meg automatikusan.

### 8.2 DTO export törlés és nyilvános utak

A `lives.ts` p.* lekérdezésének eredményéből explicit készítsen megjelenítési DTO-t, vagy válassza ki a meglévő szükséges oszlopokat. Az új narratív mellékletet az alap branch/life válasz ne tegye ki. A writer memóriaépítője saját, tulajdonhoz kötött adatbázisolvasást használjon, ne a web DTO-t alakítsa vissza belső adattá.

A saját adat exportjában a verziózott melléklet megjelenhet a megfelelő period mellett, ha ugyanaz a user tulajdonol minden rekordot. A teljes provider request, kulcs, más felhasználó azonosítója és Shared privát eredeti szövege nem kerülhet bele. Az export séma változását dokumentálja, és fixture-rel ellenőrizze. Ha az export jelenlegi fogyasztója strict, ahhoz kompatibilis verziózás kell; nem lehet észrevétlen extra mezőkkel megtörni.

A life és account törlés a period törlésével a mellékletet is eltávolítja. A több ágon örökölt period kezelése a meglévő tulajdonolt history szabályt kövesse. Ne vezessen be külön, törlés után visszamaradó narrative cache-t. Shared privacy invalidálásnál minden érintett új memória- és checkpointmező is tisztuljon a jelenlegi payload/checkpoint törlési szabály szerint.

A publikáció és nyilvános fork útvonalai explicit tiltsák a melléklet, az actor belső jellemzés és a szerkesztői riport automatikus kiadását. A nyilvános fejezet bodyja továbbra is a meglévő külön review és publication útvonalon kezelendő.

### 8.3 Privacy recovery baseline

A kiinduláskor vizsgált `scripts/lib/privacy-recovery-schema.ts` explicit 001–037 baseline-t, oszlopdarabszámot és digestet vár. A JSONB oszlop hozzáadása emiatt valóban baseline-változás. A migráció PR-ja frissítse a reviewed baseline-t, a szükséges darabszámot és digestet, és az ehhez tartozó teszteket.

Az új értékek kizárólag tiszta, elszigetelt adatbázisban, a repository migrációiból előállított séma alapján számolhatók ki. Az éles adatbázis aktuális alakját nem szabad automatikusan megbízható baseline-nak minősíteni. A foreign key digest várhatóan nem változik, de ezt mérni kell. A `privacy-security-catalog.ts` index-, constraint-, default-, function- és triggerkatalógusát is össze kell hasonlítani. Csak valóban változó érték frissíthető, review-val.

Kötelező egy teszt, amely a jó új sémát elfogadja, valamint egy teszt, amely egy további, nem review-zott oszlopot elutasít. A restore/prune teszt bizonyítsa, hogy törölt fiók narratív melléklete mentésből történő helyreállítás után sem szolgálható ki. A séma-egyezés nem helyettesíti a szöveges Shared privacy vizsgálatot.

## 9 A fejlesztés sorrendje és munkacsomagjai

### 9.1 N00 Kiinduló mérés és döntési jegyzőkönyv

**Függőség:** nincs. **Eredmény:** elfogadott fejlesztési keret és megismételhető offline tesztprofilok.

Olvassa el az AGENTS.md-t és a kanonikus dokumentumokat. Jegyezze fel a tényleges HEAD-et, a migrációlista végét és a munkakönyvtár státuszát. Más feladat untracked tesztjelentéseit és privát operátori állományait hagyja érintetlenül. Készítsen fejlesztési issue-t az engedélyezett repositorymunkafolyamat szerint, és kapcsolja a későbbi PR-okat ehhez. A terv átadása önmagában nem hoz létre issue-t.

Új fejlesztési dokumentum: `docs/plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md`. Tartalmazza a jelen terv döntéseit és a munkacsomagok állapotát. A docs/DEVELOPMENT_PLAN_HU.md dokumentumba új narratív minőségi munkasor kerüljön a már használt azonosítók ellenőrzése után. Hozzon létre legalább nyolc teljesen kitalált profilt és ellenőrzött story fixture-t. A korábbi tesztprofillal azonos célú, de személyes adatot nem tartalmazó fixture kötelező.

**Elfogadás:** a fixture-ek bemenete valid Life V2, dátuma rögzített, nincs élő user/email/token; a baseline háromhívásos út offline mockkal megismételhető; a dokumentáció megkülönbözteti a történeti probléma megfigyelését és az új minőségi követelményeket. Ez a PR nem változtat éles konfigurációt és nem hív AI szolgáltatást.

### 9.2 N01 A személyes múlt eljuttatása az íróhoz

**Függőség:** N00. **Fő fájlok:** lives.ts, narrative-memory.ts, contracts/narrative.ts első memória része, AI PeriodStoryInput, life-processor.ts, life-ai és memory tesztek.

Valósítsa meg a queue history-alapú memóriaolvasását és a determinisztikus legacy fallbackot. A context policy kerüljön új job payloadba; az író context módban kapja meg a memóriát. A legacy PeriodStoryInput és régi checkpoint hash maradjon byte-szinten az eddigi alakú, ha nincs új policy. Ne egészítsen ki minden régi story objektumot automatikusan egy üres új mezővel.

Készítsen privacy-redaction és fork-prefix tesztet már ebben a csomagban. Az új prompt kérje az előző choice következményének megjelenítését, de a teljes jelenetterv és a negyedik AI hívás még nincs bekapcsolva. A context flag alapból off.

**Elfogadás:** új context job írópromptjában megjelenik az előző választás, legacy job három hívása és checkpoint újrahasználata változatlan, Shared withheld esetén nincs régi próza a bemenetben, fork nem lát jövőbeli szülőágat, a memória méretkorlátja tesztelt. N01 külön mérhető gyors javítás, nem a teljes fejlesztés vége.

### 9.3 N02 Narratív sémák és determinisztikus validátorok

**Függőség:** N01. **Fő fájlok:** contracts/narrative.ts, core/narrative.ts, package exportok és új contract/quality tesztek.

Valósítsa meg a 4. fejezet teljes strict sémáit és az 5–6. fejezet validátorait. Készítsen egy teljes, valid NarrativePlanningResult fixture-t, amelynek candidate-je a meglévő simulatePeriodV2-n is átmegy. A typed changes és a jelenetterv elválasztását dokumentálja. Implementálja a pontszámokból számított gate-et, a szálhatáridőt és a megengedett actor provenance-t.

**Elfogadás:** ismeretlen extra mező, idegen eventId, hiányzó decision stake, nem elfogadott option, túlkoros nyitott szál és hamis kitalált actor provenance mind elutasított. A régi Life V2 JSON sémák változatlanok. `pnpm schemas` csak az új, szándékos sémát/exportot és szükséges generált dokumentumot módosítja.

### 9.4 N03 Melléklet tárolás és recovery kompatibilitás

**Függőség:** N02. **Fő fájlok:** új migráció, life-jobs.ts commit insert, adatbázistípusok, lives.ts DTO, repository.ts export, privacy recovery/security catalog és tesztjeik.

Adja hozzá a nullable oszlopot, a read/insert típusokat és az új melléklet alkalmazási ellenőrzését. A narrative-v1 mód továbbra sem kapcsolható be, amíg N05–N07 nincs kész. Egy tesztbeli complete képes legyen validált mellékletet atomikusan menteni. Régi/null esetben maradjon a jelenlegi insert és read kompatibilitás.

Frissítse a review-zott recovery baseline-t az elszigetelt új séma mérésével. Készítsen DTO/exportra vonatkozó mezőtesztet és törlés/restore regressziót. A migráció visszafordítása adatvesztés miatt nem a rollback alapja: a feature flag legacyra állítása és kompatibilis régi kód tesztelt viselkedése legyen a visszaállítási terv.

**Elfogadás:** régi period tovább olvasható, immutable trigger aktív, melléklet nélkül nincs narrative-v1 commit, a melléklet nincs a web DTO-ban, own exportban nincs más tulajdonos adata, ismeretlen sémaeltérés továbbra is blokkol. Éles migrációt ebben a fejlesztési PR-ban ne futtasson.

### 9.5 N04 A tervező író és szerkesztő provider

**Függőség:** N02; merge sorrendben N03 után. **Fő fájlok:** ai/index.ts, új narrative-prompts.ts, life-ai és új narrative AI tesztek.

Adja hozzá a capability interfészt és a négy feladat explicit prompt registryjét. A planner Structured Outputsban adja vissza a V2 candidate és terv envelope-ot. Az író kapja meg a validált kánont, tervet és memóriát. Az új fidelity bemenet a delta és terv szövegét is ellenőrizze. Az editor structured score/issue riportot adjon.

A generate közös útvonalon store:false, schema parsing, receipt, tokenkeret, model routing, budget guard és transport retry továbbra is egyetlen implementáció maradjon. A fejlesztő ne hívjon közvetlenül külön OpenAI klienst a narratív modulban. A modellek kezdetben a jelenlegi eventModel/storyModel/checkModel konfigurációból származzanak; editorhoz checkModel vagy eventModel használható.

**Elfogadás:** mock transport bizonyítja a task és promptverziók helyességét, untrusted text kezelését, megengedett memóriát, store:false-t és minden fizikai request számlázási útját. A legacy provider API és a régi public/Shared taskok változatlanok. Nincs valódi fizetett próba ebben a csomagban.

### 9.6 N05 Új worker folyamat és kötött checkpointok

**Függőség:** N03 és N04. **Fő fájlok:** life-processor.ts, life-jobs.ts, life-job-state.ts, main.ts, queue policy és recovery tesztek.

Implementálja a policy dispatchot, a planner–simulate–validate–writer–fidelity–editor folyamatot és a 7. fejezet hashkötéseit. A commit ugyanazt a validált mellékletet tárolja, amelyhez a gate tartozik. A lease heartbeat és a meglévő user/branch/state ellenőrzések változatlanul kötelezők.

A fizikai request admission hook és atomikus számláló ebben a csomagban kerüljön be. Megszakításkor az elsődleges cél a duplikált költség elkerülése; checkpoint nélküli, de potenciálisan elküldött requestet ne minősítsen ingyenesnek. A ready-to-commit helper és retry nem kerülheti meg az új gate-et.

**Elfogadás:** minden AI lépés után szimulált crashból helyesen folytat, valid cache mellett nincs új hívás, módosított body vagy memória invalidálja a releváns cache-t, korlát után csak kész eredmény commitolható, hamis true flag nem elég. Az új mód alapértelmezetten továbbra is off.

### 9.7 N06 Következmények szálak és szereplők integrációja

**Függőség:** N05. **Fő fájlok:** narrative-memory.ts/core/narrative.ts, planner prompt, fork és Shared privacy tesztek.

Kapcsolja össze a tárolt mellékletek deltáit a következő queue memóriájával. Egyszerű, explicit fold legyen, ne rejtett modellösszefoglalás. Teljes háromfejezetes fixture-sorozatban tesztelje az előző választás kifizetését, egy késleltetett szál határidejét és egy szabályosan bevezetett NPC hangjának visszatérését.

Készítsen többágas fixture-t, amely bizonyítja a fork más választásának eltérő következményét. A privacy withheld ágban minden narratív szövegforrás redaktálódjon. Public fork és scenario kezdés ne örökölje a privát narratív mellékletet.

**Elfogadás:** a szál nem lebeg három hat hónapos időszakon át változatlanul, a kiválasztott optiont a memória helyesen tárolja, a felhasználó által megadott emberről nem keletkezik fiktív magánéleti tény, idegen Shared actor és nyers történeti szöveg nem jut a promptba.

### 9.8 N07 Szerkesztői javítás és felhasználói hibák

**Függőség:** N05 és N06. **Fő fájlok:** processor, core quality gate, error-messages.ts, life-experience.tsx/client.ts, recovery és API tesztek.

Vezesse be az egyetlen globális javítás minőségi használatát és az új hibakódokat: NARRATIVE_QUALITY_FAILED, NARRATIVE_REQUEST_LIMIT és NARRATIVE_CONTEXT_INVALID. A szerver ezeket a jelenlegi job/API hibaformába illessze, ne adjon nyers promptot vagy modellmagyarázatot a felhasználónak.

Javasolt angol üzenet minőségi hibához: “We couldn't complete this chapter to the required quality. Your previous chapters and choices are saved.” Request limithez: “This attempt reached its generation limit. Your previous chapters are saved.” A tényleges retry gomb csak akkor jelenjen meg, ha a backend szerint van még megengedett munka vagy commitképes checkpoint. Ne ígérjen ingyenes új próbát.

A web továbbra is a chapter body bekezdéseit jeleníti meg; új kártya, pontszámtábla vagy technikai minőségriport nem szükséges. Ha változik a body hossza, mobilon és desktopon vizsgálja a tördelést és a döntési gombok elérését.

**Elfogadás:** egyszer javított jó fejezet commitol; másodszori hiba megáll; kánonhibát nem fed el editor pass; régi fejezet nem tűnik el; quota, budget és quality üzenet különböző; újralapozás és stale tab nem írja felül az aktuális ágat.

### 9.9 N08 Minőségi benchmark és prompt finomítás

**Függőség:** N00–N07. **Fő fájlok:** új scripts/evaluate-narrative.ts, fixture-k, tesztek és fejlesztési minőségriport.

Először tisztán offline fusson a harness: mode, fixtureId, output könyvtár és explicit `--allow-paid` kapcsoló nélkül nincs szolgáltatási hívás. A fizetett futás külön jóváhagyott fejlesztői projekttel, budgettel és kulccsal történhet. `.env` vagy kulcs ne kerüljön riportba. A harness az aktuális budget guardon keresztül generáljon, ne kerülje meg a worker új korlátait.

Hasonlítsa össze a baseline-t és narrative-v1-et azonos profil, dátum és előzetesen rögzített kanonikus döntések mellett. Külön mérje az eseménytervezést, a prózát és a teljes rendszer hatását. A 10. fejezet szerint vak emberi értékelés és költségriport szükséges. Ha a jelölt nem jobb, a flag off marad; a gate küszöbét nem szabad pusztán azért levinni, hogy a rossz eredmény átmenjen.

**Elfogadás:** a harness titkok nélkül reprodukálható, teljesíti a kemény invariánsokat, van többfejezetes és fork értékelés, a humán minőségi kapu és jóváhagyott költségkeret teljesül. A fejlesztési riport konkrét szövegrészletekkel indokol, és a sikertelen mintákat is feltünteti.

### 9.10 N09 Kiadási előkészítés és ellenőrzött bekapcsolás

**Függőség:** valamennyi korábbi csomag. **Fő fájlok:** kanonikus dokumentáció, deployment konfiguráció és külön operátori kiadási terv, release tesztek.

Futtassa az összes előírt offline checket, frissítse a dokumentációt, készítsen reviewer számára végleges diffet. A PR CI és a megfelelő audit legyen sikeres. Ellenőrzött stagingen próbálja a migrációt, restore-t, legacy olvasást és négyhívásos teljes folyamatot. Ezután készítse elő a konkrét éles bekapcsolási csomagot és visszaolvasási tervet.

Aktív, fizetett personal beta ablak mellett a jelenlegi image/sourceDigest/operator fence szabály miatt új alkalmazáskép és migráció nem telepíthető egy általános közvetlen compose paranccsal. A kanonikus Linux-operátori kiadási eljárásnak előbb explicit támogatnia kell az adott upgrade-et; ha ezt nem támogatja, az éles bekapcsolás külön operátori feladat és jóváhagyás, vagy későbbi karbantartási időpont. Nem szabad a keretet újraindítani, a runtimeDigestet kézzel átírni vagy a journal-t megtisztítani.

**Elfogadás:** a kiadási csomag tartalmazza a commitot, image digestet, migrációt, mentés/restore bizonyítékot, megengedett upgrade útvonalat, kezdeti cohortot és rollbacket. Az éles flag csak jóváhagyott kiadásban módosul. Minden módosítás után adatbázis/config visszaolvasás és egy engedélyezett tesztelő teljes fejezetköre szükséges. A korábbi window és költségledger értékei változatlanok.

## 10 A történetminőség bizonyítása

### 10.1 A mérési korpusz

Legalább nyolc fiktív profil szükséges, profilonként három összefüggő fejezettel. Ez módszerenként 24 fejezetet, két módszer összevetésénél 48 fejezetet jelent, még a javítások nélkül. A fizetett teljes futás ezért külön tervezett fejlesztői költségigény; nem fér automatikusan a mostani bétafelhasználó keretébe.

A profilok: karrierfeltárás kis órakerettel; pályaváltás erősebb kockázatvállalással; alkotói portfólió építése; önálló tanulás és vizsga; költözés előkészítése; közösségi projekt; kitalált baráttal kapcsolati cél; alacsony energia és bizonytalan pénzügyi adat. Mindegyik legalább egy valódi dilemmát és több életképes irányt tartalmazzon. A korlátok nem lehetnek minden profilnál azonosak.

Két profil kapjon külön forkot a második döntésnél. Legyen legalább egy Shared-withheld teszteset az offline biztonsági korpuszban. Valós személyes adatot és éles exportot ne használjon új szolgáltatáshoz vagy reviewernek küldött benchmarkként.

### 10.2 Három összehasonlítás

**Az eseményterv minősége:** azonos profil és történeti prefix mellett csak a candidate/plan következményeit hasonlítsa össze. Van-e eredmény, nincs-e ismételten elhalasztva ugyanaz a cselekvés, eltérnek-e a választások?

**A próza minősége:** rögzített, azonos valid kánonból baseline író és új író készítsen fejezetet. Ez leválasztja az írói fejlesztést a planner által esetleg könnyebbé tett történetről. Legalább nyolc ilyen pár legyen.

**A teljes folytatás minősége:** a két teljes folyamat három fejezeten át fusson. A választások szemantikáját a futás előtt rögzített stratégia alapján kell párosítani, például “első körben időkorlátos belső próba”; eltérő optionId-kat nem lehet vakon azonosnak tekinteni. A párosítás és az eltérő kánonok legyenek dokumentálva.

### 10.3 Emberi értékelés

A mintapárok A/B sorrendjét determinisztikus seedből randomizálja a harness, a modell és mód nevét takarja el. Két értékelő javasolt; ha csak egy elérhető, ezt a riport tüntesse fel. Mindegyik olvassa a prefixet és a fejezetet, majd a nyolc dimenziót 1–5 pontozza. Kérdés: melyiket olvasná tovább, és miért? Lehet döntetlen. A véleményhez rövid, konkrét bekezdéshivatkozás szükséges.

A modell saját editor pontja nem független minőségi bizonyíték. A humán preferencia és az alacsony pontok okai alapján kell promptot finomítani. A minta kis mérete miatt a preferencia arányát elemszámmal és bizonytalansággal együtt kell jelenteni, nem termékszintű garantált eredményként.

Kiadási cél: az értékelhető, nem döntetlen teljes-folyamat párok legalább 70%-ában az új változatot részesítsék előnyben; legalább 20 nem döntetlen pár legyen. Mind az öt kritikus dimenzió humán átlaga legalább 4.0. Ne legyen kritikus kánon-, privacy-, fork- vagy pénzügyi guard hiba. Kevés értékelhető párnál a kapu nem teljesült, több mintát kell gyűjteni. A döntetlenek számát mindig külön jelentse, hogy az arány ne fedje el az alig érzékelhető javulást.

### 10.4 Operatív mérőszámok

Mérje a fizikai request számot, az első próbás pass arányt, repair arányt, tartós quality failt, input/output tokeneket, tényleges elszámolt költséget, job teljes időt és fizikai hívásonkénti latencyt. A négyhívásos sorozat várhatóan lassabb lehet, de a p95 értéket nem lehet kódból megjósolni.

Az első összehasonlító próba után a terméktulajdonos rögzítsen abszolút USD/fejezet és várakozási idő felső határt. Addig nincs éles quality rollout. A jelenlegi production budget nem emelhető meg csak azért, mert több ellenőrzés készül. Kiadás előtt mérni kell, hogy a tervezett userkeretből hány sikeres fejezet várható a javítások költségével együtt.

A riport formátuma: fixtureId, mode, pipeline/prompt versions, source commit, period index, chosen decision szemantikája, kánonvaliditás, nyolc editor pont, nyolc humán pont, preferencia, request count, tokens, actual cost, elapsed ms, repair kind, hibák. Titok, éles Auth UUID és privát operator state nem szerepelhet benne.

### 10.5 Az eredeti probléma elfogadási példája

A konzervatív karrierprofil első döntése időkorlátos belső javaslatot választ. A következő hat hónapban a történet eljusson legalább a javaslat tényleges próbájához vagy egy konkrét, indokolt elutasításhoz. Legyen jelenet a visszajelzés körül, a visszajelzés új dilemmát hozzon létre, és az eredmény a kánonban legyen megfigyelhető.

Egy elfogadható kitalált irány: kis pilotot engednek, de a felelős csak szűk időablakot ad; a próba részben javítja az átadást, egy dokumentálatlan kivételnél elakad; a következő döntés korlátozott második kör vagy külső portfólióbemutató. Ez illusztráció, nem fix történet vagy minden profilra előírt siker. A “még hat hónapig finomítod a felkészülési tervet” ismétlése konkrét új akadály vagy eredmény nélkül nem fogadható el.

## 11 Kötelező regressziós és minőségi tesztek

Az alábbi esetek követelmények. A meglévő tesztekhez illeszkedő fixture-ök és új fájlok használhatók; nem szükséges minden sornak külön fájl. Szövegminőséget ne teszteljen pusztán egy kívánt mondat substringjével. A mock teszt a folyamatot és az invariánst bizonyítja, az irodalmi minőséget a benchmark.

| ID  | Eset                                  | Kötelező eredmény                                |
| --- | ------------------------------------- | ------------------------------------------------ |
| T01 | Régi policy nélküli job               | Eddigi háromhívásos út és cache működik          |
| T02 | Context job és személyes choice       | Az író megkapja a választást, nincs editor hívás |
| T03 | Új plan idegen eventId                | Validáció megáll, nincs chapter commit           |
| T04 | Nem elfogadott choice consequence     | Elutasítás, nincs kitalált korábbi döntés        |
| T05 | Hiányzó vagy extra stake option       | Elutasítás                                       |
| T06 | Actor az actor_add időpontja előtt    | Elutasítás                                       |
| T07 | Valós személynek fiktív provenance    | Elutasítás                                       |
| T08 | Thread két folytatás után változatlan | Tervhiba vagy szabályos lezárás szükséges        |
| T09 | Memória 12 KiB felett                 | Determinisztikus whole-item csökkentés           |
| T10 | Prefixből fork, másik választás       | Szülő jövője nem kerül a promptba                |
| T11 | Shared privacy withheld               | Summary excerpt traits és choice nem szivárog    |
| T12 | Privacyváltozás írás közben           | Régi eredmény nem commitolható                   |
| T13 | Strict séma extra mezővel             | Parse hiba                                       |
| T14 | Editor pass de gyenge kritikus score  | Programozott gate elutasít                       |
| T15 | Editor jó, fidelity hibás             | Nincs commit                                     |
| T16 | Delta nem kánon szerinti tényt állít  | Fidelity elutasít vagy szabályos repair          |
| T17 | Egy repair után jó fejezet            | Új fidelity/editor után egy commit               |
| T18 | Második tartalmi javítás igénye       | Megállás, nincs további hívás                    |
| T19 | Hét fizikai request elhasználva       | Nyolcadik request nem indul                      |
| T20 | Transport retry                       | Új slot és budget elszámolás                     |
| T21 | Budget tiltás                         | Nincs tényleges szolgáltatási kérés              |
| T22 | Crash minden fizetett lépés után      | Igazolt cache újrahasználat, helyes count        |
| T23 | Chapter vagy memory hash módosítva    | Fidelity/editor cache invalidálódik              |
| T24 | Hamis fidelityPassed/editorialPassed  | Nem válik commitkésszé                           |
| T25 | Attempt plafon, kész checkpoint       | Nulla új AI hívással commitol                    |
| T26 | Lease elvesztése két worker között    | Nincs duplikált commit vagy count lost update    |
| T27 | Új JSONB és immutable trigger         | Egy INSERT, utólagos period UPDATE tiltott       |
| T28 | Régi/null period olvasása             | Story timeline és export működik                 |
| T29 | Web és public DTO                     | Belső melléklet és actor traits hiányzik         |
| T30 | Saját export és idegen user           | Csak saját adatok, kulcs nélkül                  |
| T31 | Life/account törlés és restore prune  | Melléklet sem marad szolgálható                  |
| T32 | Reviewed schema plusz idegen oszlop   | Recovery guard elutasítja a driftet              |
| T33 | Public fork és scenario regresszió    | Régi szerződések, privát memória nélkül          |
| T34 | Daily UTC quota és concurrency        | Jelenlegi admission változatlan                  |
| T35 | Hosszabb body mobilon és desktopon    | Olvasható bekezdések és elérhető döntés          |
| T36 | Stale tab és eltérő aktuális revision | Nincs felülírás vagy idegenág-commit             |

A meglévő kiemelt suite-ok: `life-ai`, `life-v2`, `life-persistence`, `life-job-recovery`, `life-api`, `life-deletion`, `shared-privacy`, `shared-personal`, `shared-ai`, `ai-budget-window`, `experiment-budget`, `privacy-recovery-schema`, `privacy-security-catalog`, `privacy-restore`, `verified-privacy-authority`, public fork és public draft tesztek. Ezekből a releváns célzott kör és a teljes suite is fusson a végső PR-on.

## 12 Ellenőrzési parancsok és dokumentáció

### 12.1 Fejlesztői ellenőrzések

A vizsgált repository Node 24-et és pnpm 11.19.0-t ír elő. Induláskor a package.json alapján ellenőrizze ezeket. A build parancsok a jelenlegi package scriptek; a jövőbeli ügynök ne telepítsen önkényesen más major runtime-ot.

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
pnpm docs:check
```

Célzott kör egy részfeladat után, a tényleges új fájlnevekkel kiegészítve:

```bash
pnpm build:packages
pnpm exec vitest run tests/life-ai.test.ts \
  tests/life-job-recovery.test.ts \
  tests/narrative-memory.test.ts \
  tests/narrative-quality.test.ts
```

A `pnpm schemas` után ellenőrizze a generált diffet. A build/test/migration fixture csak a tesztkörnyezet konfigurációját használja. Az éles `.env`-vel futó `db:migrate`, `smoke:life`, `smoke:ai`, `smoke:auth` és hasonló script nem alapértelmezett offline ellenőrzés. Ezek valódi adatbázist vagy fizetett szolgáltatást érinthetnek; csak a konkrét környezet és jóváhagyott keret alapján indíthatók.

### 12.2 Frissítendő kanonikus dokumentumok

- `docs/DOCS_INDEX_HU.md`: új terv és későbbi minőségi riport indexelése.
- `docs/STATUS_HU.md` és `docs/DEVELOPMENT_PLAN_HU.md`: ténylegesen elkészült csomagok és ellenőrzött állapot. Régi státuszszöveg miatt ne állítsa át az élő béta konfigurációját.
- `docs/architecture/ARCHITECTURE_HU.md`: új, verziózott memória és melléklet, meglévő kánon elsőbbségével.
- `docs/V2_SIMULATION_CONTRACT_HU.md`: V2 változatlansága és az új envelope kapcsolata, fork és privacy invariánsok.
- `docs/AI_MODEL_ROUTING_HU.md`, `docs/AI_PRODUCTION_BUDGET_HU.md` és `docs/AI_VALIDATION.md`: négyhívásos út, új promptverziók, requestkeret, benchmark és minőségi gate.
- `docs/operations/TESTING_HU.md`: offline új suite-ok, fizetett mérés külön kapuja.
- `docs/PERSONAL_BETA_OPERATOR_HU.md`: csak jóváhagyott operátori upgrade munka után változhat az aktív ablak melletti kiadási szabály. A fejlesztő ne oldja fel saját hatáskörben a jelenlegi fence-et.

Minden PR leírása a konkrét problémát, az új viselkedést, az elvégzett teszteket és a fennmaradó kiadási korlátot tartalmazza. A végső fejlesztési státusz ne mondjon éles story javulást pusztán sikeres mock teszt alapján.

## 13 Bevezetés visszaállítás és üzemeltetés

### 13.1 A kiadási kapuk

**A kapu:** minden schema/domain/privacy/budget/recovery teszt zöld, CI és forrásreview kész. **B kapu:** az offline és jóváhagyott összehasonlító mérés igazolja a történetminőség javulását, a költség- és várakozási korlátot a tulajdonos elfogadta. **C kapu:** a konkrét migráció, mentés és kiadási eljárás az aktuális funded runtime mellett kanonikusan végrehajtható. **D kapu:** az engedélyezett kis cohorttal a tényleges bekapcsolás és visszaolvasás sikeres.

A fejlesztés N00–N08 elkészülhet úgy is, hogy C kapu még nem nyitott. Ilyenkor a fejlesztés kész, az éles kiadás várakozik; az ügynök ne kerülje meg a runbookot. A mostani aktív 30 napos ablak, napi quota és meglévő keret külön működő üzemi állapot. Nem indul újra és nem hosszabbodik automatikusan ettől a fejlesztéstől.

### 13.2 Bekapcsolási lépések

1. Rögzítse az aktuális operator runbook és image/source binding alapján megengedett upgrade-et, a backup/restore bizonyítékot és a kiadási commitot.
2. Stagingen telepítse a migrációt legacy flag mellett. Olvasson vissza régi periodot, futtasson own export és privacy restore tesztet.
3. Stagingen kapcsolja narrative-v1-re az új queue-t. Hozzon létre új jobot, és ellenőrizze a policy snapshotot, a négy receiptet, a validált artifactot és a hashkötéseket.
4. Jóváhagyott éles kiadásban alkalmazza a migrációt és kompatibilis alkalmazást. Kezdetben legacy legyen az új queue módja, majd a kijelölt kis cohort kapjon narrative-v1-et. Ha a flag csak globális, előbb explicit szerveroldali cohort-konfigurációt kell bevezetni; kliensparaméter nem elég.
5. Minden éles változtatás után olvassa vissza a konfigurációt és adatbázist. Ellenőrizze, hogy a budget és az AI-ablak változatlan, a korábbi queued jobok saját policy szerint folytatódnak.
6. Egy engedélyezett tesztelő háromfejezetes köre és egy fork ellenőrzése után értékelje a minőséget és a költséget. Az aktív felhasználó napi limitjét ne emelje a teszt kedvéért.

### 13.3 Visszaállítás

A rollback első lépése az új jobok módjának legacyra állítása. A már queued narrative-v1 jobokat a kompatibilis worker továbbra is csak saját policyjük alapján dolgozhatja fel; ne értelmezze át őket régi módként. Ha kritikus hiba van, a meglévő operátori munkasor-fékezési eljárással állítsa le az érintett munkákat.

Az új oszlop maradhat az adatbázisban. A régebbi kód p.* viselkedése miatt az alkalmazáskép visszaváltása előtt tesztelje, hogy nem teszi ki a mellékletet; biztonságos minimum rollback kép az explicit DTO-s N03 kompatibilitást már tartalmazó verzió. Az oszlopot ne dobja el megőrzendő periodadatokkal. Az operátori runtimeDigest vagy receipt-journal kézi szerkesztése nem rollback.

### 13.4 Figyelendő jelek

Az új mód külön összesített metrikái: first-pass acceptance, repair, quality failure, request ceiling, átlagos és p95 várakozás, USD/sikeres fejezet. Az értékeket pipeline/promptverzió szerint bontsa. Ne írjon teljes prózát, neveket vagy memóriaobjektumot általános logba. A modellek pontszámának inflációját a humán minták rendszeres összevetése jelezheti; automatikus szigorítás/lazítás nem szükséges az első kiadásban.

Azonnali megállási ok: privacy vagy foreign-user leak, kánon utólagos felülírása, elágazási jövőszivárgás, budget guard megkerülése, duplikált commit. Minőségi figyelmeztetés: ismételt, eredmény nélküli felkészülés, magas editor pass és alacsony humán preferencia, túl sok javítás, elviselhetetlen várakozás. A figyelmeztetés prompt- vagy modellkísérletet indokol, nem a felhasználói védelmek eltávolítását.

## 14 Az ügynök számára átadható végrehajtási utasítás

Az alábbi szöveg a fejlesztést elindító ügynöknek adható át a dokumentummal együtt. Az issue/PR műveletek csak az adott munkamenetben engedélyezett repository-hozzáféréssel végezhetők. A fizetett benchmark és az éles kiadás a dokumentumban leírt külön kapun marad.

> A Muzsy/future_flow repositoryban valósítsd meg az Alterward történetmesélési fejlesztési terv 1.0 változatát. Először olvasd el az AGENTS.md-t és a terv 2. fejezetében megadott fájlokat, ellenőrizd a HEAD-et és a migrációlista végét. A terv a165f974 commitra épül; az eltéréseket dokumentáld. N00–N09 sorrendben dolgozz, issue és feature branch/PR munkafolyamattal. Minden csomag elfogadási feltételét és a releváns regressziós teszteket teljesítsd. A jelenlegi strict Life V2 sémákat, kánonvédelmet, forkot, Shared privacy projectiont, exportot/törlést, lease-t és budget guardot tartsd meg. Az új mód alapból legacy legyen; a policyt queue időben fagyaszd le, ne értelmezd át a már kifizetett régi checkpointokat. Új narratív adatot csak validált sidecarban tárolj, nem kanonikus szabad state patchben. Ne használj éles személyes adatot benchmarkhoz. Fizetett AI próba előtt készítsd elő a konkrét becsült futásszámot és külön fejlesztői budgetet; ennek engedélye nélkül maradj offline mocknál. Éles migráció, deployment, cohortbekapcsolás és operátori fence változtatás előtt készíts review-zható kiadási csomagot, és kövesd a kanonikus Linux-operátori runbookot. Ne indíts új AI-ablakot, ne nullázd a költségledgert és ne emeld a tesztelő limitjét. A végén add át a PR-okat, tesztbizonyítékot, sémaváltozásokat, benchmarkriportot és kiadási kapuk állapotát. Sikert csak az igazolt szintig állíts.

## 15 Az elkészült fejlesztés átadási ellenőrzőlistája

- Az összes új fájl és export hozzáadva; a régi Life V2 contract és legacy út működik.
- A history-alapú memória és fork-prefix invariáns tesztelt; a Shared withheld út nem olvas vissza nyers történeti szöveget.
- A tervező előző choice következményét, jelenetet és final decision stakes-t készít; a fontos változások továbbra is a typed kánonban vannak.
- Az író emlékszik és jelenetekben ír; a fidelity a delta/plan állításait is ellenőrzi.
- A szerkesztő gate nem megkerülhető; egy közös repair és hét fizikai request a teljes új job plafonja.
- Crash, lease loss, retry és ready-to-commit tesztek bizonyítják a megfelelő újrahasználatot és költségvédelmet.
- Nullable melléklet, explicit DTO, saját export, törlés és backup/restore baseline elkészült; nincs privát adat publikus úton.
- Offline ellenőrzések, CI és forrásreview zöld; a generált schema diff szándékos és review-zott.
- Minőségi riport tartalmaz vak humán értékelést, hibás mintákat és tényleges költséget; a kapu teljesülése számszerűen látható.
- A külön jóváhagyást igénylő paid benchmark és éles release állapota egyértelmű; az aktív personal beta ablak és ledger érintetlen.

## 16 Forráshivatkozások és bizonyítékjegyzék

A következő források a vizsgált commitban ellenőrzött implementációs pontok. A sorszámok a megadott commitra vonatkoznak; refaktorálás után a függvény/szimbólum alapján keressen. Repository alaplink: https://github.com/Muzsy/future_flow/tree/a165f974ae7fb8c7830d7ac0ddf5684cd2843d4b.

- `packages/ai/src/index.ts`, PeriodStoryInput a 54. sortól; LifeAiProvider, periodRules; period a 497. sortól, periodChapter az 521. sortól, checkPeriodChapter az 535. sortól; parseWithRetries és generate közös request/receipt út.
- `packages/contracts/src/life-v2.ts`, Actor az 48. sor körül, PeriodCandidateV2 a 167. sortól, PeriodChapterV2 a 316. sortól, LifePeriodInput a 325. sortól.
- `packages/core/src/life-v2.ts`, simulatePeriodV2 a 289. sortól, validatePeriodChapterV2 a 392. sortól.
- `apps/worker/src/life-processor.ts`, processLifeJob; a story objektum összeállítása, chapter/fidelity hash és közös repair ág.
- `packages/database/src/lives.ts`, queue a 475. sortól, fork a 717. sortól, retry a 797. sortól, aw_history alapú privát branch olvasás a 276. sor körül.
- `packages/database/src/life-jobs.ts`, claim/heartbeat/checkpoint/complete/fail; a complete szimulációs újraellenőrzése a 181. sor körül.
- `packages/database/src/life-job-state.ts`, lifeJobReadyToCommit a 3. sortól; catalog operator lease kizárás, legacy fidelity shortcut.
- `scripts/lib/privacy-recovery-schema.ts`, a kiindulási explicit 001–037 baseline és assertReviewedPrivacyRecoverySchema; N03-ban review után 001–038-ra frissült. `scripts/lib/privacy-security-catalog.ts`, ellenőrzött biztonsági katalógus.
- `packages/database/src/repository.ts`, saját export; `packages/database/src/life-deletion.ts`, tulajdonolt törlés és Shared invalidálás.
- `apps/web/components/life-experience.tsx`, fejezet body bekezdésenkénti renderelése; `packages/contracts/src/error-messages.ts`, GENERATION_LIMIT a 325. sor körül.
- `docs/PERSONAL_BETA_OPERATOR_HU.md`, aktív funded runtime és source/image binding szabályok; `docs/AI_MODEL_ROUTING_HU.md`, `docs/AI_PRODUCTION_BUDGET_HU.md`, kanonikus routing és budget.
- Korábbi operatív tesztjelentés: a beszélgetés kimenetei között `pre-beta-e2e/2026-10-14_0010/FINAL_REPORT.md`. A narratív baseline egyetlen konzervatív profil három fejezete; a teljes termékre vonatkozó általánosítás nem ebből következik.

## N03 tárolási és recovery megvalósítás

A 038 migráció egyetlen nullable JSONB oszlopot ad az aw_periods táblához; nincs default, index, backfill, canon UPDATE vagy új grant. A strict narrative-v1 queue envelope tárolási előkészítést kapott; a konfiguráció továbbra is elutasítja ezt a módot, a legacy worker sem generálja. A későbbi worker a NarrativeCommit belső típussal adja át a mellékletet és a saját számított input bindingjeit.

A complete a tranzakció alatt újraolvassa a lease-elt payloadot, összeveti a hívó snapshotjával, újraszimulálja a canont, majd újraellenőrzi a policy/memory/candidate/canon/plan/chapter és successful fidelity output kötését, a szerkesztői gate-et és a tényleges receipt listát. A teljes tulajdonolt aw_history prefixből építi a szálreferenciákat. Az új mód melléklet nélkül elutasított; legacy/context nem menthet mellékletet. A chapter/canon/artifact azonos INSERT és tranzakció része. A provider-input hash-ek végső előállítása és a checkpoint/request admission N04–N05 feladata, nem a modellé.

A detail explicit eddigi period-oszlopokat kér le, a job állapotból pedig nem ad ki belső checkpointot. Az own export aw_periods sorainak nullable narrative_artifact mezője és a narrativeArtifactVersion=1.0.0 metaadat additív; Life V2 és az export meglévő szerződésverziója változatlan. A public editor/preparation meglévő explicit projekciója nem örökli a mellékletet. Account/life törlés a period cascade-jával eltávolítja.

A tiszta 001–037 migrációs PGlite és a hozzáadott 038 összehasonlítása: 855→856 oszlop; columns digest 37519bd15ef5d42b9ea1ef6486dc00a3ddf43582c589d718a01355701de1b31c. A külön executable katalógusban kizárólag a defaults/identity/generated oszloplista változott, 856 elemre és b84ad227d4af79bb12d842fa72e172c0372013f1143b18e0babcbcc599c2d06d digestre. A 96 tábla, 219 FK, 712 constraint, 251 index, 27 függvény és 66 trigger változatlan; az összes további katalóguskategória is változatlan. Ez fejlesztési, izolált mérés, nem éles sémaegyezés.

A karanténos restore fixture mentésébe egy később törölt account és egy később törölt life validált narratív periodja kerül. Replay után mindkettő eltűnését külön ellenőrzi. A drift guard továbbra is elutasít további nem review-zott oszlopot és módosult jog/kód katalógust. A régi replay image új sémával nem kompatibilis: rollout előtt külön reviewed recovery release, migration/restore és funded upgrade kapu szükséges. A registry/operator receipt nincs átírva; éles migráció nem futott.

## N04 narratív provider és verziózott promptok

Az OpenAiProvider külön NarrativeAiProvider capabilityt kapott: planNarrative, writeNarrativeChapter, checkNarrativeChapter, editNarrativeChapter. Taskok rendre life_narrative_plan, life_narrative_chapter, life_fidelity, life_narrative_editor; explicit receiptverziók life_narrative_plan.v1.en, life_narrative_chapter.v1.en, life_fidelity.v4.narrative.en és life_narrative_editor.v1.en. A prompt registry a frozen narrativeV1Policy verzióiból származik. A locale változat ugyanazt a szerződést használja; éles rollout továbbra is angol.

A planner a jelenlegi eventModelt, az író storyModelt, a két ellenőr checkModelt vagy ennek hiányában eventModelt használ. Nincs modell-/könyvtár-/SDK- vagy konfigurációváltozás. Minden feladat a meglévő közös generate/parseWithRetries útvonalon fut: store:false, strict Structured Outputs, legfeljebb 6500 life-task output token, a meglévő reserve/settle és számlázott transport retry. Fizikai request admission N05-ben kerül a közös útvonal elé; a N04 nem aktivál queue módot.

A narrative-prompts.ts explicit request builderjei a valódi user request objektre számított receipt hash-ekhez használhatók a későbbi workerben. A builder nem küldi el a server reference inventoryt, véletlen extra top-level mezőt vagy az író önértékelését. A memory/plan strict parse, UTF-8 memórialimit és Shared projection ellenőrzés a request előtt történik. A planner branch/revision, időprefix és accepted ID kötést is ellenőriz. Withheld kontextusban a régi legacy memory recentEvents/choices szövege is ürül; a megengedett Shared projection külön validálva marad. A rendszerutasítás nem interpolál user/history/repair szöveget.

A tervező megfigyelhető cél-előrelépést vagy érdemi következményt kér, a permanens tervezgetést és a visszatérő sematikus óvatos döntést kerüli. A jelenetek cselekvés/ellenállás/változás elven készülnek. Az író második személyben, konkrét jelenetben kezd, nem ad tanácsadási leckét és nem tölt fel üres prózával szótartományt. Az editor a tényleges fejezetet osztályozza nyolc rögzített, 1–5 skálán értelmezett dimenzióban; a hossz vagy a szabályos JSON nem indokol négyes pontot. Egy canonhiányt nem javíthat új tény kitalálásával. A fidelity a plan és a memoryDelta állításait is vizsgálja.

Az új mock transport próbák két locale négy feladatát, input/output hash/registry/model/outputlimit/store:false kötését, hostile text és accidental inventory izolációját, withheld/oversize input korai elutasítását, négy task budget-denialját, minden fizikai transport attempt reserve/settle-jét, incomplete/schema-error számlázását és a szerkesztő bekezdéshivatkozásait vizsgálják. Ezek nem valódi irodalmi minőségbizonyítékok; fizetett próba vagy production változás nincs.

## N05 worker checkpoint és fizikai request admission

A még ki nem adott narrative-v1 szerződés új server-only NarrativeReferenceSnapshotot kapott a payloadban, plain JSON periodPositions/historyEventIds/usedCanonicalIds/usedThreadIds/forbiddenActorIds/fictionalActorOrigins mezőkkel. A készlet a teljes saját aw_history prefixből származik, nem AI-kimenet és nem a legutolsó nyolc memóriaelem. A snapshot bounded és egyedi azonosítókat kér; idegen/origin nélküli actor metaadat elutasított. Az új artifact referenceHash mezője a normalizált snapshotot köti. A Life V2 gépi sémák továbbra változatlanok; éles narrative-v1 adat még nincs, a konfiguráció még elutasítja ezt a módot. N06 fogja az új queue-ba építeni a teljes memóriát és a további Shared identity blacklistet.

A tényleges model requestek pure builderjei az AI modulból a core narrative-requests modulba kerültek, az AI exportok/API és serialized request alakjának megtartásával. Ez azért szükséges, hogy a database ready-to-commit ellenőrző ugyanazt a request hash-t újra tudja számítani, DB→AI függőség és párhuzamosan eltérő építő nélkül. A nar runtime helper a policy/memory/reference/candidate/canon/plan/planningOutput/story/fidelity/editor és chapter kötéseket, a valós receiptet, programból számolt minőséget és 4–7 receipt vs legfeljebb 7 request count konzisztenciáját vizsgálja. A teljes prefixben használt event/decision/option ID ismétlést a tervező validációja még írás előtt megállítja.

A processLifeJob a frozen policy.mode szerint dispatchol az új narrative-processorra, négy provider capabilityt követelve. A legacy/context ág változatlan. Az új ág lease/owner/revision/privacy és a tényleges owned reference prefix egyezését vizsgálja. Planner, canon/plan validálás, writer, fidelity és editor után kötött checkpointot ment. A hash vagy receipt alapján érvénytelen stage a leszármazott eredményeket törli, a korábbi receipts/repairUsed/providerRequestCount értékét nem. Egy global repair replanolhat hibás tervet vagy újraírhat prózát azonos canon/plan alatt; a writer után új fidelity/editor szükséges. Másodszori minőségi hiba NARRATIVE_QUALITY_FAILED.

Az OpenAiProvider közös parseWithRetries minden fizikai kísérlete előtt optional beforePhysicalRequest hook fut, közvetlenül a budget reserve előtt. Csak a personal narrative-v1 jobhoz kötött main provider kapja meg. A LifeJobRepository.admitNarrativeRequest saját tranzakcióban lockolja az aktív usert, élő job lease-t és a generáló branch-et; ellenőrzi a privacy/snapshot/state egyezést és a countot. A bounded UPDATE az adatbázisbeli countot növeli atomikusan. A nyolcadik slotot vagy lejárt/stale/operator lease-t elutasítja. Budget denial vagy checkpoint nélküli, ismeretlen kimenetel után nincs slot-visszaadás. A DatabaseAiBudget/ExperimentAiBudget guard, modellek, budget/window/quoták változatlanok; funded attempt továbbra egyszer számolódik lease-enként.

A ready helper claim/retry alatt is megkapja a payloadot; narrative-v1 checkpointot payload nélkül vagy puszta true flaggel nem fogad el. A teljesen bound eredmény a funded attempt/recovery ceiling után is commitolható nulla provider hívással. A worker a teljes nyers fejezetet újra ellenőrzi, és a complete tranzakció újraszimulálja a tényleges branch canont, újraolvassa a current payload/checkpointot és owned prefixet, újraellenőrzi a mellékletet/receipteket. A commit után csak kompakt pipeline/source/artifact/policy/memory/reference/editor és további binding hash, repair, receiptOrder és request count marad a job metadata között; nyers fejezet/editor riport nem.

A célzott worker próbák minden mentett AI stage után crash/reclaim folytatást, checkpoint előtt elveszett választ, planner- és editorial javítást, második quality failure-t, számlázott transport retryt, konzervatív budget-denial slotot, competing admissiont, hetes plafont, expired/stale/operator lease-t, cap utáni zero-call commitot, hamis flaget és megváltozott chapter/memory/reference bindinget vizsgálnak. Az offline provider valódi OpenAiProvider és DatabaseAiBudget útvonalon mock transportot használ; éles request nulla. A direct storage/recovery fixture a bound, szintetikus négyhívásos checkpointot explicit építi; ez nem paid generálási bizonyíték.

N05 lokális záró ellenőrzés: 84 tesztfájl, 859 sikeres offline teszt; format/typecheck/build/schemas/docs check és git diff whitespace check sikeres. Forrásellenőrzés: fizikai admission minden transport retry előtt, mentett request count megtartva, DB-current checkpoint/artifact újraellenőrzött, régi V2 sémák és legacy ready út változatlan. N06 előtt a konfiguráció továbbra elutasítja a narrative-v1 aktiválást; teljes Shared identity és memóriafold még nem kész. Valódi provider hívás és éles változtatás nem történt.

## N06 memóriafold és privacy integráció

A LifeRepository belső, explicit cohort konfigurációjához narrative-v1 queue építés készült. Az env parser továbbra elutasítja ezt a módot, amíg N07 retry/user-error gate nincs kész. A teljes saját aw_history prefixből kizárólag a validáltMemoryDelta mezők foldolódnak: lezárt/dropped szál kikerül az aktív listából, teljes usedThreadIds referencia megakadályozza későbbi újranyitását. Eredet és határidő nem resetelődik. Actor profil delete/reinsert a legutóbbi igazolt megjelenést rendezi; legfeljebb 12 kerül a promptba. A teljes verified fictionalActorOrigins inventory megmarad szerveroldalon akkor is, ha egy régi profilt méret miatt kihagyunk. A 12 KiB bound megtartja az aktív szálak origin history elemeit és a legutolsó accepted choice-t; előbb excerpt/egyéb history/old choice/pattern, végül a legrégebbi NPC whole unitja hagyható ki.

A server-only snapshot forbiddenActorLabels mezője a supplied initial actor és a saját branchhez vagy saját tanult Shared emlékhez tartozó participant aliasokat tartalmazza; member/user ID is tiltott. A branch jelenlegi actor alias-egyezése szintén tiltott ID-vá válik. Ezek nem model input és nem adnak hozzá privát életrajzot. A core új actor_add labelt és actor profile provenance-t ellenőriz; initial/scenario supplied actor nem válik automatikusan fikcióvá. A server metadata inventory query nem tölt chapter, event summary vagy nyers artifactot.

Withheld ágban nincs delta/choice lekérdezés; a memory query SQL NULL chaptert és üres event listát ad. A queue privacy döntése a legacy history/choice olvasás előtt történik; withheld history metadata-only és choice nem kerül betöltésre. Saját export az érintett artifactot NULL-ra projektálja az adatbázisban, ha bármely saját history branch Shared privacy-je már withheld; a mentett immutable period és régi chapter export nem módosul. Ez kizárólag az új narrative melléklet védelme, nem a későbbi teljes régi személyes próza-redakció munka csendes beemelése.

Saját fork a prefix periodok delta/history adatait örökli, a parent későbbi és sibling periodjai nem kerülnek bele. A fork új accepted optionját a következő terv consequence rekordja használja; aktuális state és input más, a parent tovább olvasható. Public fork/scenario new-life prefix és fictional provenance üres, a reviewed induló canon supplied tény marad. Mindez offline mock transporttal bizonyított, valódi AI és éles módosítás nélkül.

## N07 minőségi javítás és backend-authoritative újrapróbálás

A még nem kiadott narrative 1.0.0 editorial issue kötelező repairScope mezőt kap: prose vagy canon. Ez explicit gépi különbség a változatlan validált kánon alatt javítható próza és az új eseményt/kánont/plan-t igénylő gond között. Bármely canon issue a programból számolt gate-et is elutasítja, még minor severity és önmagában elegendő score/verdict mellett is. A worker quality_failed hibával áll meg új írói kör nélkül; az editor nem kérhet kánon-átírást. Prose low-grade esetén a javítás megkapja a failedDimensions/overall és scoped issues diagnózisát, ugyanazon kánon/terv mellett. A globális tartalmi javítás továbbra legfeljebb egy.

A LifeRepository job DTO retryAvailable booleanja és a retry mutáció ugyanazt a szerveroldali helper-t használja. Payload/checkpoint/report nyersadat kizárólag backend marad. Terminal quality/context/request limitnél nincs új próba; budget vagy megszakítás utáni, még megengedett munka és teljesen bound ingyenes commit esetén lehet. A Shared privacy changed explicit friss-snapshot útja megmarad. A ready/result ceiling kivétel csak minden hash/receipt/domain/gate ellenőrzés után érvényes. A claim kimerült partial countot vagy malformed számot még provider előtt failed-re zár, nem indít költségmentesnek látszó ciklust.

A web csak backend retryAvailable=true mellett mutat gombot. A három új hibakód EN/HU safe üzenetét a meglévő errorMessage forma adja; prompt/modelmagyarázat/score nem kerül a termékfelületre. A korábbi chapter és accepted choice megmarad minőségi stop után. Új source/config támogatja az explicit narrative-v1 cohort queue-t, de az alapérték legacy/üres cohort, és éles beállítást nem módosít ez a fejlesztés. N08 minőségi benchmark és N09 kanonikus release továbbra előfeltétel.

Olvasási ellenőrzés actual global CSS és chapter/prose/decision markup mellett, izolált hosszú szövegfixture-rel történt a helyi böngészőben: 1280px desktop (scrollWidth 1265) és 390px mobile (scrollWidth 375), nincs vízszintes overflow, a fejezet végén mindkét választási gomb elérhető és tördelődik. A hosszú bekezdések között 1em, azaz desktop 18px/mobile 17px térköz javítja az olvashatóságot. Ez layout proof, nem bejelentkezett production E2E vagy minőségi prózaértékelés. A két agent-próbalap bezárva, viewport resetelve, lokális szerver leállítva.

## N06 follow-up: withheld történeti actor profil

A N08 előkészítő source review konkrét guard-hiányt talált: a prompt mémoire kiürült, de a teljes server-only historical actor origin map alapján a planner új actorUpdates rekordban újraállíthatott volna korábbi szerep/vágy/ellenállás/hang profilt. Az új regressziós próba a korábbi validátor mellett hibázott, mert az elfogadta a rekonstruált traitet. A javított domain guard withheld=true mellett csak az aktuális kánon ugyanazon periodján belüli, új actor_addhoz kötött profile update-et enged. A történeti kanonikus actor ID és label önmagában nem felhatalmazás elrejtett traitre. Régi/legacy vagy nem withheld történeti fictionprovenance út nem változik; a branch current canonical állapotát nem írjuk át. Shared participant törlés után a valós DB history/actor_add/profil prefixből érkező rekonstrukció is elutasított. Ez a T11 privacy feltétel javítása, külön source csomagban, paid hívás vagy éles módosítás nélkül.


## N08 összehasonlító harness és N09 előkészítés

A scripts/evaluate-narrative.ts explicit offline/paid/assess belépőt ad, automatikus .env vagy production kulcsfallback nélkül. A külön fejlesztési projekt, reviewed árlista, tiszta source és legfeljebb 5 USD összesített ExperimentAiBudget szükséges paid módban; új out nem nullázza a globális ledgert. A PR #35 eredeti szintetikus próbája 68 fejezetet, 34 vak párt és 222 mock transportot ellenőrzött (a mai reviewed változat 248 hívás): 8×3×2 valódi worker commit, nyolc azonos fixture-kánon writer pár, két owned-history fork pár. Resume nem ismétel completed munkát. Ez nem irodalmi minőségbizonyíték.

A hash-bound szemantikai choice review megállítja a többértelmű párosítást; későbbi review már elfogadott optiont nem cserélhet. A vak HTML és üres pontozási sablon különválik a mode keytől/modelpontoktól. A release csak teljes paid corpus, minden párra emberi pontozás, legalább 20 nem tie full pár, legalább 70% narrative preferencia, öt kritikus dimenzió legalább négyes átlaga, nulla hard/financial/privacy hiba, review-zott choices és tulajdonosi cost/p95 plafon mellett nyílhat. Az értékelés a tartós globális költségledgert újraolvassa; hiányzó per-chapter költséglefedettség fail-closed.

Futtatás/folytatás/pontozás: [NARRATIVE_EVALUATION_HU.md](../operations/NARRATIVE_EVALUATION_HU.md). Konkrét schema/image/backup/replay/drain/rollback manifest és Linux támogatási rés: [NARRATIVE_RELEASE_HU.md](../operations/NARRATIVE_RELEASE_HU.md). A kanonikus Linux reader/funded/daily port nem owner-runtime upgrader. Aktív funded állapotban schema+image+cohort csere előtt külön reviewed Linux funded-upgrade implementáció és fixture kell (Issue #34); original-zero/Windows upgrader nem játszható újra és a meglévő window/ledger nem változtatható. Paid/human és target/apply továbbra külön engedélyezési kapu; éles módosítás nem történt.

A PR #35 eredeti helyi ellenőrzése: 86 tesztfájl, 884 sikeres offline teszt; külön célzott corpus/resume regresszió, teljes build, typecheck, format, schemas, docs és whitespace check. A generált V2/narrative contract fájlok nem változtak. Provider-költés és éles módosítás nulla. A fizetett/emberi benchmark eredményét ez nem helyettesíti.


## Első engedélyezett paid N08 próba és v2 korrekció

A 7bd6df1 main forráson egyetlen kitalált bounded-career profil indult külön fejlesztési projektből, a tulajdonos által jóváhagyott összesített 5 USD kerettel. Tizenöt tényleges transporthívás, 0.296595 USD konzervatív elszámolás és 0.2907117 USD usage-alapú becslés; nulla ismeretlen usage és nulla hozzárendelés nélküli reservation. Ez nem számla és nem teljes corpus.

A legacy első fejezet elkészült. A narrative-v1 első fejezet hét fizikai kérés és egy prózajavítás után quality_failed maradt: az editor sceneCraft/prose/character=3 értéket adott; a megengedett költség és kapu helyesen állította meg. A fix-kánon új írói próba szintén minőségi stop lett. A visszautasított szövegek és receiptek a helyi, source-bound eredményben megmaradnak. A rendszer nem kapott minőségi pass-t és nem kapcsolódott be productionben.

Az első narratív fejezet valódi előrelépése egy tulajdonos nélküli adminisztratív handoff felismerése és az alapfeladat átvételének elutasítása. A próza viszont több bekezdésben ugyanazt értelmezi újra: tisztán követhető lépések még nem jelentik az akadály megoldását. A javítás újrafogalmazott, de nem tömörített eléggé. Ez konkrét minőségi hiány, nem ok az editor pontjainak vagy a kapunak a csökkentésére.

A planner/writer v2 ezért kanonikus eseményben rögzített konkrét cselekvést–ellenállást–választ–eredményt követel, és explicit kimondja a már létező 250–950 kemény tartományt. A 650–950 továbbra puha cél, kevés anyagnál 300–600 szó indokolt lehet; nincs új minimum vagy alacsonyabb minőségkapu. Javításkor a gyenge jelenet újraépítendő és az ismétlés kihagyandó, a kánon változatlan.

A policy ismert planner/writer v1 és v2 verziót fogad, új queue alapértelmezése v2. A provider minden stage promptját a fagyasztott policyból választja: régi v1 job ugyanazt a régi szöveget/verziót kapja, új job az új változatot. Fidelity/editor, modell, hét kérés, egy javítás és a minőségi threshold változatlan. Nincs migráció vagy live config változtatás.

A fix-kánon eredeti contract-fixture csak egy meg nem nevezett „konkrét megfigyelést” mondott ki. Ebből az író új kánon kitalálása nélkül nem építhet megfigyelhető jelenetet. A benchmark külön, determinisztikus, nyolcprofilos, szerző által írt eseményanyagot kap: egy konkrét akadály és cselekvés mindkét writernek pontosan ugyanaz. A történeti N00 baseline-fixture nem változik, az eredeti sikertelen fizetett mérés sem törlődik. Ez a bemeneti mérőanyag korrekciója, nem visszamenőleges sikerigazolás.


## N08 több időszakos paid diagnózis és célzott korrekció

PR #36 a fejlesztési főág része, 886 offline teszt és CI sikeres. A v2 első fejezete hét kérésből, egy javítás után átment (671 szó, mind a nyolc modell-editor pont 4). A jóváhagyott ismételt élő próba folytatása viszont négy kérés után terminal quality fail: megismételte a hat kérés / öt lezárás / egy függő ügy és újabb korlátozott ajánlat mintáját. A memória tartalmazta az eredményt, az elfogadott választást és a kitalált szereplő hangját; nem emlékezethiány volt. Az editor kánonszintű újszerűségi hibájára helyesen nem indult prózajavítás. A fix-kánon minta második konkrét következménye és megnevezett alternatívája is elégtelen maradt. N08/N09 nyitott, nincs teljes/human PASS.

Az első két forrás közös költsége 40 hívás, 0.868235 USD accounted / 0.814835 USD usage-becslés, minden usage ismert. A később PR #37-ben beolvadt korrekció új planner v3 promptot fagyasztott. A v1 és v2 teljes prompt/receipt viselkedése megmarad; writer v2, fidelity és editor változatlan. Az új tervező a közelmúlt eredményét és záró dilemmáját együtt hasonlítja össze; a szándékosan megismételt cselekvést új következményig viszi, és nem indítja újra hallgatólagosan a már elért feltárási célt. Nem kötelez sikerre vagy látványos konfliktusra, nem írhat felül elfogadott választást vagy privacy-határt. A valódi szövegmérés fogja eldönteni, hogy ez elég-e.

A külön szerzői fix-kánon három eseményt ad mindkét írónak: első kísérlet, annak ellenőrzéséből eredő konkrét következmény, név szerint megadott két következő cselekvés. A döntés nem ad előre képességet vagy mesterségesen csökkentett heti órakeretet. Ez a kézzel szerkesztett mérőanyag javítása, nem az alkalmazás plannerének irodalmi bizonyítása.

A minőség elsődlegessége tulajdonosi döntés. A riport külön számolja az összes, aktuális forrásból indult teljes narrative próbát, a kapun átment fejezeteket, az elutasított próbák árát, és az összes ilyen költség / elfogadott fejezet hányadost. Javítások eleve a próbák költségében vannak; fixed-canon/fork és korábbi fejlesztési források külön sorok. Nulla elfogadott fejezetnél nincs véges egységköltség; hiányzó költségkötésnél nincs megbízható becslés. A modellkapu és a humán elfogadás továbbra külön feltétel. Az eredeti legfeljebb 5 USD fejlesztési limit és a production korlátok változatlanok.


## N08 módosítás: tervellenőrzés a próza előtt

A tulajdonos a történetminőséget elsődlegesnek rögzítette, magasabb előállítási költség esetén külön gazdaságossági vizsgálattal. PR #37 után két kitalált profil 35 új hívása 0.763765 USD accounted mellett nem igazolt tartós minőséget: három teljes új próbából egy ment át, a karrier karakteressége és az alkotói második döntés ismétlődése elbukott. Az összes fejlesztési költés 75 hívás, 1.632 USD accounted, minden usage ismert. A fix-kánon próbák külön authored `centralTension` feltételességi hibája a fidelitynél állt meg; ez nem irodalmi ítélet. Az eredeti kimenetek és a közös 5 USD limit megmaradnak.

Az eredeti négyhívásos terv célzott módosítása: az új `reviewedNarrativePolicy()` snapshot külön `life_narrative_plan_review.v1` feladatot és writer v3-at rögzít. A meglévő `narrativeV1Policy()` factory és minden korábbi queue policy négy feladatos, hétkéréses viselkedése változatlan. A selected narrative-v1 új queue-ja kapja az ellenőrzött policyt; default legacy és üres cohort változatlan, éles aktiválás nincs.

Új normál sorrend: planner → domainvalidáció → tervellenőr → writer → fidelity → prose editor. A tervellenőr nem pontoz még meg nem írt prózát. Négy dimenziója: okság, főszereplői cselekvőképesség, újszerűség, választási tét. Mindegyik legalább 4, major issue nélkül; a modell verdict mezője nem írja felül a számított kaput. Az ismételt cselekvés lehet választott út, de következménye és végső dilemmája nem ismételhető puszta átnevezéssel. Egy kánonbeli költség csak feltételes, amíg az opciót nem választották.

A visszautasított terv az egyetlen globális tartalmi javítást használhatja replan+újraellenőrzésre. A writer ilyenkor még nem fut. Az új policy legfeljebb nyolc fizikai kérést enged: normál öt, egy prózajavítással nyolc; tervjavítással hét. Minden transport retry is slot, nincs korlátlan próbálgatás vagy automatikus új munka. A régi policy limitje hét marad. A max8 és a tervellenőrzési prompt marker csak együtt valid; nem lehet a plusz slotot a kötelező ellenőr nélkül megadni. USD/user/project/window, lease, napi és concurrent guard változatlan; ez nem production budgetemelés.

Az ellenőrzés exact projected request/candidate/plan/memory/policy hash-hez, valódi receipthez és a writer előtti sorrendhez kötött. Checkpointolt eredmény újrahasználható; megváltozott terv invalidálja az ellenőrzést és a prózát. Prózajavítás nem változtatja a kánont, ezért a változatlan terv ellenőrzése megmarad. Hiányzó, hamis vagy stale review, hiányzó képesség, score3 pass verdict mellett is blokkol. Fully bound ready eredmény a ceilings után is ingyen commitolható.

Az artifact opcionális planningReview és két review hash mezőt kap; az új policyban mindhárom kötelező, a régiben tiltott. A task/ordinal/provenance lista kezeli az új lépést, de a régi hétkéréses artifact nem válik nyolckérésessé. A DB commit újraépíti a review input hash-t és a receipt verzióját a tényleges current kánonból; a web/public DTO változatlanul nem kap artifactot. Nincs SQL-migráció és a 32 KiB artifact limit sem változik.

A writer v3 a rögzített célból és cselekvésből építi a sajátos főszereplői reakciót, és elhagyja a kompetencialeltárt/túlmagyarázott döntésmenüt. Nem tulajdoníthat ismeretlen eredetű hibát, beleegyezést vagy magánéleti motivációt a szereplőnek. Az eredeti writer v1/v2 és planner v1/v2/v3 prompt byte-kompatibilis marad; a külön új promptok csak a frozen marker szerint futnak. Az új referenciafolyamat offline 248 transportot használ 68 fejezethez / 34 párhoz; ez folyamatbizonyíték, nem valódi minőségmérés. N08 és N09 nyitott az új paid/human ellenőrzésig.
