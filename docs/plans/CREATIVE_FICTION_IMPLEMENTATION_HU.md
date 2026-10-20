---
status: active-supporting
owner: personal-simulation
last_reviewed: 2026-10-17
implementation_status: in-progress
---

# Alterward — alkotói szabadság és tartós fiktív életút

Részletes, kódra épített fejlesztési terv és agent-végrehajtási specifikáció.

## Aktuális fejlesztési jelölt — 2026-10-17

A v4 human-quality csomag implementációja új planner/author/reviewer v4 + editor v3/report 1.2.0, qualityPolicy 2.2.0 snapshotot választ. A v1–v3 változatok megmaradnak. Hosszabb dramaturgiai memória, három új minőségkapu és külön teljes sorozatos olvasói értékelés egészíti ki a PR #47-et. Részletek és elfogadási feltételek: [v4 terv](alterward_fiction_human_quality_development_plan_codex.md). Az alábbi PR #47-mérés történeti bizonyíték, nem az új v4 valódi minőségi mérése. F05/F06 továbbra nyitott.

## Korábbi igazolt végrehajtási állapot — 2026-10-16

Issue #45, PR #46 és #47. F00–F04 implementált; az akkor aktuális e5e7ed2 kód teljes CI-je 90 fájl / 966 teszt, Verify/Container sikeres. Az akkori selected planner/author/reviewer v3, editor v2, qualityPolicy 2.1.0 minden dimenzióban >=4-et és külön szekvenciális kapukat követel, owned régi/új scene/nyitó/záró kontextussal. A fork choice-idősorrend javítva; a következményguard változatlan. A 04cee85 forrás két profiljának három-három fejezete és az e5e7ed2 külön prefix-provenance-ú forkja öt-öt hívással, javítás nélkül átment. A korábbi ismétlődő negatív kontroll elutasítva. Ez nem független emberi benchmark vagy teljes végső-forrású release-proof. Globális ledger 229 hívás / 6,79395 USD; az engedélyezett összesen 10 USD-ból 3,20605 USD maradt. F05/F06 emberi/gazdaságossági/rollout feltételei nyitottak.

Az alábbi eredeti induló marker/policy példákat a fenti végrehajtási állapot, az ADR-008 sequence-módosítása és a kanonikus STATUS pontosítja. Az artifact 2.0.0 tárolási verziója megmarad; a korábbi minőségpolicy 2.1.0 és editor report 1.1.0 külön befagyasztott snapshot marad. A régi promptok/reportok továbbra olvashatók.

## 1. Feladat, termékdöntés és a dokumentum határa

Az Alterward személyes alapokra épülő fikciót ad: azt meséli el, mi bontakozhatna ki a felhasználó kiinduló helyzetéből. Az elsődleges eredmény az olvasói élmény. A történet nem a bemenet átfogalmazása, nem életvezetési beszámoló és nem jövőjóslás.

A tulajdonos 2026-10-16-i utasítása alapján:

1. A jelenlegi írómodell marad; nincs modellversenyeztetés vagy modellcsere ebben a munkában.
2. Az író fantáziálhat. A megadott alapokból új szereplőket, találkozásokat, cselekvéseket, helyszíneket, konfliktusokat, eredményeket és fordulatokat alkothat.
3. A felhasználó kifejezetten rögzített tényeit, határait és elfogadott döntéseit figyelembe kell venni.
4. Az új történések legyenek hihetők, okszerűek és következetesen továbbvihetők.
5. A történet eltávolodhat a kezdeti elképzeléstől, ha az odavezető út hiteles. Nem kell az eredeti cél körül végtelen előkészítő köröket futnia.
6. Az élmény és a történet minősége elsődleges; gazdaságosságát mérni kell, nem gyenge prózával helyettesíteni.

Ez a fájl a megvalósítás terve. A tulajdonos később jóváhagyta a teljes végrehajtást (Issue #45); az integrált feature PR a szorosan összefüggő F00–F06 kódot együtt vezeti be, külön commitokkal, automatikus éles aktiválás nélkül. A régi két teszttörténet helyett új creative történetek indulnak. Az alábbi specifikáció mellett a kanonikus STATUS és a PR ellenőrzési eredménye jelöli a tényleges készültséget.

A terv eredeti létrehozásakor: Létrehozása nem módosít alkalmazáskódot, éles konfigurációt, adatbázist, modellbeállítást vagy költségkeretet, nem jelent paid tesztet vagy kiadási engedélyt. A későbbi implementáció során a termékdöntést a kanonikus termék- és architektúradokumentumba is át kell vezetni; a supporting terv önmagában nem írja felül őket.

### 1.1. Kifejezetten nem cél

- Új modell, szolgáltató vagy modellrouter bevezetése.
- Shared, Community és publikus publikálás újraértelmezése.
- Magyar termékkiadás: az aktuális angol történet- és UI-scope megmarad.
- Új billing, előfizetés, allowance vagy funded ablak indítása.
- A felhasználó valódi profiljának kitalált adatokkal frissítése.
- A korábbi sikertelen mérések törlése vagy visszamenőleges sikernek minősítése.
- Minden fejezetbe kötelező új szereplő, sokk, romantika, siker vagy cliffhanger erőltetése.

## 2. Ellenőrzött forrás és kiinduló állapot

Repository: `Muzsy/future_flow`.

Az olvasott munkapéldány:

`/home/muszy/Documents/Codex/2026-10-12/referenced-chatgpt-conversation-this-is-an/work/narrative-evaluation`

Forrásellenőrzés a tervhez:

| Réteg | Ellenőrzött állapot |
|---|---|
| `origin/main`, 2026-10-16-i fetch után | `3b2b53c58facb4a6c513c461700cc44f009d9e1b` |
| Részletesen vizsgált fejlesztési ág | `fix/narrative-plan-readiness` |
| Vizsgált HEAD | `370b73f6e78ae53b7ccc5000480c7721c1875760` |
| Kapcsolódó, még nem beolvadt PR | [PR #44](https://github.com/Muzsy/future_flow/pull/44) |
| Fejlesztési jelölt promptjai | planner v4 / tervellenőr v2 / writer v3 |
| Jelenlegi normál / maximális fizikai hívásszám | 5 / 8 az új reviewed policyban |
| Jelenlegi javítási keret | egy globális tartalmi javítás |
| Promptmemória / artifact felső határ | 12 KiB / 32 KiB |

**A main és a PR-jelölt nem azonos.** Az implementáló agent induláskor frissítse a main referenciát, ellenőrizze PR #44 állapotát és diffjét. Ne dolgozzon abból a feltételezésből, hogy a readiness-v2 már a főágon van. Ha még nincs beolvasztva, dependency PR vagy expliciten dokumentált, célzott átemelés szükséges; másik aktív branchre ne keverjen új munkát.

A tervhez elolvasott belépési források: `AGENTS.md`, `docs/DOCS_INDEX_HU.md`, `docs/STATUS_HU.md`, `docs/DEVELOPMENT_PLAN_HU.md` N00–N09 része, `docs/product/PRODUCT_HU.md`, `docs/architecture/ARCHITECTURE_HU.md`, `docs/plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md`, a kapcsolódó gépi contractok és az alábbi kód.

### 2.1. Mi működik már, és mit kell ténylegesen megváltoztatni?

| Jelenlegi kód | Meglévő képesség | A feladat hatása |
|---|---|---|
| `packages/contracts/src/life-v2.ts` | `LifeInputV2`, typed state, `PeriodCandidateV2`, `actor_add`, opciók és hard/soft constraint | Megtartjuk a domainmodellt; nem hozzuk létre még egyszer a világállapotot. |
| `packages/contracts/src/narrative.ts` | jelenetterv, memória, NPC-profil, szálak, policy, report, artifact | Új verziójú alkotói csomag és történeti tényréteg; régi parser megmarad. |
| `packages/ai/src/narrative-prompts.ts` | verziózott planner/writer/fidelity/editor | A közös boundary ma tiltja az író által hozzáadott tartós helyet, kapcsolatot, eredményt stb. Ezt új policyban kell leváltani. |
| `packages/core/src/narrative-requests.ts` | explicit, hash-elhető model-input projekciók | Az író jelenleg már validált eseményeket kap, és csak fejezetet ad. Új draft → author input és author output kell. |
| `packages/core/src/life-v2.ts` | `simulatePeriodV2`, typed változások és constraint-ellenőrzés | A végső szerzői candidate-et is ezzel kell újrajátszani a valódi alapállapotból. |
| `packages/core/src/narrative.ts` | referencia-, memória-, actor-, szál- és minőségvalidálás | Az új fikció elfogadását külön kell választani az ellentmondástól; az eredetvédelmek megmaradnak. |
| `packages/core/src/narrative-runtime.ts` | input/output binding, artifactépítés, checkpoint-ellenőrzés | Külön draft- és végső szerzői csomag; a commitot az utóbbihoz kell kötni. |
| `apps/worker/src/narrative-processor.ts` | planner → domain → tervellenőr → writer → fidelity → editor | Az új módban a végső tervellenőrzés a szerzői alkotás UTÁN történik. |
| `packages/database/src/lives.ts` | `LifeRepository`, queue idején kiválasztott policy és memória | Új, befagyasztott policy csak új, kiválasztott jobokra. |
| `packages/database/src/narrative-memory.ts` | teljes saját history-prefixből deltafold; 12 KiB promptmemória | Új történeti tények megőrzése és releváns kiválasztása; a fikció nem kerül a valódi profilba. |
| `packages/database/src/narrative-artifact.ts` | teljes saját referenciaállomány és commit előtti ellenőrzés | Új artifact- és szerzői eredetellenőrzés, megfelelő export/privacy projekcióval. |
| `packages/database/src/life-jobs.ts` | candidate, events, állapot, chapter, artifact tranzakciós mentése | Egyazon végső csomag összes részét atomikusan menteni. |
| `scripts/lib/narrative-evaluation-*.ts` | offline/paid corpus, vak párok, ledger, choice-review | Új policyhoz igazított mérés ugyanazzal a modellel; történeti kontrollok megtartása. |

Meglévő korlátok, amelyeket nem szabad véletlenül megkerülni: legfeljebb 30 state-actor; 2–5 esemény; 2–3 jelenet; egy időszakon belül legfeljebb egy új visszatérő actor a narratív validátorban; 6 nyitott szál; 12 NPC-profil a promptmemóriában; a szálak jelenlegi 1–2 időszakos lejárata. Ezek kezdetben maradnak. Az újabb változtatásuk külön, méréssel indokolt feladat; nem minden ilyen bound a történetminőségi hiba oka.

## 3. A kívánt tény- és fikciómodell

### 3.1. Négy fogalom, eltérő jelentéssel

| Réteg | Példa | Mit jelent? |
|---|---|---|
| Felhasználói kiinduló tény | alkalmazottként dolgozik, van partnere, két képen dolgozik | Az induló állapot és eredet megmarad. Ez nem tesz minden értéket örökre változtathatatlanná. |
| Kifejezett határ | nem költözik külföldre; nem akar felmondani; heti legfeljebb két órát vállal | Érvényességi ideje és a felhasználó döntései szerint köt. Nem írható felül az élmény kedvéért. |
| Elfogadott ágbeli fikció | megismert egy szervezőt; a képet elutasították; kapott egy kisebb felkérést | A kiválasztott fiktív életág történeti ténye. A későbbi fejezetek emlékeznek rá. |
| Jelenetbeli részlet | párbeszéd szóhasználata, egy pohár elhelyezése, pillanatnyi habozás | Szabadon alkotható. Tartós következmény esetén releváns része bekerül a történeti emlékezetbe. |

**Fontos különbség:** a „jelenleg alkalmazott” nem azonos azzal, hogy „soha nem válthat munkát”. Az előbbi állapot; az utóbbi csak kifejezett, érvényes felhasználói korlát esetén tiltás. A terv nem változtat minden induló adatot hard constraintté.

Ugyanígy az eredeti cél nem kötelező happy end. Új, hihető irány megnyílhat; a felhasználó fontos elköteleződését viszont nem választjuk ki helyette. A már elfogadott opció végrehajtásához szükséges hétköznapi cselekvéseket az író megalkothatja.

### 3.2. Alkotói jogosultsági mátrix

| Új elem | Megengedett? | Tartós rögzítés / feltétel |
|---|---|---|
| Új párbeszéd, humor, feszültség, belső reakció | Igen | Nem írhat át rögzített személyazonosságot vagy felhasználói értéket; a tartós változást rögzíteni kell. |
| Névtelen eladó, látogató, alkalmi visszajelző | Igen | Eseményhez kötött mellékalak; nem kötelező mindenkit state-actorrá tenni. |
| Új, névvel visszatérő fiktív személy | Igen | `actor_add`, új saját ID, eseményi eredet és NPC-profil, jelenlegi kapacitásokon belül. |
| Új helyszín vagy konkrét alkotásrészlet | Igen | Egyszeri jelenethez történeti tény; lakóhelyváltozáshoz typed `location_set`. |
| Elutasítás, meglepő találkozás, kisebb eredmény, ajánlat | Igen | Oksági alap; esemény és szükség esetén `opportunity_set`. |
| Új készség, pénzmozgás, munkaváltás, tulajdon | Igen, ha a történet és a döntések megengedik | Typed change és domainellenőrzés; nincs prózával végrehajtott állapotváltozás. |
| Már megadott partner fiktív mondata vagy reakciója | A személyes fikción belül igen | Nem valós személyről szerzett új információ; nem Shared-consent és nem valódi profiladat. Tartós kapcsolatváltozást ne rejtsünk egy mondatba. |
| Új privát életrajz/diagnózis valós személyhez, más user titka | Nem | A fikció nem jogosít adatközlésre vagy elrejtett Shared-történet rekonstrukciójára. |
| A fejezet végi még nyitott opció elfogadása | Nem | A fejezet a döntés előtt áll meg; a választás külön user-művelet. |

A promptban a „consent” két értelmét szét kell választani. Egy kitalált szervező a történetben mondhat igent egy találkozóra; ettől nem lesz valós adatmegosztási hozzájárulás. A Shared/adatvédelmi consent kizárólag a szerver által ellenőrzött jogosultság marad.

### 3.3. A hard határok jelenlegi lefedettségi rése

A `factPredicateV2Schema` jelenleg employment/country/asset/liquid-funds predikátumokat ismer. A heti időkeretet és a szabad szöveges tiltásokat nem védi teljes körű, általános determinisztikus constraint-rendszer. Ezt a terv nem állíthatja késznek.

Az új szerzői policy explicit határjegyzéket kapjon az eredeti constraint-leírásokból, goal `unacceptableTradeoffs` és onboarding context mezőkből, pontos eredetjelöléssel. A modell nem írhatja át a forrást és nem generálhat saját felmentést. Ahol létezik typed predikátum, a szerver az elsődleges ellenőr. A szöveges határokat a végső fidelity ellenőrzi; a bizonytalan értelmezést nem minősítjük bizonyított megfelelésnek.

E munkában célzottan javasolt a heti erőforrás-korlát typed lefedése: a meglévő constraint-union új, verziózott `available_hours_at_most` ágával, kizárólag olyan inputnál, amelyben a maximumot a felhasználó valóban rögzítette. A sima aktuális `availableHoursPerWeek` értékből nem szabad automatikusan örök tiltást képezni. A régi szerződések és hiányzó értékek maradjanak olvashatók; az onboarding/constraint létrehozási helyét külön követni és tesztelni kell. A szabad szöveg teljes determinisztikus értelmezése nem reális ígéret.

## 4. Javasolt architekturális döntés

### 4.1. A szerző alkothasson, mielőtt a végső kánont lezárjuk

A puszta promptmódosítás nem elég. Ha az író új eseményt talál ki, de a worker csak a régi planner candidate-jét menti, a következő fejezet nem fog megbízhatóan tudni róla. Ha pedig az ellenőr változatlan marad, az új eseményt elutasítja.

Az új mód neve a tervben **`narrative-fiction-v2`**; ez javasolt új belső policy/mode, nem létező kapcsoló. A pontos név a contract PR-ben véglegesítendő, régi elnevezés új jelentéssel nem használható.

Új normál folyamat:

```text
owned input + aktuális state + korábbi fiktív kánon + felhasználói határok
    → planner: kreatív induló vázlat
    → a vázlat alapvető szerveres ellenőrzése
    → author: végső események + terv + fejezet + történeti tények + memória
    → végső csomag parse, domain replay és referenciaellenőrzés
    → végső tervellenőr: pontosan a szerző által létrehozott történet
    → fidelity: összhang a felhasználói alapokkal, végső kánonnal és prózával
    → editor: a megírt történet irodalmi minősége
    → tranzakciós commit
```

Öt normál modellhívás marad: planner, author, végső tervellenőr, fidelity, editor. A tervellenőrt áthelyezzük; nem adunk automatikusan egy hatodik rendes hívást a folyamatba.

Ennek ára: a gyenge vázlatot a modellalapú tervellenőr később állítja meg, ezért egy elutasított terv drágább lehet. Ennek előnye: az író nincs egy már lezárt, szűk eseménylista puszta megfogalmazására korlátozva. Az összevetésben ezt a költséget is mérni kell.

### 4.2. A planner vázlata nem végleges authority

A planner adjon hihető kiinduló irányt, néhány fordulópontot és lehetséges tétet. Ne írja meg előre a teljes prózát és minden megengedett reakciót. Az author ezt szabadon átrendezheti, bővítheti vagy jobb oksági ívre cserélheti a megadott alapok között.

A szerver vázlatellenőrzése kiszűri az idegen scope-ot, rossz revisiont, hibás ID-kat, tiltott typed state-változást és túllépett kapacitást. A vázlat eredménye még nem mentett történeti tény. Ha a vázlat alapvetően hibás, az egyetlen javítás a plannerre fordítható; nem indítunk végtelen replan ciklust.

### 4.3. Az author egy összetartozó végső csomagot adjon

Javasolt új contract — az alábbi TypeScript alak terv, nem már implementált típus:

```ts
type FictionAuthorResultV2 = {
  version: '2.0.0';
  candidate: PeriodCandidateV2;
  plan: NarrativePlan; // egyetlen memoryDelta-forrás: plan.memoryDelta
  storyFacts: StoryFact[];
  chapter: PeriodChapterV2;
};

type StoryFact = {
  id: string; // UUID; saját ágban egyedi és nem újrahasznosítható
  introducedByEventId: string;
  aboutActorIds: string[];
  kind: 'encounter' | 'artifact' | 'setting' | 'relationship_detail'
      | 'promise' | 'outcome' | 'observation';
  assertion: string;
  supersedesFactId: string | null;
  relevance: 'scene' | 'continuity';
};
```

Az author a teljes candidate-et adja vissza, nem tetszőleges JSON-patch-et. Az új candidate-et a szerver a job tényleges kiinduló state-jéből teljesen újrajátssza. Így ugyanaz a validáció védi, mint a mostani planner-javaslatot.

Változtatható: új események, az események tartalma, a végső új döntés alternatívái, jelenetek, új megengedett fiktív szereplő és typed változások. Nem változtatható: life/branch/period scope, baseRevision, időszakhatárok, tulajdonos, accepted history/choice, source input, privacy, policy, már létező entitások azonosítója és eredete.

A draftban még csak javasolt új ID-t az author elhagyhatja. Történeti, már elfogadott ID-t nem cserélhet le. A draft → final megfeleltetés belső diagnosztika lehet; nem szükséges új modellhívás hozzá.

### 4.4. Mire kell külön StoryFact, ha már vannak események?

A state a munkát, pénzt, helyet, szereplőazonosságot és egyéb typed állapotot kezeli. Az események a nagyobb történési egységeket. A StoryFact olyan konkrétumot őriz meg, amely a következő fejezethez fontos, de nem külön state-mező: milyen kétértelmű képet készítettek, miért utasították el, ki milyen ígéretet tett, melyik tárgyhoz kapcsolódik a konfliktus.

Nem minden mondatból készül adatbázis-bejegyzés. Az author csak a visszahivatkozásra alkalmas tényeket listázza. A múló díszlet szabad; a történetet megváltoztató eredmény nem bújhat el puszta díszletként.

Kezdő kapacitásjavaslat: legfeljebb 12 új StoryFact/időszak, egy assertion legfeljebb 300 karakter, a lista legfeljebb 6 KiB UTF-8. Ezek mérnöki kezdő boundok, nem bizonyított optimumok. A végső artifactnak továbbra is bele kell férnie a 32 KiB keretbe. Határteszt és valós csomagméret nélkül ne emeljük őket. Túlcsordulásnál teljes mezőket tömörítő, egyetlen javítás vagy szabályos stop kell; csendes szövegcsonkítás nem megengedett.

A StoryFact nem lehet alternatív state-motor: „kifizették a megrendelést” mellé szükséges a megfelelő typed pénzügyi változás, ha az állapotot érinti; „találkoztál egy szervezővel” önmagában nem állásváltozás. A fidelity explicit vizsgálja a prózában vagy StoryFactban elrejtett typed hatást.

### 4.5. Új canon elfogadása

A szerzői csomag javaslat, amíg az ellenőrzés és a tranzakciós commit meg nem történt. Utána az új események és validált StoryFactok az adott fiktív ág kánonjává válnak. Nem állítjuk, hogy ezek a felhasználó valós életében megtörténtek.

Nem kell minden apró fordulathoz felhasználói engedély. A végső döntésnél viszont meg kell hagyni az érdemi választást. Korábban elfogadott terv megvalósulhat, más szereplő válaszolhat, történhet kudarc vagy váratlan lehetőség; új, nagy személyes elköteleződést nem fogadunk el észrevétlenül a felhasználó helyett.

## 5. Ellenőrzés: az ellentmondást szűrjük, az alkotást ne tiltsuk

### 5.1. Determinisztikus szerveres validáció

Az új core-validátor ellenőrizze:

1. Scope/revision/dátum és hat hónapos időszak pontos egyezése.
2. Friss, egyedi új ID-k és kizárólag saját, megengedett történeti referenciák.
3. Typed state-változások helyes sorrendje, preconditionök, hard constraint-ek.
4. Az új actor az első használata előtt létrejön; nem valós/Shared identitás másolata.
5. Minden StoryFact aktuális eseményhez kötődik; az actor-hivatkozás ismert és időben érvényes.
6. A supersedes cél korábbi saját tény, nem sibling/future tény; nincs ciklus vagy azonos ID-n átírás.
7. A jelenet, memoryDelta, chapter eventIds és végső decisionId ugyanazt a végső candidate-et írja le.
8. A fejezetvégi döntés még nyitott; option-változások nem jelennek meg már megtörténtként a végállapotban.
9. A thread-eredet és határidő megmarad; lezárt ID nem használható újra.
10. Méret-, darabszám-, artifact-, policy- és physical request-boundok teljesülnek.

Azt, hogy egy mondat valóban hihető-e, nem lehet pusztán JSON-sémával bizonyítani. A szerveres kapu nem állíthat magáról teljes szemantikai tényellenőrzést.

### 5.2. Végső tervellenőr

A végső candidate + terv + StoryFact + engedélyezett history alapján értékel. Nincs több olyan követelmény, hogy minden fordulat már a planner draftjában szerepeljen. Új tény önmagában nem issue.

Vizsgálat: okozati lánc, hihető lépték, főszereplői cselekvés, döntési tét, az előző időszakhoz képest érdemi változás, a felhasználói határok, szálak és új tények összhangja. A readiness-kapuk megmaradnak, de a végső szerzői csomag teljességét értékelik.

A modellnek különbséget kell tennie: „nem volt a bemenetben” — megengedett fikció; „ellentmond a felhasználó érvényes tiltásának” — hiba; „megváltozik valami, és van hozzá folyamat meg typed változás” — megengedett fejlődés.

### 5.3. Fidelity

Új, verziózott hibakategóriák: `anchor_conflict`, `hard_boundary_violation`, `accepted_choice_conflict`, `state_mismatch`, `continuity_conflict`, `unregistered_material_fact`, `privacy_violation`, `chronology_error`, `unresolved_choice_consumed`.

Ne legyen általános `new_fact_is_forbidden` szabály. Az `unregistered_material_fact` azt jelenti, hogy a próza tartós eredményt vezet be, amely nincs a végső csomagban — nem azt, hogy az eredmény új.

Példa: egy galériás a történetben visszautasít egy képet; ha szerepel a végső eseményben és a releváns tények között, elfogadható. Ha a próza már eladásról és bevételről ír, de csak elutasítás van a csomagban, elutasítandó. Ha a user nem akar eladni, az ajánlat felmerülhet, de elfogadása nem történhet meg helyette.

### 5.4. Irodalmi editor

A jelenlegi nyolc dimenzió megmaradhat: causality, momentum, sceneCraft, character, personalization, choiceStakes, novelty, prose. Az új policy saját prompt- és quality-verziót kapjon. Nem a küszöb csökkentése a megoldás.

Pozitív mérce: van-e kíváncsiság, átélhető jelenet, saját akarattal rendelkező szereplő, meglepő, mégis visszatekintve érthető fordulat, döntésből fakadó következmény és jó ritmus? Nem kell az eredeti célt minden bekezdésben említeni, ha a történet felismerhetően abból nőtt ki.

A „reális” nem azonos a „semmi különös nem történik” elvvel. Egy csendes fejezet is lehet kiváló; a hat hónapon át ismétlődő tervezgetést nem jutalmazzuk felelősségteljességként. A következő fejezet iránti kíváncsiságot mérjük, de nem írunk elő kötelező mesterséges cliffhangert.

Az editor ugyanaz a megtartott modell lehet külön hívásban. Pontszáma diagnosztikai és kiadási részfeltétel, nem független emberi minőségbizonyíték.

## 6. Memória, ágak és adatvédelem

### 6.1. Tartós tárolás és promptmemória külön réteg

A teljes validált StoryFact-lista a period artifact új verziójában marad. A state/candidate/events továbbra saját meglévő mezőjükben élnek; ne másoljuk a teljes candidate-et ismét a 32 KiB artifactba. Az author receipt outputHash a teljes eredeti csomagra köt, az artifact a validált, szükséges mellékletet tárolja.

A `plan.memoryDelta` marad az összefoglaló/szál/NPC-frissítés egyetlen forrása. A StoryFactok nem helyettesíthetik a typed state-et és nem jelenthetnek párhuzamos, eltérő igazságot.

Első megvalósítás: verziózott JSON artifact a meglévő nullable oszlopban. A `038_narrative_artifacts.sql` már létrehozta ezt az oszlopot; pusztán új JSON-verzió miatt nem kell új oszlop. Új tábla vagy index csak indokolt lekérdezési/performance igény esetén. Ettől még export, restore, privacy és schema-kompatibilitási ellenőrzés kötelező.

### 6.2. A következő fejezet bemenete

Az új memóriafold:

1. Csak a saját ág tényleges `aw_history` prefixét járja be, kronologikusan.
2. Validált artifactból olvas; nyers prózából nem következtet vissza állapotra.
3. Kezeli a régi artifact nélküli, régi narrative és új creative periodokat ugyanabban a prefixben.
4. Felépíti az aktív történeti tények és azok eredetének belső inventoryját.
5. A promptba kiválasztja a jelenlegi céllal, döntéssel, aktív szállal és visszatérő szereplővel összefüggő tényeket, 12 KiB teljes kereten belül.
6. Előbb az excerpt és elavult részlet marad ki; a legutóbbi választás, aktív ígéret és szükséges eredet ne tűnjön el csendben.
7. Ha a szükséges minimum sem fér be, szabályos context-hiba; ne karakterenként csonkoljunk állításokat.

Az elhagyott adat megmarad a tartós történetben. A teljes referencia-inventory szerveroldali, nem kerülhet véletlenül model contextbe. A szerveres ID-lista nem jelent teljes szemantikai ellentmondásdetektort: a relevanciakiválasztást célzott hosszú-prefix tesztekkel kell igazolni. Régi, kimaradt fontos részlet szükségessége esetén a saját historyból célzott visszatöltés kell; az agent ne ígérjen korlátlan, hibátlan emlékezetet 12 KiB-ból.

Kezdő megoldásként determinisztikus kiválasztás elegendő: legutóbbi tények + nyitott szálhoz, aktuális actorhoz és utolsó választáshoz kötött tények. Új embedding/RAG szolgáltatás nem szükséges ehhez a scope-hoz.

### 6.3. Fejlődés és retcon

A múltban elutasított kép később elfogadható; ez új esemény. Ne írjuk át a korábbi elutasítást. A `supersedesFactId` az aktuális helyzet változását jelölje, miközben a korábbi tény és dátuma megmarad. Példa: „a szervező még nem válaszolt” → később „a szervező visszautasította”. Az „előzőleg sosem utasították el” ellentmondás.

Az NPC vágyai és kapcsolatai fejlődhetnek. Az origin ID nem változik, a frissülés az aktuális eseményhez kötött. A véglegesített történet nem lesz észrevétlenül újragenerálva.

### 6.4. Fork és privacy

- Saját fork csak az elágazási pontig tartó tényeket örökli. Parent későbbi és sibling események nem kerülnek át.
- Friss Scenario/public fork nem kap személyes történeti tényeket pusztán hasonló szereplőnév miatt.
- `withheld=true` esetén a jelenlegi üres történeti narratíva-szabály kiterjed az új tényekre is; elrejtett történetet nem rekonstruálunk.
- A supplied/Shared identitás nem alakítható át fiktív NPC-vé az eredetellenőrzés megkerülésével.
- A szereplő fiktív reakciója nem frissíti a valódi base profile-t, a Shared common canont vagy más user személyes state-jét.
- Saját export csak a megengedett artifactot adja; nyers model prompt, szerveres tiltólista és receipt belső tartalom ne kerüljön automatikusan a web DTO-ba.
- Delete/revoke/export/public-preparation útvonalak és restore privacy-guardok mind kapjanak új verziós fixture-t.

## 7. Hívás-, javítási és költségmodell

### 7.1. A hívásszám változása explicit tervezési döntés

Az új policy normál útja öt hívás. Egy későn észlelt, történeti szerkezetet érintő hiba javításához azonban author → végső tervellenőr → fidelity → editor négy hívás kell. Ezért az új módhoz **javasolt maximum 9 fizikai kérés**, egy globális tartalmi javítással.

| Út | Legfeljebb szükséges tartalmi hívás |
|---|---:|
| Normál | 5 |
| Tisztán prózajavítás, változatlan végső candidate/plan/facts/delta | 8; a végső tervellenőrzés újrahasználható |
| Teljes author-csomag egyszeri javítása a legkésőbbi kapunál | 9 |

Ez nem a jelenlegi max8 csendes átírása. Az új policy saját maximumot, schema-boundokat és receipt-ordinal tartományt kap; régi job max7/max8 marad. Minden transport retry beleszámít, ezért hálózati hibánál nem garantált, hogy a teljes tartalmi út még belefér. A budget/lease/privacy guard minden fizikai próbánál megmarad.

Ha a max9 nem fogadható el a későbbi kiadási döntésben, korrekt alternatíva a max8 megtartása és a késői strukturális hibák terminális lezárása. **Nem** megengedett a kilencedik hívás elrejtése, külön jobként indítása vagy a ledger nullázása. A terv alapváltozata a verziózott max9, mert a történet egyszeri érdemi javíthatóságát támogatja.

### 7.2. Javítás tartalma

- `prose_only`: a story body/title javulhat, a végső candidate/plan/StoryFact/delta változatlan. Új lasting fact esetén már nem prose-only.
- `author_package`: egyszer újraalkotható az author teljes végső csomagja az eredeti user input és history alapján; minden ráépülő ellenőrzés újra lefut.
- Planner draft javítás: a globális javítási lehetőséget fogyasztja; később nincs még egy ingyenes author-javítás.
- Második tartalmi hiba: terminális quality stop; az előző fejezet és elfogadott választás megmarad.

A felhasználó felületén biztonságos, érthető hiba jelenjen meg, ne belső model-score vagy promptmagyarázat. Retry továbbra backend-authoritative; nem indítunk korlátlan fizetett ismétlést.

### 7.3. Pénzügyi kontroll

Nem változik a modell, a user/project/window USD-cap, a napi keret, a concurrency és a meglévő ledger. Az author nagyobb strukturált outputja több tokent és nagyobb késleltetést okozhat; a változatlan öt hívás nem jelent változatlan költséget.

Utolsó ellenőrzött külön fejlesztési ledger: 140 hívás / 2,985975 USD konzervatív elszámolás; az eredeti összesen 5 USD engedélyből 2,014025 USD maradt. Ez 2026-10-16-i kiinduló adat, nem új költségkeret. A későbbi agent futás előtt újraolvassa a tényleges ledgert. Új policy, source vagy outputkönyvtár nem indít új keretet.

Mérendő: összes próbálkozás költsége, elutasított próbák/javítások, modellkapun átment fejezet költsége, emberileg elfogadott fejezet teljes költsége, p50/p95 késleltetés, first-pass és repair-pass arány. A teljes emberi benchmark várható költségét előbb becsülni kell; ha nem fér bele a maradékba, új paid munka csak a többlet tényleges engedélyezése után végezhető. A dokumentum létrehozásával nem költünk a keretből.

## 8. Checkpoint, receipt és tranzakciós biztonság

Az új workerben a draft és a végső csomag külön checkpoint mező legyen. A jelenlegi `planningResult` új jelentéssel való felülírása hibás, mert a régi receipt-/binding-logika a planner kimenetéhez köti a commitot.

Új kötési minimum:

- eredeti input/state/revision/policy/privacy snapshot hash;
- planner draft input/output hash és receipt;
- author request inputHash és a teljes author result outputHash;
- végső candidateHash, canonHash, finalPlanHash, storyFactsHash, memoryDeltaHash, chapterHash;
- végső review pontos input/output hash és receipt;
- fidelity/editor pontos input/output hash és receipt;
- referenceHash a tényleges saját history-prefixből.

A DB-complete újraszámolja a végső domaineredményt és a kötéseket a current job/adatbázis alapján. Hamis `passed=true` flag, elavult tervellenőrzés vagy módosított author output nem elég a commithoz.

Invalidálási szabályok:

| Módosult adat | Újra elvégzendő ellenőrzés |
|---|---|
| Csak próza/title | chapter-validáció, fidelity, editor |
| Candidate, plan, StoryFact vagy delta | domain replay, végső review, fidelity, editor |
| Revision, privacy, history-prefix vagy policy | régi eredmény nem használható az új scope alatt; meglévő stale/privacy szabály szerint új snapshot vagy stop |

Kész, teljesen kötött eredmény újraindulás után ingyen commitolható a mai szabály szerint; nincs új providerhívás pusztán a worker újraindulása miatt. Félkész author output nem kerülhet látható fejezetként az adatbázisba.

## 9. Fejlesztési munkacsomagok, sorrend és készfeltételek

Minden csomag önálló Issue/feature branch/PR, a repo workflow-jával. Nem szükséges új chat vagy külső agent indítása. Az alábbi azonosítók e terv helyi munkacsomagjai, nem létező GitHub issue-számok.

### F00 — Alapállapot és kanonikus termékdöntés

**Függőség:** nincs.

Feladat:

1. Main fetch, PR #44/readiness és a kiadási ágak ellenőrzése; forráshash rögzítése.
2. A tulajdonosi fikciós szabály átvezetése a `docs/product/PRODUCT_HU.md` és `docs/architecture/ARCHITECTURE_HU.md` dokumentumba.
3. ADR a késleltetett végső kánonzárásról, a final author package-ről, az új módról és a verziózott 5/max9 policy-javaslatról. ADR-számot az aktuális repo alapján választani.
4. E terv repository-változata: `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`; link a Docs Index és Development Plan megfelelő pontján.
5. A korábbi N00–N09 eredmények maradnak; az új fejlesztés és a régi mérési bukások külön státuszt kapnak.

**Kész:** egyértelmű authority, forrás és scope; nincs olyan állítás, hogy az új fikció már implementált vagy kiadott. Dokumentációellenőrzés zöld.

### F01 — Új szerződések és determinisztikus szabályok

**Függőség:** F00.

Érintett: `packages/contracts/src/narrative.ts`, contract exportok/schema-generálás, `packages/core/src/narrative.ts`, `packages/core/src/life-v2.ts`; célzott heti időpredikátumnál `packages/contracts/src/life-v2.ts` és constraint létrehozás/ellenőrzés.

Feladat:

- Új mode/policy/context/author-result/StoryFact/artifact-v2 típusok; régi strict sémák és parserágak befagyasztása.
- Új prompt-, memory-, quality- és artifact-verziók explicit együttese; önkényesen kevert verziók tiltása.
- Final package validátor, `simulatePeriodV2` replay, StoryFact-eredet/supersession és typed-state konzisztencia.
- Egyértelmű prose-only és author-package repair szerződés.
- A max9 és ordinal/receipt darabszám minden kapcsolódó hardcode-jának felmérése.

**Kész:** új, hihető találkozás/eredmény elfogadható; hard határ sértése, idegen ID, rejtett option-elfogadás, stale revision és aliascsere elutasított. Régi fixture-ek módosítás nélkül parse-olhatók. Generált sémák szinkronban.

### F02 — Alkotói provider és új, tömör promptok

**Függőség:** F01.

Érintett: `packages/ai/src/narrative-prompts.ts`, `packages/ai/src/index.ts`, `packages/core/src/narrative-requests.ts`, provider capability/exportok.

Feladat:

- Új kreatív planner és author belépő; explicit inputprojekcióval, szerveres referenciaállomány nélkül.
- Végső review/fidelity/editor az author csomagjára, az új szabályokkal.
- Új promptok önálló szövegként készüljenek, ne a régi hosszú tiltáslistára hozzáfűzött kivételekként.
- Az author kérésben legyen világos: „a draft kiindulás; alkothatsz új történetet; a végső csomag minden tartós következményét rögzítsd”.
- A modell és a szolgáltatói routing marad; minden normál hívás ugyanazt a jelenlegi modellt használja. Automatikus olcsóbb fallback ne jelenjen meg.
- Output tokenlimit felülvizsgálata a candidate+plan+chapter+facts összméretére; méretbecslés nélkül ne másoljuk át a puszta fejezet limitjét. Először offline token/karakter és schema stresszteszt.

**Kész:** mockolt valódi providerút parse-olja az új outputot, receiptje a teljes author-csomagra köt; prompt injection nem írja felül a rendszerszabályt. Régi promptverziók és inputHash-ek változatlanok.

### F03 — Worker, egyszeri javítás és atomikus véglegesítés

**Függőség:** F01–F02.

Érintett: `apps/worker/src/narrative-processor.ts` vagy új, külön v2 processor; `packages/core/src/narrative-runtime.ts`; `packages/database/src/life-job-state.ts`, `life-jobs.ts`, `narrative-artifact.ts`, `jobs.ts`; capability dispatch.

Feladat:

- Új állapotgép a 4.1 szerinti sorrenddel, régi út változtatása nélkül.
- Külön draft/author/final-review checkpoint és minden binding újraszámítása.
- Egy globális javítás, tartalmi típus szerinti invalidálás, minden retry előtti fizikai admission.
- Final candidate alapján állapot-, döntés-, fejezet- és artifact-mentés egy tranzakcióban.
- Backend retryAvailable és safe hibaágak támogatása az új módban is.

**Kész:** normál öt hívás; maximum kilenc fizikai kérés; egyszeri javítás; stale/replayed/hamis review nem commitolható; ready checkpoint resume nulla új paid kérés; késői hibánál nincs részleges állapot.

### F04 — Történeti tények, memóriafold, fork és privacy

**Függőség:** F01, F03 artifact-alak.

Érintett: `packages/database/src/narrative-memory.ts`, `narrative-artifact.ts`, `lives.ts`, export/delete/public-preparation kód; a tényleges érintett útvonalakat az agent `rg`-vel kövesse végig. Az új table/column szükségességét ne feltételezze előre.

Feladat:

- V1/v2 vegyes history delta/fact fold, tartós eredet és supersession.
- Bounded promptmemória, releváns ténykiválasztás és hosszú-prefix mérés.
- Saját fork prefix-öröklés; parent/sibling jövő kizárása.
- Withheld/revoke/export/public-preparation adattípusok és projekciók frissítése.
- Valódi profile-versus-fiction elkülönítés regressziós próbája.
- Restore/recovery kompatibilitás az új artifact/policy/parser verzióhoz; igény esetén célzott migráció és a teljes migrációs védelem.

**Kész:** újranyitás és több fejezet után ugyanaz a fiktív személy, ígéret és műalkotás marad; elrejtett adat nem szivárog vissza; valódi profil nem módosul; régi periodok olvashatók.

### F05 — Valódi történeti tesztanyag és emberi mérce

**Függőség:** F02–F04 futtatható offline állapotban.

Érintett: `scripts/lib/narrative-evaluation-fixtures.ts`, `-runner.ts`, `-contract.ts`, `-artifacts.ts`, `-options.ts`, `-costs.ts`; `scripts/evaluate-narrative.ts`; `docs/operations/NARRATIVE_EVALUATION_HU.md`.

Feladat:

1. A régi fixed-canon kontrollokat változatlanul megőrizni: azok a régi, lezárt kánonból dolgozó író képességét mérik.
2. Új creative kontroll: ugyanaz a kiinduló profil, fix határok és elfogadott választások; az események szabadon alakulhatnak. Nem kell szóról szóra azonos kánont előírni egy szabad alkotás méréséhez.
3. Azonos modell és azonos bemeneti alapok mellett a régi pipeline és az új creative pipeline összehasonlítása. Ez rendszer-összehasonlítás, nem modellverseny és nem izolált egyutasításos kísérlet.
4. Külön állítás a hard-validitásról, a modell editor-eredményéről és a valódi emberi élményről.
5. Source/policy/input/output hash, receipt, fejezetenként teljes költség; külön új mérési verzió. Régi source-bound mérés nem resume-olható át eltérő policyra.
6. Több időszakos choice-review: a kreatív ágak eltérő opcióihoz ne fabrikáljunk egyenértékűséget. Egyértelmű, előre rögzített tesztelői szándék használható; többértelmű párosításnál a runbook szerinti review kell. Ez nem a történeten belüli minden új esemény engedélyeztetése.

**Kész:** offline corpus és hash-bound export; paid futás csak ellenőrzött külön fejlesztési projektből és ténylegesen rendelkezésre álló összesített keretből. A minőségi eredményeket nem állítjuk előre sikeresnek.

### F06 — Zárt pilot, release és visszaállíthatóság

**Függőség:** F00–F05 technikai kész; minőségi és operátori kapuk teljesülnek.

Feladat:

- Új mode támogatása explicit belső cohorttal; default legacy/üres cohort ne kapcsoljon át magától.
- Saját új és meglévő élet, vegyes history, újranyitás, folytatás, választás, fork és export böngészős E2E.
- Az aktuális Linux funded-upgrade/recovery runbook használata. A PR #42 / Issue #34 tényleges állapotát ekkor újra ellenőrizni kell; a terv nem helyettesíti az operátori kaput.
- Reálisan tájékoztató, rövid fikciójelzés az élet létrehozása/olvasása mellett, ha a jelenlegi UI nem elég egyértelmű; ne minden bekezdéshez kerüljön disclaimer. App-web módosítás előtt `apps/web/AGENTS.md` kötelező.
- Rollout után exact source/config/schema readback, megmaradt window/budget/ledger ellenőrzése.

**Kész:** konkrét qualityRelease és operátori proof; nincs rejtett költségkeret-reset. Új mód letiltható új jobokra úgy, hogy a már elkészült történetek olvashatók maradjanak.

## 10. Célzott tesztmátrix

Az alábbiak új, érdemi viselkedési tesztek; ne kizárólag a prompt szövegét másoló stringtesztek készüljenek.

| ID | Eset | Elvárt eredmény |
|---|---|---|
| T01 | Hiányos kiinduló alkotói profilból az author konkrét képet és jelenetet alkot | Nem bukik el pusztán az új részlet miatt; releváns fact mentődik. |
| T02 | Új fiktív szervező találkozása és visszatérése | Valid actor_add/eredet; következő fejezetben azonos személy. |
| T03 | Egy névtelen látogató egyszeri mondata | Megengedett, nem fogyaszt kényszerből recurring actor slotot. |
| T04 | A megadott partner felismerhető fiktív reakciója | Megengedett dramatizálás; nincs Shared-adat vagy valós profilfrissítés. |
| T05 | A user nem költözik; a fejezet mégis külföldi költözést hajt végre | Hard boundary/domain/fidelity stop; nincs commit. |
| T06 | Kezdetben alkalmazott, nincs munkaváltási tiltás; korábbi elfogadott választás alapján vált | Nem akadályozza meg a puszta kiinduló állapot. |
| T07 | Legfeljebb kétórás vállalás mellett a szöveg heti húszórás munkát tényként közöl | Typed lefedettség vagy fidelity elutasítja; az időkorlát nem csak díszlet. |
| T08 | A fejezet végi felkérést a próza már elfogadja | Elutasítás; a döntés a felhasználónál marad. |
| T09 | Korábban elfogadott beküldésre elutasítás érkezik | Megengedett eredmény; nem kell új userdöntés minden külső reakcióhoz. |
| T10 | Bevétel a prózában typed finance változás nélkül | State/fact mismatch; nincs kettős kánon. |
| T11 | Új történés teljesen hihető, de nem szerepelt a planner draftban | Elfogadható végső author-csomagként. |
| T12 | A második időszak emlékszik a konkrét visszautasítás okára | Mentett StoryFactból folytat, nem azonos dilemma újrakezdése. |
| T13 | Ugyanaz a szereplő más nevet, eredetet vagy ismeretséget kap | Referencia- vagy kontinuitáshiba. |
| T14 | Utólagos fordulat: a korábbi bizonytalanság válasszá válik | Új, eredethez kötött tény; a múlt nem törlődik. |
| T15 | Saját fork a második időszak előtt, parent harmadik időszakában új szereplő | Új szereplő nincs a forkban. |
| T16 | Withheld Shared-prefix után korábbi ígéret/NPC rekonstruálása | Tiltott; az új tényréteg is üres/privacy-szűrt. |
| T17 | Actor vagy fact ugyanazzal az ID-val egy sibling ágról | Elutasítás. |
| T18 | Csak prózajavítás | Final review hash változatlan, fidelity/editor új; nincs unnecessary paid újratervezés. |
| T19 | Történeti tény módosul a javításban | Domain/final review/fidelity/editor újra szükséges. |
| T20 | Újraindítás final author után vagy final review után | Csak hiányzó, hash szerint érvényes lépések futnak. |
| T21 | Teljes ready checkpoint a híváslimitnél | Ingyenes commit megengedett a meglévő feltételekkel. |
| T22 | Kilencedik kérés után újabb transport retry | Provider előtt stop, nincs tizedik kérés. |
| T23 | Túl nagy UTF-8 fact/memory/artifact, köztük ékezetek | Byte-limit ellenőrzött, nincs félbevágott állítás. |
| T24 | Régi v1/v2/planner/reviewer policy és artifact fixture-ek | Eredeti parser/prompt/hash/ceiling viselkedés megmarad. |
| T25 | User contextbe rejtett „ignore constraints” utasítás | Adatként kezelve; nem policyfelülírás. |
| T26 | Export, delete/revoke, public-preparation, restore új artifacttal | Ugyanaz a privacy-határ, megengedett saját export és működő recovery. |
| T27 | Hosszú historyből kivágott fontos ígéret/korlát | Visszatöltés vagy szabályos context stop; nem hallgatólagos felejtés. |
| T28 | Csendes, konfliktusszegény, de érdemi következményes történet | Nem bukik meg azért, mert nincs mesterséges dráma. |

Elsődlegesen bővítendő meglévő tesztek: `tests/narrative-contracts.test.ts`, `narrative-plan-review.test.ts`, `narrative-quality.test.ts`, `narrative-ai.test.ts`, `narrative-ai-context.test.ts`, `narrative-worker.test.ts`, `narrative-memory.test.ts`, `narrative-storage.test.ts`, `narrative-integration.test.ts`, `narrative-evaluation.test.ts`. A v2 külön fájlt is kaphat, hogy a régi fixture-ek ne cserélődjenek át az új viselkedésre.

## 11. Történetminőségi mérési terv

### 11.1. Előre megírt, szintetikus profilok

Kezdő kreatív mérőanyag legalább három eltérő élethelyzettel:

1. Munka melletti alkotó, heti két óra, felmondás nélkül. Lehetséges ív: egy kép félreértése → ebből új alkotói kérdés → váratlan, kis léptékű felkérés. Ne legyen kötelező kiállítás vagy siker.
2. Korlátozott idejű munkavállaló, aki új irányt keres. Lehetséges ív: konkrét feladat → érdekütközés vagy valódi eredmény → eltérő felelősséget kínáló döntés. Ne ragadjon örökre adminisztratív pilotba.
3. Személyes kapcsolatot/közösségi életet építő felnőtt. Új találkozás és hétköznapi feszültség megengedett; ne váljon automatikusan romantikus sikertörténetté vagy terápiás tanáccsá.

Mindegyikhez rögzített kiinduló tények, valóban hard határok, soft célok és nyitott részek. Kevés adat is szerepeljen, mert valódi user sem ír regénytervet. A hiányzó részleteket az author találja ki; nem a fixture szerzője írja meg helyette a teljes történetet.

### 11.2. Fokozatos valódi mérés

1. Offline teljes út és negatívtesztek, nulla providerköltség.
2. Kis paid diagnózis egy profil egy fejezetével, ha a tényleges fennmaradó keret engedi. Kézi olvasás: képes-e végre alkotni az új rendszer?
3. Három profil × három időszak és legalább egy ellenkező irányú fork a működő változaton. Ez diagnózis, önmagában nem teljes release benchmark.
4. A kanonikus N08 kiadási benchmark teljesítése, az új verziójú mérési tervvel. A meglévő legalább 20 nem döntetlen teljes pár, legalább 70% preferencia és egyéb human/financial/privacy kapu nem törölhető csendben. Ha a korpuszt más kutatási terv váltja fel, előzetes indokolt, külön dokumentált kiadási döntés szükséges.

Nem várunk részletes prózajóváhagyást minden mondathoz a felhasználótól. A valódi emberi olvasás feladata az élmény értékelése; a rendszert a pipeline építse és vigye végig.

### 11.3. Emberi pontozólap

Vak, véletlen sorrendű fejezetpárok, ugyanazzal a megtartott modellel generálva. Az értékelő ne kapjon modell-editor pontokat vagy policycímkét. A fejlesztői önértékelés hasznos diagnózis, de a kiadási emberi értékeléstől külön jelölendő.

Minden szövegnél 1–5:

- Élvezetes volt olvasni?
- Érdekelt, mi történik a következő fejezetben?
- Sajátosnak és személyesnek érződött?
- Hihető volt az odavezető út és a következmény?
- Voltak átélhető jelenetek és önálló szereplői akaratok?
- Érezhetően számított az előző választás?
- Megmaradtak a rögzített alapok és a korábbi történeti tények?

Plusz: melyiket olvasnád tovább; egy konkrét erős és gyenge részlet; van-e kizáró ellentmondás? Új pilot-célként az élvezet és tovább olvasási kedv átlaga legalább 4/5, nulla hard-boundary/choice/privacy hiba javasolt. Ez további cél, nem a korábbi release-kapuk helyettesítése. Kis elemszámnál ne jelentsünk bizonyított általános minőséget.

## 12. Ellenőrzési parancsok és mérési eljárás

A repo `package.json` szerint Node 24 és pnpm 11.19.0 szükséges. A fejlesztő a saját megfelelő runtime-ját használja; a tervbe nem kerül titok vagy géphez kötött credential.

Minden kódcsomagnál célzott Vitest-futtatás; a v2 end-to-end összerakásakor teljes ellenőrzés:

```bash
pnpm format:check
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
git diff --check
```

A `pnpm schemas` után a generált contract-diffet át kell nézni és a hozzá tartozó változással együtt commitolni. A `pnpm test` buildeli a package-eket; közvetlen scriptfuttatás előtt is szükséges a csomagok aktuális buildje, mert a workspace-importok a distet olvashatják.

Paid parancsot az agent a friss `docs/operations/NARRATIVE_EVALUATION_HU.md` és az implementált CLI alapján állítson össze. Ez a terv nem ad már ma futtathatónak látszó, valójában még nem létező `narrative-fiction-v2` CLI-kapcsolót. Dedikált fejlesztési projekt, kumulatív ledger és output source-binding kötelező; production `.env`-fallback nincs.

## 13. Rollout, rollback és kompatibilitás

1. Régi job a queue idején befagyasztott régi policyval fut tovább. Nem frissítjük át az in-flight payloadot.
2. Új módot először offline, majd külön fejlesztési mérés, aztán belső cohort kap.
3. Meglévő élet folytatható új policyval, ha a vegyes prefix kompatibilitás tesztelt; a történeti fejezeteket nem írjuk újra.
4. Rollback első lépése az új creative queue kiválasztásának letiltása. A már elmentett v2 történetek olvasója/parserje maradjon elérhető.
5. Régi, v2-t nem értő workernek ne adjunk v2 jobot vagy v2 historyból épített, számára értelmezhetetlen payloadot. Szükség esetén a folytatás kontrolláltan szünetel; nem esik vissza kontinuitást elvesztő régi generálásra.
6. Recovery image érti az új artifact/policy/memória-verziót, vagy a runbook dokumentáltan blokkolja az ilyen adatot író munkát. Pusztán korábbi image-tag visszaállítása nem elég.
7. Funded ablak, felhasználói jogosultság, eddigi költés és quota nem indul újra. A kiadás után readback szükséges.

## 14. Kockázatok és kezelésük

| Kockázat | Következmény | Kezelés |
|---|---|---|
| Csak a prompt engedékenyebb, a tárolás régi | Az új találkozás eltűnik a következő fejezetben | Final author package, StoryFact és tranzakciós commit együtt. |
| A végső kánont még mindig a draft határozza meg | Az író továbbra sem tud érdemben alkotni | A végső review és DB replay az author candidate-jére köt. |
| A typed state és a próza eltér | Két egymásnak ellentmondó történet | Végső fidelity és state-replay; nincs prózaalapú közvetlen state update. |
| Minden induló adatot örök tiltásnak veszünk | Újra stagnáló történet | Állapot, határ és preferencia explicit különválasztása. |
| Minden szabad részletet tényként naplózunk | Túl nagy output és memória | Csak releváns történeti tény, mért boundok, kompakt teljes állítások. |
| Az új szabadság véletlenszerű fordulatokat hoz | Érdekesnek látszó, de hiteltelen történet | Oksági tervellenőr és valódi emberi olvasás; nincs kötelező sokkolás. |
| A reális történet ismét csak adminisztráció lesz | Gyenge élmény | Konkrét cselekvés, ellenállás, eredmény; csendes történet is haladjon. |
| Modell editor túl szigorú vagy megengedő | Hamis minőségi ítélet | Vak emberi kalibráció; automatikus és emberi eredmény külön. |
| Késői strukturális javítás drága | Emelkedő fejezetköltség | Egy globális javítás, max9, meglévő USD-cap és teljes költségmérés. |
| Új valós életrajznak tűnő fikció | Felhasználói félreértés | A termékben világos fikciókeret; valódi profil és fictional branch szétválasztása. |

## 15. Becsült ráfordítás és reális ütemezés

A korábbi 4–7 munkanapos előbecslés a meglévő pipeline promptjainak, ellenőrzésének és memóriájának célzott átalakítására vonatkozott. A forrás részletes áttekintése alapján az **író által ténylegesen megalkotható és tartósan megőrizhető új események** biztonságos támogatása szélesebb változtatás: author-output, checkpoint-binding, repair és vegyes history is érintett. Ezt nem helyes puszta promptcserének árazni.

| Szakasz | Becsült fejlesztői ráfordítás |
|---|---:|
| F00–F01: döntés, contract, core | 1,5–2 nap |
| F02: provider/prompt/projekció | 1–1,5 nap |
| F03: worker, binding, repair, commit | 2–3 nap |
| F04: memória, fork, privacy, kompatibilitás | 1,5–2,5 nap |
| F05: mérőanyag és technikai/humán mérés előkészítése | 1–1,5 nap |
| F06: E2E, kiadási előkészítés és tartalék | 1–1,5 nap |
| **Teljes becsült ráfordítás** | **8–13 munkanap** |

Ez mérnöki becslés, nem garantált naptári határidő. Az emberi értékelésre várakozás, a paid keret kimerülése vagy új szemantikai hibák további időt adhatnak hozzá. A minőség elérését a naptári becslés nem bizonyítja.

1–2 nap alatt izolált author-csomag prototípus és első olvasható próba készülhet. Ez nem production-ready memória-/recovery-megoldás. Ha az első olvasás továbbra gyenge, a pipeline mechanikai bővítését nem szabad irodalmi sikernek beállítani; a konkrét jelenet és az utasítás hibáját kell javítani ugyanazzal a modellel.

## 16. Végső elfogadási ellenőrzőlista

- [x] A modell változatlan; nincs rejtett modellteszt vagy olcsóbb fallback.
- [x] A kanonikus termékdokumentáció az új alkotói működést írja le.
- [x] Az író új történést és hihető eredményt hozhat létre, nem pusztán a draftot fogalmazza át.
- [x] Új fikció önmagában nem fidelity-hiba.
- [x] User-fix határ, accepted choice, privacy és state-konfliktus továbbra kizáró hiba.
- [x] A végső state/candidate/plan/chapter/facts/delta ugyanarra a szerzői csomagra köt.
- [x] Új szereplők és releváns részletek több fejezeten át megmaradnak.
- [x] A kezdeti profil változatlan; a fiktív fejlődés külön ágban él.
- [x] Saját fork és withheld működés az új tényréteggel is tesztelt.
- [x] Régi job/policy/artifact és vegyes history kompatibilis.
- [x] A javítás, resume és fizikai kéréslimit nem kerülhető meg.
- [x] Teljes CI és schema/docs ellenőrzés zöld.
- [ ] A szöveget valódi ember is élvezetesnek és folytatásra érdemesnek ítélte; a meglévő release-kapuk teljesülnek.
- [ ] A sikeres és elutasított próbák teljes költsége, illetve késleltetése ismert és vállalható.
- [ ] A kiadás és recovery az aktuális kanonikus Linux-runbook szerint ellenőrzött.
- [x] Nincs automatikus éles aktiválás, új funded ablak vagy ledger-reset.

## 17. Az implementáló agent első konkrét feladata

**Az F05 fennmaradó minőségmérésének lezárása**, a jelenlegi cumulative ledger és az engedélyezett összesen 10 USD maximum megtartásával. Szükséges a végső forráson az alkotói folytatások és fork, többprofilos hosszabb próba, valamint valódi olvasói értékelés. Ezután gazdaságossági/időkorlát-döntés, majd F06 pontos target/recovery proof és külön operátori éles apply. F00–F04 újrakezdése nem szükséges; a kész technikai ellenőrzőpontok fent jelölve vannak.

A végrehajtó ne álljon meg az engedékenyebb promptnál. A fejlesztés akkor teljesíti a célt, ha az író által kitalált, elfogadott történés a következő fejezetben is ugyanannak a személyes, fiktív életútnak a része.

## Következő quality csomag — emberibb v4, 2026-10-17

A [részletes végrehajtási terv](alterward_fiction_human_quality_development_plan_codex.md) a PR #47 utáni állapotra épül. V3 freeze után új v4 prompt-policy és editor v3/report 1.2.0, három új explicit kapu, nyolcperiodusos kompakt signature és hatperiodusos creative-only offline diagnózis készült. A régi benchmark marad; külön hash-bound teljes sequence/fork olvasói értékelés egészíti ki. A jó jelenetírás/StoryFact/owned-prefix architektúra megmarad.

F05 és F06 továbbra PARTIAL: offline készültségből nem lesz emberi vagy éles PASS. Előbb külön editor-kalibráció és H1/H2 olvasói mérés, utána tulajdonosi gazdaságossági/időkorlát- és exact-target rollout döntés kell. A kétprofilos hat-hat fejezet költsége nem vállalható automatikusan a megmaradt development keretből.


## F05 follow-up 045 — v4.1/v5 sequence quality

[045](045_fiction_v4_1_real_quality_iteration.md) starts from merged PR #48 (`058555005e7e85905cf53081bfa18226780cf9ac`). It separately versions a v5 candidate against repeated external-opportunity progression and tidy self-correction, preserves measured v1–v4 and adds synthetic-local repair attempt provenance. The target is two profiles × six main periods plus one alternative third per profile (14 final texts), with separate offline, real provider and human evidence. Five normal/max9 physical requests, one repair, unchanged model/context/privacy/production boundaries. Narrator personas and model experiments are out of scope. Status and real evidence belong in STATUS/evaluation runbook; no literary PASS before human reading.

045 implementáció technikailag ellenőrzött, PR #49 draft / CI 326 PASS; a valódi mérés hiányos (8/14 elfogadott cél, egy elutasított előzmény blokkolja a maradék ötöt). F05/F06 és emberi/minőségi release továbbra PARTIAL; részletek a 045 tervben és a STATUS-ban.

## F05/F06 v6 follow-up — earned life evolution

[V6 terv](045_fiction_v6_earned_life_evolution.md), tényleges base `1e1b4303dd779ad8e8b34970892302583a7f66dd` (PR #49 merge). Új v6/quality2.4/editorv5, explicit frozen v5; az induló élet nem plafon, nagyobb változás erősebb okságot igényel. Nincs fejezetszám szerinti menetrend vagy billing-aware generálás. A v5 goal/actor hibák pontos regressziói és bounded saját-ID projection készülnek, változatlan authority mellett.

Előbb valódi három főági munkahelyi fejezet fork nélkül; hiba esetén fizetett stop, nem újragenerálás zöldre. Csak elfogadható Stage A után külön friss kétprofilos 8+fork (18 szöveg) mérés. Összesen legfeljebb új 8 USD, ugyanazon kumulatív ledgeren. Offline teszt, modellkapu, ügynöki olvasás és független emberi elfogadás külön bizonyíték. F05/F06/N08 PARTIAL; N09/production változatlanul nyitott.

## Élő világ (v9) — contract és core réteg, 2026-10-20

A v9 policy-generáció (`fictionV9Policy()`: planner/author/reviewer v9, editor v8, fidelity v1, `qualityPolicyVersion` 2.8.0, 9 kérés, 1 javítás) a v8-cal azonos stage-gráfot használ; a v8 fagyott, a `fictionPolicy()` továbbra is v8-at ad, a v9 csak explicit kiválasztással aktív (a kiválasztás a következő PR-ban jön, alapértelmezés v8). Terv: [élő világ terv](alterward_v8_living_world_feasibility_audit_2026-10-20.md), szereplőállapot: [ADR-009](../decisions/ADR-009-character-state-artifact-fold.md).

- **Közös artifact-család.** Az artifact módja és verziója (`narrative-fiction-v2`, 2.0.0) nem változik; a v9 mezői opcionálisak és policy-kapuhoz kötöttek: `characterDelta` és a `characterStateHash` / `characterProjectionHash` / `characterDeltaHash` binding pontosan 2.8.0-nál kötelező, máskor tilos. A v1–v8 artifact parse-a bájtra változatlan.
- **Séma-választás policy szerint.** `fictionDraftSchemaFor` / `fictionAuthorSchemaFor`: a v9 draft kiegészül `characterIntent`-tel (legfeljebb 6 szereplő), a v9 author kötelező `characterDelta`-val. Régi policy kimenete soha nem olvasódik v9 jelentéssel.
- **Request.** A `fictionContext.characterProjection` (legfeljebb 8 KiB) csak 2.8.0-nál van jelen, része a kérésnek és annak hash-ének; withheld memóriánál üres.
- **Szerver-oldali envelope.** `NarrativePeriodInput.fictionCharacters` (foldolt állapot, szereplő-eredetek, megadott személyek, relevancia-jelek) soha nem modellbemenet. A belőle újraszámolt projection egyezik a kérésben lévővel, különben `NARRATIVE_CONTEXT_INVALID`; v8-nál az envelope tilos.
- **Delta-validáció** (`validateFictionCharacterDelta`, javítható `NARRATIVE_PLAN_INVALID`): új `actor_add` ugyanabban a periódusban profilt kap; az `actor_remove` és a `removedActorIds` kétirányban egyezik; megadott személynek csak kapcsolati állapota lehet; a `characterIntent` szereplői ismert fiktív szereplők.
- **Hátralévő (PR B2):** fold és projection az adatbázisból, envelope a job payloadban, commit hash-egyezés, kiválasztás (`NARRATIVE_FICTION_GENERATION`), v9 promptok, worker, eval runner.
