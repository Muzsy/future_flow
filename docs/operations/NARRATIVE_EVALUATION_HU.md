---
status: active-supporting
owner: personal-simulation
last_reviewed: 2026-10-18
related:
  - ../plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md
  - NARRATIVE_RELEASE_HU.md
---

# Személyes történetminőség: reprodukálható összehasonlítás

## Aktuális v6 bizonyíték és költési határ — 2026-10-18

PR #50 mért checkpointként beolvadt (`f755a57`, production nélkül) / quality2.5, mért forráscb8b539 (CI340 SUCCESS); későbbi docs-only56062a8 CI341 SUCCESS. Legutóbbi friss B:15/18 elfogadott, alkotói8+fork és munkahelyi6; munkahelyi7–8/fork hiányzik, a következő author teljes előfoglalását budget guard állította meg API előtt. Nincs teljes kétprofilos vagy emberi PASS. V6 összesen22.7396675/23 USD, maradék0.2603325 USD; eredeti globális ledger652/33.4716975 USD, kumulatív plafon33.732030 USD. Minden unknown teljes foglalása megtartva, aktív/hozzárendeletlen0. Új paid futás nem indul. A korábbi keret- és eredményszakaszok dátumhoz/forráshoz kötött történeti checkpointok, nem mai engedélyek. [Aktuális státusz](../STATUS_HU.md), [részletes v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).

## Bizonyítékok és korlátok

A `scripts/evaluate-narrative.ts` N08 mérőeszköz kizárólag a repository nyolc kitalált tesztprofilját fogadja. Minden mód saját tartós, helyi PGlite adatbázist használ a valódi queue/worker/budget/checkpoint/commit útvonallal. Nincs production DB, Auth, saját tesztelői fiók vagy operátori állapot. Az offline mód alapértelmezett, nem hoz létre fizetett SDK-klienst, általános OPENAI_API_KEY mellett is mock transportot használ. A program nem tölti be automatikusan a projekt .env fájlját.

Három külön vizsgálat készül:

- Teljes pipeline: nyolc profil, három időszak, legacy és narrative-v1, 48 fejezet és 24 páros értékelés. Eltérő planner kimenetek megengedettek, ezért ez a teljes rendszer teljesítménye.
- Azonos kánon: nyolc fixture-authored, domain-validált eseménysor és jelenetterv, két writer út, 16 fejezet és nyolc pár. A tervhez nincs hamis planner receipt; ez nem alkalmazási period commit. Első draftokat hasonlít, nincs javítás.
- Alternatív ág: az első két profil második döntésénél ellenkező, előre rögzített szemantikai irány, négy fejezet és két pár. Valódi saját-history fork, a szülő harmadik fejezete nem kerül a child memóriába.

Ez az eredeti legacy/narrative összehasonlító benchmark összesen68 fejezete és34 vak párja. Az akkori tervellenőrzött normál offline út248 mock transporthívás; a mostani creative-only v6 mérés ettől külön célkészlet. valódi hiba/javítás több kísérletet igényelhet. Ez **működési bizonyíték, nem irodalmi minőség**. Az editor modell pontjai diagnosztikai adatok, nem független értékelés.

## Offline futtatás és folytatás

Node 24 és a rögzített pnpm/dependency környezet szükséges. A repo gyökeréből:

```text
pnpm evaluate:narrative --mode offline --out .local/narrative-evaluation/offline-reviewed-source
```

A forráscommit, a tényleges harnessfájlok/migrációk hash-e, modellek, seed és paid project hash kötött. Változó source/models/project esetén új mérési könyvtár kell. Azonos parancs újraindítása a mentett állapotot használja: teljes periodot vagy validált, megfelelő request/output hashhez kötött fix-writer választ nem generál újra. A corpus `.run.lock` fájlja kizárja az egyidejű írót; fizetett módban egy közös paid-run lock is van. SIGKILL után a lockot csak az előző processz igazolt leállása után lehet rendezni; automatikus stale-lock törlés nincs.

A `report.json` tartalmazza a nyers kitalált fejezeteket, kánont, terveket, receipteket, hibaeredményeket, fizikai slotokat, transporthívásokat, latencyt és choice mappinget. A `summary.json` összesít. A `human-review/index.html` olvasható A/B csomag; a `blind-key.json` külön, értékelőnek nem átadandó. A `human-review/ratings-template.json` szándékosan null pontokat tartalmaz. A program hibánál csak safe hibakódot ír, SDK-hiba vagy titokfragmentum nem kerül konzolra.

## Döntések szemantikai párosítása

A profilhoz és időszakhoz előre rögzített intent tartozik; a két rendszer eltérő option ID-ját soha nem párosítjuk puszta tömbindex szerint. Egyértelmű, konzervatív szöveges egyezés folytathatja a fejlesztési futást, de minden mapping emberi szemantikai review-ja kötelező a releasehez. Többértelmű döntés megáll és `choiceReviewRequests` rekordban megadja az options/decisionHash/intent adatot.

A `--choices-file <JSON>` tömb minden eleme: fixtureId, mode (`legacy` vagy `narrative-v1`), periodIndex (0–2), branchKind (`main` vagy `fork`), optionId, decisionHash, intent, legalább 40 karakteres rationale, reviewed=true. Hash és intent pontos egyezése szükséges. Duplikált kulcs elutasított. Már elkészült fejezetnél a review csak a már kiválasztott optiont igazolhatja; más option nem írhatja át a mérési múltat. Review után ugyanazon corpus újraindítása frissíti az értékelési mappingeket és a vak csomagot, provider-költés nélkül.

## Külön engedélyezett fizetett futás

Az elfogadott fejlesztési terv külön emberi engedélyt kér a fizetett benchmarkhoz. Szükséges a konkrét approval azonosító, az engedélyezett **összesített fejlesztési keret** (az aktuális23 USD TOTAL v6 /33.732030 USD kumulatív plafont és annak maradékát a fenti összefoglaló rögzíti), valamint külön fejlesztési OpenAI project és project/service-account kulcs. A korábbi5/10 USD és későbbi v5/v6 bővítések nem összeadható új keretek; az eredeti ledger és a rögzített baseline változatlan. A személyes béta éles kulcsát/windowját/ledgerét nem használjuk. A fájlban tárolt kulcs útvonalát kell az operátornak átadni, a kulcsot nem chatben.

Csak explicit átadott `NARRATIVE_EVAL_API_KEY`, `NARRATIVE_EVAL_PROJECT_ID`, `NARRATIVE_EVAL_PROJECT_CONFIRMATION=dedicated-development` olvasható; általános OPENAI_API_KEY fallback nincs. Az environment marker a kezelő nyilatkozata, nem OpenAI project-ownership API-bizonyíték; a külön fejlesztési projektet az operátornak ellenőriznie kell. Titokfájl a repo/image/report része nem lehet.

```text
pnpm evaluate:narrative --mode paid --allow-paid --budget-usd <APPROVED_TOTAL_USD> --approval-id <APPROVAL_ID> --out .local/narrative-evaluation/paid-reviewed-source
```

Tiszta committed forrás kell. Az SDK explicit OpenAI végpontot, megadott projectet, default service tier-t, store=false-t és nulla SDK retryt használ. A közös provider parser retry minden fizikai kísérlete valódi admission/reservation előtt ellenőrzött; a megőrzött narrative-v1 reviewed policy legfeljebb8 slot, régi snapshotja7 slot, a creative v6/quality2.5 legfeljebb9 slot; mindegyikben egy globális tartalmi javítás. Fix-canon pár legfeljebb hét összesített slot. Nem ismert usage után teljes reservation marad elszámolt; budget denial sem adja vissza a már elfoglalt slotot.

A `.local/narrative-evaluation/paid-usage.json` globális ExperimentAiBudget ledger és `budget-bindings.json` source/case binding minden új out könyvtár mellett is megmarad. Új out/approval nem nullázza. Minden fizetett futás ugyanabból a kijelölt mérőcheckoutból történjen; másik worktree/checkout nem jelent új engedélyezett keretet. Átköltözéskor a ledger/binding eredeti byte-jainak ellenőrzött megőrzése külön kötelező, üres ledgerrel nem folytatható az engedély. Költség: tényleges usage-alapú becslés, konzervatív accounted összeg, ismeretlen usage és peak reservation külön. Ez nem számla. Az árlista 2026-10-15-i hivatalos default/short-context listához kötött; hét nap után új ellenőrzés nélkül nincs paid futás. Modellt/árat csak új review-zott source-ban lehet változtatni. A hard cap kimerülése incomplete mérés, nem ok a keret önálló emelésére.

## Emberi minőségkapu

Az értékelő a vak csomagot kapja, nyers modellpontokat/módazonosítót nem. Minden párt értékeljen: A/B preferencia vagy tie, nyolc dimenzióban 1–5 pont, legalább egy konkrét, valódi bekezdésre mutató indok. A pairHash az adott változatok pontos snapshotjához köt. Megváltoztatott szöveghez régi pontozás nem használható. További reviewerek nem növelik a független mintapárok számát; párszintű többségi döntés, bizonytalan vagy tie-többség esetén tie számít.

```text
pnpm evaluate:narrative --mode assess --out <CORPUS> --ratings-file <HUMAN_JSON> --max-mean-cost-usd <OWNER_USD_PER_CHAPTER> --max-p95-ms <OWNER_P95_MS>
```

A két pozitív költség/idő plafont a tulajdonos állítja be; program nem talál ki termékszabályt. Assessment újraolvassa a globális költségledgert és ellenőrzi a teljes narrative fejezetenkénti költséglefedettséget. A szigorú release kapu feltételei együtt: teljes paid corpus; mind a 34 pár hash-bound emberi értékelése; a 24 full párból legalább húsz nem tie; ezek legalább 70%-ában narrative preferencia; öt kritikus dimenzió átlagban legalább négy; nulla hard failure/unknown financial usage/unassigned reservation/privacy probe failure; minden elfogadott választás reviewed; költség és p95 a külön megadott plafonon belül. Wilson 95% intervallum tájékoztató, nem automatikus felmentés.

Rövid profilrészhalmaz, offline mock, hiányzó pontozás, csupán editor pass vagy hiányzó üzemeltetési plafon mindig zárt release kapu. A negatív vagy hiányos eredmény is megmarad; forrásjavítás után új source-bound corpus és új értékelés szükséges.


## Első paid mérésből származó korrekció

A 7bd6df1 forrás első egyprofilos, 15-hívásos próbája 0.296595 USD accounted / 0.2907117 USD usage-becslés mellett nem ment át: az új fejezet az egyszeri javítás után is ismétlődő és túlmagyarázó maradt. Teljes corpus és emberi pontozás nem történt. Az eredeti eredmény változatlanul megmarad a globális ledgerben és a régi source-hoz kötött könyvtárban.

Az új planner/writer v2 a konkrét kanonikus jelenetanyagot és az anyaghoz igazított tömörséget erősíti; a 650–950 puha cél és 250–950 kemény tartomány nem változik. A fagyasztott v1 prompt tovább támogatott. A fix-kánon fixture külön, szerző által írt, profilhoz illő, konkrét cselekvést–akadályt–választ–eredményt ad mindkét writernek; a régi, csupán szerkezeti baseline-fixture változatlan. A módosított benchmark új source/out kötést igényel, ugyanazon checkout globális költségledgerével: az első 0.296595 USD továbbra az engedélyezett összesen 5 USD része.


## Folytatási ismétlődés és tényleges egységköltség

A v2 paid folytatás kánonszintű ismétlődést talált megfelelő múltbemenet mellett; az első elfogadott fejezet nem bizonyít többfejezetes minőséget. Planner v3 ezt a következmény és záró dilemma szintjén kezeli, miközben a befagyasztott v1/v2 promptok változatlanul futnak. A fix-kánon összehasonlítás három konkrét eseményt és két megnevezett, még meg nem történt cselekvést ad mindkét írónak. Mindez új source/out kötést igényel, ugyanazon globális ledger mellett; a régi hibák megmaradnak.

A summary `narrativeYield` mezője kizárólag az aktuális forrás teljes narrative folytatási próbáit méri: attemptedChapters, gateAcceptedChapters, acceptanceRate, accountedUsd, unacceptedAttemptAccountedUsd és accountedUsdPerGateAcceptedChapter. Az utolsó hányados számlálójában az elutasított próbák és valamennyi javítás is szerepel; fixed-canon, fork és régi fejlesztési források külön számolandók. Nulla elfogadott fejezet vagy hiányzó kötés esetén null, ismeretlen usage mellett nincs usage-alapú egységár. Ez mérési hozam, nem független emberi minőségértékelés és nem számla. Az assessment költségmutatója ugyanezt a teljes költséget használja; a hard-failure kapu továbbra zárva tart sikertelen mérésnél.

Gazdaságossági számítás csak megfelelő szövegminőség után: a szükséges nettó bevételnek a mért fejezetköltséget, az infrastruktúrát, fizetési költséget és a kívánt fedezetet is el kell bírnia. Árat vagy üzleti limitet a harness nem állapít meg. A mostani kicsi diagnosztikai mintából nem becsülhető megbízható termékszintű sikerarány; a fejlesztési próbálkozások összege sem azonos a későbbi üzemi fejezetárral.


## Tervellenőrzött folyamat mérése

Az új selected narrative queue review markerrel öt normál feladatot futtat; a régi snapshot továbbra négyet. A max8 új limit csak kötelező tervellenőrrel valid, a régi max7 változatlan. Az egy globális javítás vagy tervjavítás+újraellenőrzés, vagy az eddigi prose/fidelity/editor javítás lehet. A közös experiment ledger, project/user guard és a legfeljebb összesen 5 USD engedély nem változik.

Az offline teljes korpusz 68 fejezet / 34 pár / 248 transport: a 24 teljes és két narrative fork fejezet külön tervellenőri hívást is tartalmaz. A fix-kánon íróteszt authored tervből, planner/tervellenőr receipt gyártása és alkalmazási commit nélkül fut, writer v3-mal a narrative oldalon. A fixture központi feszültsége az unselected opciók költségét feltételesen írja le. A fidelity a tervet is ellenőrzi; annak hibája nem irodalmi pass/fail.

A valódi mérésben külön kell feltüntetni: strukturális tervhiba, tervellenőri elutasítás és javítása, prose/fidelity/editor hiba, feltételes kánonhiba a mérőanyagban, humán értékelés. A külön tervellenőr modellvélemény, nem emberi függetlenség. A narrativeYield az új többlethívást és minden elutasított próbát is tartalmazza; csak teljes paid+human corpus, változatlan minőségi gate és tulajdonosi ár/idő plafon engedhet rolloutot.


## 2026-10-15-i tényleges diagnózis és akkori kapu

Forrás `fd10b856`, PR #38; 87 fájl / 906 offline teszt és Verify/container CI sikeres. Két kitalált profil, egy-egy első időszak és külön authored fix-kánon összehasonlítás: ez részhalmaz, nem a 34 páros teljes benchmark.

| Tétel | Eredmény |
|---|---|
| Teljes új első fejezetek | 2/2 modellkapu-pass; öt-öt hívás, javítás nélkül |
| Két teljes narratív próba költsége | 0,2674625 USD accounted, 0,2481107 USD usage-becslés |
| Költség/kapun átment új fejezet | 0,13373125 USD accounted; nem emberi minőség vagy üzemi árígéret |
| Fix-kánon új writer | mindkettő fidelity-pass után editor-fail; momentum 2/5, kevés fejlemény hat hónaphoz |
| Új diagnózis összesen | 26 hívás / 0,526755 USD accounted; legacy/fix-canon is benne |
| Összes fejlesztési ledger | 101 hívás / 2,158755 USD accounted / 1,9980987 USD usage-becslés |
| Pénzügyi bizonytalanság | minden usage ismert, nulla unassigned reservation; becslés, nem számla |
| Engedélyezett keret | változatlan összesített 5 USD, maradék 2,841245 USD |
| Release | complete=false, qualityRelease=false; teljes paid/human/fork gate nyitott |

A két új első fejezet tényleges cselekvést és visszaható következményt mutat; a narrátor még túlmagyarázhatja a már bemutatott eredményt. A külön tervellenőr mindkét tervben befejezetlen mezővégeket jelzett kisebb hibaként: a kapun átment review nem kifogástalansági igazolás. Ezt és a fix-kánon alapanyag elégtelen időszaki előrehaladását következő célzott vizsgálatként kell kezelni. Az eredeti rossz kimeneteket nem írjuk át sikeressé.

A következő méréshez a forrás/case/ledger kötés és a még hiányzó szemantikai jóváhagyás megmarad; nincs automatikusan kitöltött emberi pontszám. A [személyes történetgazdaságossági javaslat](../plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) érzékenységi modell, nem új harness költségplafon, billing vagy béta budget. A 0,70 USD tervezési egységár és a 8/12/24 fejezet nem módosítja a szigorú minőségi assessmentet.


## N08 célzott javítás: teljes terv és külön eseményanyag-kontroll (Issue #43)

A két sikertelen `fd10b856` fix-kánon eset eseményanyagát is megvizsgáltuk: mindkettő két kis próbát és a 6. hónapban új esemény nélküli mérlegelést adott az írónak. A próza emellett túlmagyarázott, a fordulópont inkább beszámoló lett. Ez nem kizárólag writer-hiba, és a régi út mentett mintája sem azonos kapuval igazolt irodalmi PASS (csak az új fix-writer kap szerkesztői ellenőrzést).

A `fixedNarrativeFixture(id)` változatlan `original-v1` anyaga és a régi paid eredmények megmaradnak negatív kontrollként. A `currentFixedNarrativeFixture` a bounded-career és creative-portfolio profilokon külön `developed-v2` anyagot választ: 5. hónapi befejezett kísérlet/megfigyelhető eredmény, összesen négy esemény és három jelenet. Munkahelyi esetben szimulált függőségi nyomkövetés, alkotói esetben befejezett háromképes jelölt és el nem küldött kritikakérés ad új döntési alapot. Nem feltételezünk munkahelyi jóváhagyást, külső választ vagy elfogadott végső opciót. A többi hat profil nem változott; azok minősége sem igazolt. A két írónak azonos kánon jut; `plan.materialVersion` jelöli az anyagot a riportban. Új source/out kötés szükséges, a globális pénzügyi ledger változatlan. Az új anyag egyelőre authored kontroll, nem emberi vagy modell által igazolt jó történet.

Az új queue `readyNarrativePolicy` factoryja planner v4 / tervellenőr v2 / változatlan writer v3. A reviewer 1.1.0 jelentésében három kötelező readiness mező van: summariesComplete, decisionPatternComplete, periodDevelopmentSufficient. Bármely false érték blokkolja az írót magas pontok, minor issue és pass verdict mellett is. Az egyszeri meglévő tervjavítás után új review kell; ismételt hiba megáll. A v2 policyhoz v1 report nem használható sem checkpointban, sem artifactban. Régi policy/report továbbra saját verziója szerint olvasható.

A félmondat felismerése továbbra modellfeladat, nem determinisztikus nyelvtani garancia. A mező hossza és a pont hiánya önmagában nem elutasítási ok. A prompt teljes, tömör állításokat és rövid konfliktuscímkét kér a meglévő 800/80 karakteres keretben; nem vágunk szöveget, nem emelünk schemahatárt. A kapu a közölt readiness jelzést kötelezően érvényesíti. A provider egyetlen konkrét object sémát kap verziónként; a történeti report union csak belső feldolgozásra/tárolásra szolgál ([OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).

Ebben a csomagban nincs writer-váltás, új fizetett mérés vagy rollout. Az offline teszt az azonos bemenetet, régi esetek fingerprintjét, verziókötést, repair/stop/commit útvonalat igazolja; nem a félmondatok modell általi felismerési arányát és nem az irodalmi javulást. Következő mérés: új kontrollon a jelenlegi writer, majd külön writer-változtatás azonos kánonon, folytatások és vak emberi értékelés. A teljes paid/human kiadási kapu változatlanul nyitott; az 5 USD összesített engedély nem nullázódik.


## 2026-10-16: tényleges readiness- és írói kísérlet, negatív eredmény megőrzésével

Az ad6aaa7 forráson két profil első időszaka és a két developed-v2 kontroll futott: 26 hívás / 0,565005 USD accounted / 0,525726 USD usage-becslés. A két teljes új első fejezet öt-öt hívással, javítás nélkül átment; együtt 0,28037 USD, átlag 0,140185 USD/modellkapun átment fejezet. A két új terv readiness mezői true értékűek és a megvizsgált összefoglalók teljesek; ez nem általános felismerési garancia.

A fix-kánon munkahelyi eset továbbra elutasított: momentum 3 / sceneCraft 4 / novelty 3, kánonszintű ismétlődő dilemma. Az alkotói eset momentum 4 / sceneCraft 3 / character 3 / personalization 3: az előrehaladás megfelelőbb, a fordulópont továbbra beszámolószerű. Mindkét hiba megmarad; a korpusz nem complete és nincs qualityRelease.

Ebből külön writer v4 kísérlet készült az aef6315 forráson, az alkotói kontroll kánonja/terve változatlan maradt. A korábbi v3 fizetett bemeneti receipt hashével is ellenőriztük: csak a writer marker és prompt változott. Az egyprofilos új mérés 13 hívás / 0,262215 USD accounted / 0,2235219 USD usage-becslés. A teljes első fejezet átment (öt hívás, 0,1175725 USD), a fix kontroll viszont ismét elutasított, ugyanazzal a nyolc pontszámmal: 4/4/3/3/3/4/4/4 (causality/momentum/sceneCraft/character/personalization/choiceStakes/novelty/prose). A célzott írói javulást ez a próba nem igazolta. Egy minta nem teljes modellképesség-ítélet, de a sikertelen jelölt nem válik alapértelmezetté.

A writer v4 prompt/selector és schema-bővítés visszavonva; a kísérleti forrás az aef6315 commitban és a privát, forráshoz kötött paid-pr44-aef6315-writer4-v6 mérésben megmarad. A jelenlegi queue writer v3 / planner v4 / reviewer v2 változatot választ. Régi próbákhoz új kimenetet vagy mesterséges PASS-t nem írunk.

A két kísérlet után az összesített fejlesztési ledger **140 hívás / 2,985975 USD accounted / 2,7473466 USD usage-becslés**, nulla ismeretlen használat, nulla hozzárendeletlen foglalás. A változatlan 5 USD engedélyből **2,014025 USD** maradt. Ez nem szolgáltatói számla vagy üzemi fejezetár. Valódi háromidőszakos/fork és vak emberi kapu továbbra hiányzik.

Következő prioritás a teljes alkalmazási folyamat többfejezetes folytatása, hash-bound szemantikai döntési review-val. A kontrolloknál külön vizsgálandó a hiányzó konkrét vizuális alapanyag: a teljes fejezetek rögzített képtárgyat és konkrét félreértést kaptak, a fix kontroll csak általános fókusz/vonalvezetés-különbséget. Ez lehetséges magyarázat, nem ellenőrzött oksági eredmény; új kontroll esetén régi és új adatot külön meg kell őrizni. A minőségi küszöb nem csökken.


## Creative v2 mérési változat

Az `evaluate:narrative` új `--creative` kapcsolója a teljes narrative oldalt `narrative-fiction-v2` policyval indítja; a legacy kontroll és a történeti fixed-canon kontrollok maradnak. A report `variant` mezője és a manifest kötése különbözteti meg. A vak pair régi `narrative-v1` oldaljelölése összehasonlítási oszlop, nem az alkalmazott creative policy neve; a receiptek tényleges `life_fiction_*` verziót tartalmaznak. A kánon a teljes összehasonlításban szabadon eltérhet; a fixed-canon rész külön történeti kontroll, nem az új szerző korlátozása. Minden stage `gpt-6.1-sol`; a kapcsoló más modellt elutasít.

Példa offline: `pnpm evaluate:narrative --creative --mode offline --fixtures creative-portfolio --periods 2 --out .local/narrative-evaluation/creative-offline`. Paid esetben az összes eddigi dedikált fejlesztési költés és ugyanaz a ledger érvényes; új output nem új keret. Production key fallback nincs. Az új működéshez új source-bound run szükséges; régi történet futása nem alakítható át más policyra. A teljes korpusz és a vak emberi/recovery/ár/idő kapuk változatlanul szükségesek. A modell/editor PASS nem emberi minőségigazolás.


A creative worker alapértelmezett szolgáltatói határideje180 másodperc hívásonként; productionben külön `AI_FICTION_TIMEOUT_MS` (1000–300000 ms) szabályozza. A jelenlegi creative fejlesztési mérő ettől külön, explicit300000ms provider-konfigurációt használ. A régi módok `AI_TIMEOUT_MS` határideje megmarad. A nagyobb strukturált author-kimenet miatt a hosszabb határidőt és tényleges össz-latenciát mérni kell; ez nem tesz kötelezővé hosszú választ, nem ad plusz hívást és nem emel USD-keretet.


A `--creative-only` külön, szintetikus olvasói diagnózis: csak az új creative út fut, nincs legacy/fixed kontroll ismételt költsége. `diagnosticOnly=true`, `complete=false`, így nem teljes benchmark és nem qualityRelease-bizonyíték. Több időszaknál az első, alternatív forkban a második opciót választja determinisztikusan; `selection=diagnostic-index`, `reviewed=false` és kifejezett nem-emberi indoklás kerül a logba. Ez nem szemantikai párosítás, nem valós user választása, és nem engedi meg a `reviewed=true` kitalálását. A teljes párosított benchmarkban változatlanul a tényleges szemantikai review szükséges. Példa: `pnpm evaluate:narrative --creative-only --mode offline --fixtures bounded-career --periods 3 --out .local/narrative-evaluation/creative-reading-diagnostic`.

A paid v1 első próbája két végső tervellenőrzésnél csonka, 80 karakteres decisionPattern miatt állt meg, noha mind a négy tervpont 4 volt. Új planner/author/reviewer v2 csak az új jobokban rövid snake_case címkét követel gépi patternnel és 80 karakteres határral; a reviewer javaslata is ebbe a mezőbe illeszkedjen. Régi v1 promptok hash-pinnel megmaradnak. Ez nem minőségküszöb-lazítás vagy a sikertelen mérés törlése.


A 32 KiB artifact túllépése strukturális csomagtömörítést igényelhet akkor is, ha a próza már átment. Ilyenkor az egyetlen javítás `author_package`, nem változatlan kánonhoz kötött `prose_only`; a domain és mindhárom végső ellenőr újra fut, max9-en belül. Az összes egyedi mezőben érvényes, de együtt túl nagy artifact regressziója ezt valós worker/DB útvonalon ellenőrzi. A byte-limitet nem növeltük és nem csonkítunk csendben.


## 2026-10-16-i explicit keretbővítés és szekvenciális próba

A tulajdonos a cumulative development maximumot 5-ről **10 USD-ra** engedélyezte. Az értékelő CLI ennyit fogad el; az ExperimentAiBudget alapértelmezett ceilingje továbbra 5, a narratív értékelő külön explicit 10-es maximumot ad át. Más smoke és production guard nem változik. Új approval ID: `user-2026-10-16-fiction-quality-10usd`. Ugyanaz a canonical ledger/bindings és dedicated development projekt marad; 190 korábbi hívás / 4,81984 USD sem törölhető. Régi source-bound run nem írható át új source identityra.

A qualityPolicy 2.1.0 kalibrációjában először a korábbi ismétlődő fejezetet kell a saját korábbi jeleneteivel és lezárásaival újraértékelni. Az új pontszám önmagában nem bizonyít javulást: az ismétlődő negatív kontrollt el kell utasítania. Ezután új többprofilos creative-only folytatások és fork, naplózott szintetikus választásokkal; nem vak emberi benchmark. A tényleges szövegeket külön is el kell olvasni. Ismételt kapuhiba után a költést meg kell állítani és az okot elemezni; nem szabad a küszöböt lejjebb vinni.


Az örökölt választások azonos időbélyeges sorrendhibájának javítását új forrású, friss fork-próbával kell igazolni. A korábbi sikeres kétperiodos prefix átvehető szintetikus regressziós kiindulásnak, de az eredeti forrás/fejezet/kanonikus hash és az új forrás/script/payload kötését együtt rögzíteni kell. Új fork és normál guarded worker szükséges; az eredeti failed job/payload, receipt és költség nem írható át. Ez célzott kétforrású continuity regresszió, nem a teljes benchmark új forrásra átnevezése.


## Korábbi lezárt szekvenciális diagnózis

A 04cee85 új szekvenciális policyja két profil három-három teljes fejezetét fogadta el, mind öt hívás/javítás nélkül, minden score >=4. Célzott editor-kalibrációban a régi pozitív kontroll átment, az ismétlődő harmadik negatív kontroll elutasítva (novelty 3, három sequence flag false). Az első fork két plannerrel hibás latest-choice sorrend miatt megállt; az e5e7ed2 új forrású, explicit régi prefixet öröklő friss forkja öt hívással átment. Az eredeti failed job és díja megmaradt, a két forrás bizonyítéka külön van. Global ledger 229 hívás / 6,79395 USD accounted, 6,3036081 USD usage-becslés, nulla ismeretlen/hozzárendeletlen foglalás, maradék 3,20605 USD a 10-ből. Részletes eredmények és korlátok: [STATUS](../STATUS_HU.md). A complete/qualityRelease flag false; a kód CI-je és a kis mintás modellkapu nem független emberi benchmark.

## Creative v4: külön sorozatértékelés és bizonyítéktípusok

A [végrehajtási terv](../plans/alterward_fiction_human_quality_development_plan_codex.md) a régi vak fejezetpáros benchmark mellé teljes sorozatokat és közös prefixű alternatív ágakat vizsgáló, hash-bound olvasói anyagot ad. Creative-only diagnosztikában legfeljebb hat period kérhető; a régi legacy/narrative páros és fixed-canon utak maximuma három marad. A fejezetpontok és policy/model címkék ne szerepeljenek az olvasói kéziratban. A feltöltött értékelés kizárólag a hozzá tartozó változatlan snapshotra, ismert sample-re és érvényes bekezdésszámra hivatkozhat; reviewer/sequence duplikáció hibás.

Az elsődleges eredmények az elmerülés, folytatási kedv, szereplői hitelesség és folytonosság. AI-gyanú másodlagos; új automatikus humán release-küszöb nincs. A diagnostic-ai csoport eredménye külön összesül, emberi bizonyítékot nem ad. H1 korai visszajelzéshez háromfejezetes, H2 tartós változatossághoz kétprofilos hat-hat fejezetes olvasás és legalább egy alternatív fork szükséges; a 4–6. fejezetekre külön visszajelzéssel. A szükséges reviewer-létszám és a későbbi kiadási küszöb külön owner-döntés.

Offline fixture és hatperiodusos mock futás technikai bizonyíték. Valódi editor-hibafelismeréshez külön, címkéket elrejtő pozitív/negatív kontrollkalibráció kell; friss, promptfinomításhoz nem használt szövegeken emberi olvasás szükséges. Ez összhangban áll az [OpenAI értékelési útmutatójával](https://developers.openai.com/api/docs/guides/evaluation-best-practices): az automatikus mérést emberi ítélettel kell összevetni és kalibrálni.

Az öt normál/max9 kérés és egy repair változatlan, de a hosszabb prompt és metadata költség- vagy időtöbbletét ez nem zárja ki. Új valódi mérés nélkül nincs új egységköltség- vagy latency-ígéret. A korábbi cumulative ledger marad; ez a fejlesztés nem engedélyez paid corpusfuttatást vagy keretemelést.

Offline használat (friss, titkokat nem tartalmazó helyi outputkönyvtár):

```bash
pnpm evaluate:narrative --mode offline --creative-only --periods 6 --out .local/narrative-evaluation/offline-human-v4
```

Az olvasói anyag: `human-review/sequence-index.html`, `sequence-bundles.json`, `sequence-ratings-template.json`; az unblinded kulcs az output gyökerében marad. Külön értékelés: `--mode assess --creative-only --periods 6 --out <same-output> --sequence-ratings <ratings.json>`. Ez a parancs nem generál provider-munkát. A folytatott futás a mentett rating inputokat az aktuális bundle-hashhez újraellenőrzi; eltérő snapshothoz tartozó cache nem kapcsolódhat az új riporthoz.

2026-10-17-i technikai próba: nyolc profil × hat főági period + két alternatív fork, 50 mock minta / 250 transport, nulla failure/repair, 8 main + 2 branch bundle; 93 tesztfájl / 998 teszt. Valódi editor-kalibráció és emberi H1/H2 eredmény továbbra nincs.


### 2026-10-17-i külön engedélyezett valódi v4 diagnózis

A tulajdonos „Valódi generalas kell.” utasítása után tiszta `3809c560e4990c8fcc149a4d1af4e38a47c74c1c` forrással tényleges OpenAI-mérés futott, változatlan gpt-6.1-sol modellel, dedicated development projekttel és a korábbi globális ledgerrel. Egy kitalált alkotói profil három főági fejezete és egy alternatív harmadik készült: „The Missing Sleeve”, „Where the Door Opens”, „A Voice for the Kitchen”, „The Pale Centre”. A választások diagnostic-index/reviewed=false státuszúak; ez H1-hosszúságú olvasói anyag, nem emberi H1 PASS vagy teljes H2.

Négy végső kapu-PASS, 26 fizikai hívás; az első két rész öt-öt, a két harmadik nyolc-nyolc hívás, egy-egy javítással. Minden végső score >=4, mind a hét sequence-jelzés igaz. Accounted 1.410585 USD, usage-becslés 1.2957948 USD; javításokkal együtt átlag 0.35264625 USD/elfogadott szöveg. P95 420594 ms. A 50%-os repair és a kb. hétperces P95 kis mintás, de nem elhallgatható költség/idő jelzés.

A teljes szöveg ügynöki olvasása szerint a művek konkrétak, jó párbeszédekkel és eltérő következményekkel: a főág közös könyvhöz/felolvasáshoz, az alternatíva önálló képsorhoz és feltételes vételi ajánlathoz vezet. Az első két lezárás azonban újra órakeretes együttműködést kínál, a harmadik is határidős lehetőségre épül. Ez megmaradt ismétlődési kockázat az automatikus PASS mellett. Független emberi rating nincs; complete=false, qualityRelease=false, sequenceAssessment=null.

A completed job takarítása a köztes elutasítások részletes jelentését nem őrizte meg. A receipts/transport alapján a főági harmadik editorial utáni prózajavítása és az alternatíva fidelity utáni csomagjavítása látható, de az első pontos kifogás/pontozás nem rekonstruálható. Ezt nem szabad kitalálni vagy végső hibátlanságként jelenteni. Következő eval előtt a szintetikus, lokális köztes gate-evidence megőrzése külön javítandó, production privacy-retention lazítása nélkül.

A visszaolvasott globális ledger **255 hívás / 8.204535 USD accounted**, 7.5994029 USD usage-becslés; **1.795465 USD maradék** az engedélyezett összesen 10-ből. Nulla ismeretlen usage, aktív vagy hozzárendeletlen foglalás. Az új valódi részdiagnózis nem production apply, main merge, modellváltás, budget/window reset, teljes H2 vagy release-engedély.

A tényleges output a canonical eval checkout `.local/narrative-evaluation/creative-v4-real-20261017` könyvtára; sourceHash `68e37f23bf25c5f44107131cc104bb9cf9c291a5e03af26632f1c4348248e127`, mock=false. A report/summary/manifest, receipts, transport-records, eredeti globális ledger és budget-bindings együtt adják a technikai bizonyítékot. A kész emberi-review anyagok és rating template nem kitöltött emberi eredmények. A fizetett futás parancsa a korábbi explicit 10 USD cumulative approval ID-val, `--creative-only --fixtures creative-portfolio --periods 3 --out .local/narrative-evaluation/creative-v4-real-20261017` opciókkal futott; nincs új projektkeret.


## 045 candidate: v5 / quality 2.3 and measured development allowance

Predecessor PR #48 merged at `058555005e7e85905cf53081bfa18226780cf9ac`. The new candidate preserves measured v1–v4 prompts and uses planner/author/reviewer v5 + editor v4 with report 1.2.0, unchanged model/stages/limits. Evaluation targets `creative-portfolio,career-transition`, six main periods each and an alternative third per profile (14 final texts). Mock controls establish deterministic gate and repair routing only; live semantic recognition and human reading are separate evidence.

Owner authority on 2026-10-17: **USD 7 total additional development consumption**, replacing the initially approved new USD 5. Starting canonical ledger remains 255 calls / **USD 8.204535** accounted; the permitted cumulative ceiling is **USD 15.204535**, not old cap plus another seven. All new development API spend shares that seven-dollar allowance. The narrative CLI enforces the reviewed cumulative ceiling; generic ExperimentAiBudget still defaults to five and requires an explicit caller-supplied approved ceiling for extension. A provider deposit/balance alone never grants an extension. Never replace, copy or symlink the canonical ledger to obtain a new allowance.

The real run requires the clean checked candidate, original dedicated development project/key, default tier and store=false. Announce purpose, expected calls/cost and uncertainty before dispatch; report all physical calls, accepted/incomplete outputs, repairs, conservative accounted cost, usage estimate, p50/p95 and remaining new allowance afterward. Warn before remaining headroom endangers the planned corpus. Budget exhaustion or incomplete period/fork coverage cannot be reported as full validation. No production action, new beta window or ledger reset. The source-bound 14-text target does not replace the existing paired release benchmark or independent human gate.

The main narrative-yield metric includes all six possible creative period indexes and every failed full attempt. Fixed/fork comparisons remain separate from main yield; total corpus cost includes them. Previously the three-period matcher omitted fourth–sixth case costs; this diagnostic accounting defect is fixed with a regression that also charges an unaccepted sixth attempt.


### Synthetic local attempt traces

The evaluator records ordered attempts in `diagnostic-attempts/<case>.json`, directory mode0700/file0600. Source commit/hash, manifest/model/project hash, case, ordinal, request/input/output hashes, parsed output, request ID, usage, latency and repair feedback are checked against transport records and checkpoint/final receipts. Resume rejects missing, modified, truncated, cross-source/model/project traces and unsafe paths. Trace files are developer diagnostics; blinded reader bundles still contain only accepted final prose. Production worker/checkpoint cleanup and privacy retention are unchanged.

For real evaluation the transport makes one normal `responses.create` request with the same structured format/default tier/store=false, extracts only the model output text and then lets the existing provider validate it. This avoids losing a schema-invalid model output inside SDK parsing before local capture. It adds no normal AI stage or request. Malformed and incomplete model text remains labelled as such; it cannot become an accepted chapter. No raw SDK object, header or key is persisted.

Unknown response usage stays null, distinct from a genuine zero-token mock response; the cumulative budget retains conservative reservation accounting. A local persistence error cannot create a fictitious second transport attempt. Complete repair feedback is retained rather than silently cut at8000 characters. Persistent paid quota/auth/provider failures stop the corpus instead of spending again on the next profile; the incomplete result remains explicit.

### 045 v5 — 2026-10-17 lezárt negatív/részleges mérés

Fizetett forrás `34f5586b6afaabf73f8a9a4694636e9bea84f097`, sourceHash `990cdf900f0305ac7cbfce1c7654410040d6c72d8c0379af961ef42a2087f6cc`, eredeti kumulatív ledger. 14 célból nyolc elfogadott; a munkahelyi második fejezet ismételt alternatíva-ismertető lezárás miatt elutasított, a szereplőhivatkozást javító egyetlen globális repair már felhasználva. A további öt cél nem generált, újrapróba nincs. 50 valódi hívás, kilenc 0600 trace, 2,527495 USD accounted / 2,2240168 usage-becslés; globális 305 / 10,732030 USD; nulla unknown/unassigned. Új keretmaradék 4,472505 USD. Elutasított kísérlet 0,310405 USD. Összes költség / nyolc elfogadott szöveg = 0,315936875 USD; főági yield külön 7/8, 0,32219143 USD / gate-elfogadott fejezet. Az elfogadott javításarány 2/8, az összes megkísérelt job javításaránya 3/9. P50/P95 296639,5/345934 ms az elfogadott szövegekre.

A CLI exit0 diagnosztikai jelentést is jelenthet: `report.failures`, tényleges céllefedés, `complete` és `qualityRelease` külön olvasandó. Itt mindkét release/complete érték false. Csak az alkotói teljes sorozathoz és forkhoz van teljes blinded bundle; a munkahelyi elfogadott első fejezet önálló minta. Nincs kitalált emberi értékelés vagy átírt negatív eredmény. A célonkénti score/flag/repair/költség/timing táblát a [045 terv](../plans/045_fiction_v4_1_real_quality_iteration.md#actual-real-provider-result--2026-10-17) tartalmazza. Ez nem a történeti 34 páros teljes benchmark és nem éles kiadási engedély.

## V6 — elkülönített előpróba és nyolcfejezetes mérési ablak

A [v6 terv](../plans/045_fiction_v6_earned_life_evolution.md) elődje PR #49, merge/base `1e1b4303dd779ad8e8b34970892302583a7f66dd`. A v5 részleges/negatív korpusz, trace-ek és költségek változatlan történeti bizonyítékok. Új frozen v6/quality2.4/editorv5 mellett a creative-only ablak legfeljebb nyolc főági fejezet; a történeti legacy/páros/fixed-canon utak maximuma három és a 34 pár jelentése változatlan.

Stage A: `--creative-only --fixtures career-transition --periods 3 --no-forks`, három egymást követő főági szöveg, alternatív ág nélkül. Bármely hiányos/elutasított fejezet, hivatkozási hiba vagy olvasáskor egyértelmű ismétlődő lezárási/oksági hiba esetén a fizetett irodalmi futást megállítjuk, a negatív bizonyítékot megőrizzük. Nem indítunk ugyanabban a bizonyítékhalmazban új történetet a zöld eredményért. A modellkaput és az ügynöki olvasást nem nevezzük független emberi minősítésnek.

Stage B csak elfogadható Stage A után: **külön friss output/seed**, `--creative-only --fixtures creative-portfolio,career-transition --periods 8`, alapértelmezett profilonkénti alternatív harmadik fejezettel. Cél 16 főági + 2 fork = 18 elfogadott szöveg. A nyolcas ablak mérési/termékhipotézis, nem generálási bemenet, kvóta, időzítés vagy automatikus release-küszöb. H1=három és H2=hat fejezetes történeti hipotézis marad; a nyolcas olvasói vizsgálat külön címkét kap. Minden sequence/fork olvasói értékelés változatlan pontos hashhez kötött, a modellpontoktól és költségektől elkülönítve.

A tulajdonos 2026-10-18-án összesen **legfeljebb új 8 USD v6 fogyasztást** engedélyezett, a korábbi maradékot beleértve. Nyitó eredeti ledger **305 hívás / 10.732030 USD accounted**, kumulatív ceiling **18.732030 USD**. A korábbi 4.472505 USD nem további keret. Stage A kezdeti költségbecslése 1–1.50 USD, nem külön hard cap; mindkét fizetett stage ugyanazt a 18.732030 USD kumulatív plafont használja; a Stage B előtt az aktuális eredeti ledger és fennmaradó összesített authority újraellenőrzendő. Nincs ledger/bindings másolás, reset, productionkulcs vagy automatikus `.env` fallback. Default tier, store=false, dedikált development projekt, tiszta source és exact sourceHash kötelező.

A valódi hívás előtt közöljük a becslést, utána a tényleges accountolt fogyasztást. A sikertelen munka és a javítás is költség; külön rögzítendő az initial/final ok, repair típusa, fizikai hívás, idő, trace, yield, p50/p95, unknown usage és unassigned reservation. A 2026-10-18-án visszaolvasott [hivatalos ár](https://developers.openai.com/api/docs/pricing) változatlan: gpt-6.1-sol default/short input 2, cached 0.10, cache-write ceiling 2.50, output 10 USD/millió token. Az accounted összeg konzervatív elszámolás, nem API-egyenleg vagy szolgáltatói számla.

A blinded olvasói csomag kizárólag elfogadott teljes szövegeket, közös prefixű alternatív folytatást és semleges kérdéseket tartalmaz. Nincs modell-/policycímke, pontszám, javítás, trace, token vagy költség. Az emberi kérdések az érdemi változást, annak oksági útját, bezártságot, időbeli metronómot, döntésfelület-szivárgást és tovább olvasási/megújítási kedvet vizsgálják; válaszokat nem találunk ki.

### V6 Stage A valódi eredmény

Forrás cf000f863479bdb986c305dba743aaa4911db4f0 / sourceHash 5e0603826126ec835b84907e0e05769bd46910aa3f883d5c58f454758b263846. Három munkahelyi főági fejezet, 15 valódi hívás, nulla failure/repair/observed planner-reference error, minden végső score >=4 és minden sequence flag igaz. Új 0.741945 USD accounted / 0.6618489 USD usage estimate; P50 261598, P95 270270 ms. Eredeti ledger 305/10.732030 → 320/11.473975 USD, unknown/unassigned 0; maradék 7.258055 USD a v6 összesen 8-ból. Három private trace / 15 transport / 15 receipt hash- és projektkötése visszaellenőrzött. A teljes ügynöki olvasás alapján Stage B indítható; ez nem független human PASS. Címek, teljes számla/latencia és olvasási watchpointok a [v6 tervben](../plans/045_fiction_v6_earned_life_evolution.md). Stage B külön friss output/seed; dokumentációs checkpoint utáni clean source, azonos app/harness/test/migration bytes, ugyanaz az eredeti kumulatív ledger.


### V6 Stage B — részleges negatív eredmény és transport-korrekció

Stage B lezárult, **11 elfogadott / 2 elutasított / 5 nem generált** a 18 célból: alkotói 4 főági + fork, munkahelyi 5 főági + fork. Mindkét editor ismétlődő lezárást állított meg; a prose-only repair 108751/111155 bájtos kérését a 100000-es transport guard még API előtt blokkolta. A negatív forrás `2e1a127` / sourceHash `713be4849c941ad7d8e03c604b0aa333420cc6bf00e3658c4def0b5ba4a11c5b`, nem átnevezett vagy újrapróbált siker. B: 65 hívás / 3.472645 USD; A+B: 80 hívás / **4.214590 USD accounted**, maradék **3.785410 USD** a jóváhagyott 8-ból. Eredeti ledger **385 / 14.946620 USD**, unknown/open/unassigned 0. A konkrét fejlesztői javítás mindkét guardban explicit creative-eval 192 KiB envelope, minden bájt teljes konzervatív előfoglalásával; generic/runtime default 100000, USD/memory/artifact/max9/one-repair változatlan. A javítás valódi újramérése és a nyolcas ablak/független humán mérés még hiányzik; a munkahelyi történetben már van kiérdemelt, döntéssel elfogadott munkakörváltás, de ez ügynöki olvasás, nem human PASS. F05/F06/N08 PARTIAL, N09 és rollout nyitott. Részletes esetenkénti költség/trace/hiba: [v6 terv](../plans/045_fiction_v6_earned_life_evolution.md#stage-b-actual-result--2026-10-18-partial-not-release-evidence).

Az új explicit creative-eval maximum 196608 guarded UTF-8 bájt (serialized request +4096), mind ExperimentAiBudget, mind a lokális DatabaseAiBudget esetén; generic/runtime default 100000. A számolt foglalás teljes byte bound × input ceiling + max output × output ár; nincs clipping, tokenbecslésre szűkített foglalás vagy pénzkeret-emelés. A régi terminal failed korpuszt nem szabad új sourceHash alatt folytatni vagy elfogadottra átírni. Új paid próba előtt clean source, eredeti ledger/bindings, következő teljes foglalás és elég összesített authority ellenőrzendő. A további teljes friss próba költsége nincs még engedélyezve a meglévő 8 USD fölött. Production request envelope és rollout külön nyitott határ.


### Aktuális v6 keretbővítés — 2026-10-18

A tulajdonos a részleges Stage B és a konkrét javítás után **összesen legfeljebb 12 USD v6 fogyasztást** engedélyezett (az eredeti 8 + további 4; nem újraindított keret). A nyitó eredeti 305 / 10.732030 USD ledgerhez tartozó új kumulatív plafon **22.732030 USD**. Jelenleg változatlanul 385 hívás / 14.946620 USD accounted, új v6 fogyasztás 4.214590 USD; fennmaradó authority **7.785410 USD**. A korábbi 3.785410 USD maradék az emelés előtti állapot; a v5 régi maradékát nem adjuk hozzá. Új hívás csak a javított tiszta forrás ellenőrzése után: friss három munkahelyi főági/no-fork előpróba, és csak elfogadható eredménye után külön friss 18-célos mérés. Az eredeti negatív korpusz és költsége megmarad; nincs source-adoption, automatikus reroll, modellváltás vagy production engedély.


A javított transport/price guard és a 12 USD authority közös, stabil forrásellenőrzése kész: **101 fájl / 1076 teszt PASS**, format/docs/typecheck/build/schemas/diff rendben, schema drift nincs. Külön Claude Code read-only follow-up audit: nincs actionable finding. Új paid eredmény még nincs a javításon; következő a tiszta commit/CI utáni friss háromfejezetes előpróba.


### Javított forrás valódi Stage A — 2026-10-18

A javított `490db03` / sourceHash `814d73905850b0036aed691d3d7c8ae5d9782f41cc65f094620da1df08a869e5` friss munkahelyi előpróbája **3/3 elfogadott**, 18 valódi hívás, egy author-package repair. A harmadikban a lezárt vállalás typed opportunity státuszát kellett javítani; az eredeti próza teljesen megmaradt, a valódi javító transport most lefutott. Végső fidelity/editor PASS, reference error/unknown/open/unassigned 0. **0.9418175 USD accounted**, 0.8404001 usage estimate, P50 260135/P95 331250 ms. Eredeti ledger **403 /15.8884375 USD**, teljes v6 fogyasztás **5.1564075 USD**, maradék **6.8435925 USD** a 12-ből. CI332 Verify+Container SUCCESS, 101 fájl/1076 helyi teszt. Root végigolvasás szerint feltételesen alkalmas a hosszabb diagnózisra, de az első két rész cutting/critique/overexplaining mechanizmusa és a hónapritmus továbbra watchpoint. Külön, csak elfogadott szintetikus prózát olvasó Claude Code AI-kritika folyamatban; Stage B döntés ezt is mérlegeli. Ez nem human PASS, teljes B8 bizonyítás vagy production aktiválás.


A külön Claude Code diagnosztikai AI-olvasás a friss háromrészes nyitást megfelelőnek találta a hosszabb próbára, a megismételt túlmagyarázás/önirónia, montázsritmus és halk lezárások watchpointjaival. Root a tényleges választásokkal összevetette a kritikát: végső Stage A döntés **a friss 18-célos B mérés indítható**. Nincs human PASS vagy prompt/kód/kapulazítás; a benchmark ellenőrzi a hosszabb változatosságot. Alkalmazáskód változatlan a CI332 sikeres490db03 forráshoz képest, a dokumentáció külön checkpointot ad az új paid source/cost groupnak.


### Javított v6 Stage B lezárása — 2026-10-18, technikai részleges eredmény

A friss `196a36f0bad7229a20caf718685c3147d7420e34` / sourceHash `9ffe83eaaf0994a116d289a0dd6f479f9b32e9a6b554ba110aa22ff6aeb06b51` mérés **6 elfogadott / 1 technikailag sikertelen / 11 nem generált** mintával zárult a 18 célból. Alkotói főág 1–6 elkészült; a hetedik author mindhárom 180 másodperces transportja timeout lett. A paid runner `AI_PROVIDER_FAILED` esetén helyesen az egész mérést megállítja: ezért nincs nyolcadik rész, fork vagy munkahelyi minta ebből a futásból. Nem irodalmi elutasítás a hetedik: nincs visszakapott próza. A negyedik rész kezdeti ismétlődő szerkezetét a reviewer elutasította; egy author-package repair után fogadta el. Nincs teljes B8 bizonyíték vagy human PASS.

A friss B **40 hívás / 4.0581025 USD accounted**, ismert usage becslés 1.5116671 USD; **7 unknown-usage timeout**, teljesen megtartott foglalásuk **2.2399275 USD**. A usage-becslés nem teljes tényleges költség és nem számla. Elfogadott fejezetenként minden kísérletet beleszámítva 0.67635042 USD accounted; P50 324373.5 / P95 613812 ms. Eredeti ledger **443 / 19.946540 USD accounted**, aktív vagy hozzárendeletlen foglalás 0. Teljes v6 **138 hívás / 9.214510 USD**, ebből ismert válaszok konzervatív elszámolása 6.9745825 USD, unknown teljes foglalása 2.2399275 USD; a jóváhagyott összesen 12 USD-ből **2.785490 USD** authority maradt, nem igazolt wallet-egyenleg. A korábbi költségek nem nullázódtak.

Következő technikai korrekció: kizárólag a fejlesztési creative mérés fix, forráshoz kötött fiction határideje 300000 ms; a capture-wrapper továbbadja a provider kérési határidejét a valódi SDK create-nak. A normál/runtime 180000-es fiction default, normál 120000-es eval default, modell, promptok, küszöbök, SDK maxRetries=0, legfeljebb három provider-próba, globális max9/egy repair és pénzügyi kapuk változatlanok. Az emelés nem bizonyítja a hálózati/szolgáltatói okot vagy a következő hívás sikerét. Új offline ellenőrzés és külön audit szükséges; új fizetős futás nem indult. Az eredeti terminális mérés nem folytatható átnevezett forrással vagy másolt ledgerrel. Teljes új Stage A+B várható költsége nem fér biztonságosan a maradékba; további numerikus authority nélkül nem indul ilyen csomag.

F05/F06/N08 PARTIAL, N09 nyitott; PR #50 draft, nincs v6 merge, production, béta-, billing- vagy entitlement-módosítás. Az automatikus kapupontok nem helyettesítik a teljes nyolcas ablak és a független emberi olvasás eredményét.

A deadline-korrekció végső offline ellenőrzése:101 fájl/1078 teszt, format/docs/typecheck/build/schemas drift nélkül/diff PASS; külön Claude Code readback-audit szerint a legacy SDK-fallback változatlan, a300s kizárólag per-call fiction override. A kimerített első audit nem PASS; a végső visszaolvasás az aktuális fájlt ellenőrizte. Ez még nem valódi szolgáltatói timeout-siker. Új teljes smoke+18 csomag becslése6–7 USD; jelenlegi2.785490 authority mellett ilyen fizetős csomag nem indul további numerikus jóváhagyás nélkül.


### Új numerikus v6 authority — összesen17 USD, 2026-10-18

A tulajdonos a konkrét deadline-javítás és a részleges mérés megismerése után további legfeljebb5 USD-t engedélyezett: **összesen17 USD v6**, nem újraindított keret. Változatlan nyitó305/10.732030 USD, új kumulatív plafon **27.732030 USD**. Aktuális eredeti ledger443/19.946540 USD, eddigi v6 **9.214510 USD**, rendelkezésre álló authority **7.785490 USD**. A hét unknown teljes2.2399275 USD foglalása továbbra benne marad; sem a régi maradékot, sem a régi elutasításokat nem nullázzuk/adjunk hozzá újra. Új cap és negatív pénzügyi ellenőrzések után sikeres exact-source CI szükséges. Ezután friss három career-main/no-fork előpróba, és csak elfogadható eredménye után külön friss18-célos mérés. Várható összköltség6–7 USD, nem garantált szolgáltatói siker. Nincs modell-, minőségkapu-, repair-, runtime-, production- vagy merge-engedély. A korábbi12 USD-re vonatkozó mondatok és keretfüggő leállás történeti állapotok; a már lefutott mérések eredménye/forrása változatlan.


### Deadline-javított friss Stage A lezárása — 2026-10-18

A friss Stage A forrása a6e2787, sourceHash cdf9379ba7548e97406bee4cf5f0d978288302f3f77dab7da0730f12026b5493, CI336 SUCCESS.3 elfogadott/16 transport/0 repair/1 unknown author-timeout (300007ms), második author114260ms sikeres.15 accepted receipt és minden trace/hash/project kötés ellenőrzött. Költség1.1314275 USD, ismert usage0.6855516 USD, unknown teljes foglalás0.341715 USD. P50 249397/P95 562920ms. Globális ledger459/21.0779675 USD, teljes v6 10.3459375 USD, remaining6.6540625 USD; globális8 unknown,0 active/unassigned. A sikeres transportok mind180s alatt voltak; ne állítsuk, hogy a300s javítás megbízhatóságot igazolt. Root olvasása feltételes Go hosszabb diagnózishoz; külön AI-olvasás és checkpoint döntés szükséges, human PASS nincs. Részletes bizonyíték: [v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).


### Deadline-javított Stage B lezárása és összehangolt javítás — 2026-10-18

A friss `efa882313a84af8ff76ed7d3f401db1383abf087` / sourceHash `32ae8e247148c07a2e3156db98cd0a575cd59b41abe4df25f4358d21b0b5fd50` mérés lezárult: **13 elfogadott / 1 elutasított / 4 nem generált** a18 célból. Munkahelyi főág1–8 és alternatív3 elkészült; alkotói főág1–3 és alternatív3 elkészült, főág4 irodalmi elutasítása után5–8 hiányzik. Ez részleges eredmény, nem teljes kétprofilos B8 vagy human PASS. A77 valódi transport/14 trace/68 elfogadott receipt eredeti projekt/source/manifest/hash kötése completion után visszaellenőrzött, hozzárendeletlen vagy aktív foglalás0.

B költség **4.4646725 USD accounted**, ismert usage-becslés3.4975311 USD; egy eredmény nélkül maradt provider-kérés teljes0.332285 USD foglalása benne marad. P50 270752/P95 510934ms az elfogadott fejezetekre; minden kísérlet és elutasítás költségével0.34343635 USD/elfogadott. Ez nem számla, garantált késleltetés vagy árazási döntés. Globális eredeti ledger **536 hívás /25.542640 USD**, teljes v6 **231 hívás /14.810610 USD**, maradék **2.189390 USD** a jóváhagyott összesen17-ből. Kilenc lezárt unknown teljes foglalása megmarad; nincs új fizetős hívás vagy keretemelés.

Root végigolvasta az összes elfogadott szöveget és az elutasított kezdeti/javított alkotói negyediket is. A munkahelyi ív tényleges adminisztráció→tanulás→álláspróba→user által elfogadott fizetett junior tesztelői szerződés→önállóan használt tesztcsomag→meg nem hosszabbított szerződés és álláskeresés változást mutat. A szereplő tényleges hibája más kolléga elveszett vizsgálati állapotát okozza; a technikai korrekció nem állítja vissza a bizonyítékot vagy rendezi azonnal a konfliktust. Ez kiérdemelt életfejlődés, nem kötelező siker/promotion menetrend. A főág nyolcadik fejezetének állapota valóban seeking_work. A fork kizárólag az első két rész prefixét használja, nem örökli a későbbi állásváltást.

Az alkotói negyedik új laundrette/látvány-önkép konfliktusa mellett a zárás funkcionálisan megismételte az előző rész közterületi udvariassági megszakítását: ott másnak kellett a padhely, itt a következő ügyfélnek kellett a tér. A fidelity először a visszatérő névtelen dolgozó hiányzó actor_add-ját kérte; az egyszeri package repair csak ezt javította, a próza teljesen azonos maradt. Az editor ezután distinctEnding=false és distinctRhetoricalShape=false miatt helyesen elutasított, bár minden numerikus score4 volt. A kétprofilos teljes ablak nem helyettesíthető a részleges jó eredménnyel. A kompetenciapróba/korrekció gyakorisága, az alternatívákat összegző penultimák és a karrieren kívüli élet vékonyabb jelenléte további olvasói kockázatok; automatikus pontok nem igazolnak maximális történetélményt.

A konkrét offline korrekció új **qualityPolicy2.5.0**, változatlan planner/author/reviewer v6, editor v5, fidelity v1. A mért quality2.4 snapshot `fictionV6Policy()` alatt változatlanul megmarad; régi queue/policy nem frissül át. Amennyiben a végső fidelity tényleges tartalmi hibát jelez, a repair még nem fogyott el és van elegendő fizikai híváshely, a meglévő editort még az egyetlen full-package repair előtt olvassuk. Így a kánonhiba és a prózahiba ugyanabban az egyszeri javításban kezelhető. Mindkét végső kapunak utána is át kell mennie; nincs küszöblazítás, új normál stage, új modell, második javítás vagy max9-emelés. Normál jó fejezet5 hívás marad; két hibás ellenőrzés közös package repairje legfeljebb9. Fidelity-only hiba editor-előolvasással az eddigi8 helyett9 hívásba kerülhet; ez valós költségcsere, nem ingyenes javulás.

Korábbi transport-újrapróbálás után csak a négy kötelező package-repair híváshely maradhat: ilyenkor a korábbi fidelity-first útvonal marad, nem költjük el a repair utolsó helyét előolvasásra. Négynél kevesebb szabad helynél teljes javítást nem kezdünk. Cache/resume ugyanahhoz az input/output hashhez kötött; az előolvasás utáni keretet újraellenőrizzük, a provider/auth/budget/lease/privacy hibát nem alakítjuk tartalmi visszajelzéssé. Mindkét feedback a meglévő1800 karakteres keretben megmarad, hosszú szövegnél jelölt vágással; a teljes reportok hashkötött checkpointban megőrződnek. Artifact/report verzió, SQL, privacy, pénzügyi és runtime byte/deadline határok változatlanok.

A quality2.5 javítás még nem valódi szolgáltatói/minőségi bizonyíték. Új forráshoz kötött előpróba és hosszú mérés szükséges, a régi korpusz/receipt/ledger adoptálása nélkül. A teljes friss csomag várható6–7 USD-je nem fér a maradék2.189390 USD-be; ezt a csomagot további számszerű authority nélkül nem indítjuk. F05/F06/N08 PARTIAL, N09 és humán/retention/ár-döntések nyitottak; PR#50 draft, nincs merge vagy production módosítás.


### Új numerikus authority — összesen23 USD v6, 2026-10-18

A tulajdonos a quality2.5 javítás és a teljes sikeres CI338 (c2ac1cb,101 fájl/1091 teszt, Verify+Container SUCCESS) után további legfeljebb6 USD-t engedélyezett, vagyis **összesen legfeljebb23 USD v6 fogyasztást**. A változatlan eredeti baseline305 hívás/10.732030 USD; új kumulatív ceiling **33.732030 USD**. Indulás előtt az eredeti ledger536 hívás/25.542640 USD, teljes v6 **14.810610 USD**, fennmaradó authority **8.189390 USD**. Minden korábbi hiba és kilenc lezárt unknown teljes foglalása benne marad; nincs reset, másolt ledger vagy hozzáadott régi headroom. Ez nem igazolt provider-wallet egyenleg.

A keretkorrekció célzott tesztjei és exact-source CI után friss tiszta forrásból három career-main/no-fork valódi előpróba indulhat; csak elfogadható eredménynél külön friss kétprofilos18-célos mérés. Becsült új összköltség6–7 USD, az eltérésre előfoglalási tartalék marad. Korábbi terminális korpusz/receipt nem adoptálható új forráshoz. Modell/prompt/max9/repair1 és minőségi küszöb változatlan, quality2.5 technikailag ellenőrzött, valódi irodalmi eredménye még nincs. F05/F06/N08 PARTIAL, N09/human/retention/production továbbra nyitott; PR#50 draft, nincs self-merge. A korábbi17 USD-s korlátra és hiányzó további authority-re vonatkozó mondatok történeti checkpointok.


### Quality2.5 friss valódi Stage A — 2026-10-18

Forrás `2c4e9c80850ecf425571554eda3a52630f4a27ff`, sourceHash `c4af3bd14a713f5e28fef61b5fe1c4c66f756bf7b2c9984a5182df796856923e`, Verify+Container CI339 SUCCESS. **3/3 elfogadott**,17 valódi transport,0 tartalmi javítás. Mindhárom végső fidelity/editor PASS;3 trace/15 elfogadott receipt/eredeti projekt/source/manifest kötés completion után visszaellenőrzött. A harmadik első két author-kérése300025/300003ms után válasz nélkül zárult, a harmadik123797ms alatt sikerült; két teljes0.668350 USD unknown foglalás benne marad. Az első author297494ms alatt sikerült: ez szűk development300s előny, nem megbízhatósági vagy runtime-bizonyíték.

Összeg **1.4336775 USD accounted**, ismert usage-becslés0.6629858 USD, nem számla. P50 413464/P95 856182ms; a közel14.3 perces harmadik fejezet terméklatenciának nincs elfogadva. Eredeti globális ledger **553 hívás/26.9763175 USD**, teljes v6 **248 hívás/16.2442875 USD**, maradék **6.7557125 USD** a jóváhagyott23-ból. Globálisan11 lezárt unknown, aktív/hozzárendeletlen0; korábbi hibák nem nullázódtak.

Root mindhárom végső szöveget elolvasta: megtévesztően simán működő practice UI→a tényleges bizonyítékot elrejtő esettanulmány őszinte átépítése→három valódi jelentkezés, két elutasítás, hiányos interjúfeladat és feltételes hat hónapos content-assistant ajánlat. A szereplő adminisztrációs tapasztalata okságilag segít, miközben a stíluscsiszolás miatti befejezetlenség megmarad. Az ajánlat nincs elfogadva, employment továbbra administration; az opció opportunity/goal változása kifejezetten nem kezdi el a munkát a notice/start-date egyeztetés előtt.

A második lezárás párhuzamos, esettanulmány/jelentkezés–újabb gyakorlat mondata root szerint továbbra túl közvetlenül visszhangozhatja a választási felületet. A gépi editor mégis minden flaget igaznak/all4 pontot adta. Külön accepted-only Claude Code előfizetéses kritika először két, majd mindhárom teljes fejezetet elolvasta: szerinte ez egy megkeresett, természetes belső mérlegelés, nem kötelezően javítandó menü, és a harmadik megszakítja a párhuzamos lezárást. A kritikus korábbi „nincs átfedés” mondatát pontosította: a szemantikai kapcsolat valós; a lexikai egyezés hiánya önmagában nem felmentés. Root megtartja saját fenntartását, de egy vitatható mondatból nem gyárt új kötelező tiltást. A harmadik konkrét munkajelenete és ajánlata más zárófunkciót ad. A kritikából nem vezetünk be kötelező, ütemezett visszafordíthatatlan veszteséget vagy eszkalációt.

**Root döntés: elfogadható a friss hosszú diagnózishoz**, nem human PASS vagy release. Következő külön friss output/seed:16 főági+2 fork cél, becslés5–6 USD az aktuális6.7557125 authority alatt, a következő teljes foglalás ellenőrzésével. A két kritika AI-olvasás, nem független emberi megtartási bizonyíték. A quality2.5 közös fidelity/editor repair mechanizmusa e próba során nem aktiválódott; működésére továbbra a célzott technikai regresszió ad bizonyítékot. Modell/prompt/policy/küszöb/max9/repair1 változatlan. A dokumentációs checkpoint különíti el a következő friss B sourceHash-költségcsoportját; app/harness/test/migration byte változás vagy korábbi corpus-adoption nincs. Friss source/checkpoint CI és budget preflight szükséges B előtt.


### Quality2.5 hosszú mérés lezárása — 2026-10-18, részleges

Friss forrás `cb8b539d11d8d364cee1798aa6fe5164d6c9f681`, sourceHash `d05fb027bf589169b19fa16c51ae1e6a63480d83844c16e310f89d914cd36512`, előzetes Verify+Container CI340 SUCCESS. **15 elfogadott / 0 irodalmilag elutasított / 3 hiányzó** a18 célból: alkotói8 főági+alternatív3 kész; munkahelyi6 főági kész, főági7–8 és alternatív3 hiányzik. A munkahelyi7 planner-kérése elkészült, de az author teljes előfoglalását `SMOKE_BUDGET_EXCEEDED` még API előtt megtagadta. Ez egy pénzügyi failure, nem elutasított történet, provider-timeout vagy kész fejezet. A terminális mérést nem folytatjuk új címkével, source-adoptionnel vagy ledger-resettel. A teljes kétprofilos B8 nincs igazolva.

**99 valódi transport,16 trace,94 elfogadott receipt,5 egyszeri package repair**; completion után minden trace/receipt/manifest/source/project kötés visszaellenőrzött. B accounted **6.495380 USD**, ismert usage-becslés4.3305782 USD; négy válasz nélküli author-kérés teljes **1.3534425 USD** foglalása megtartva. Az accounted az ismert kérések konzervatív elszámolását is tartalmazza, nem csupán usage+unknown összeadás és nem szolgáltatói számla. P50 **361067ms**, P95 **852171ms** az elfogadott fejezetekre. Aktív/hozzárendeletlen foglalás0; nincs futó fizetős mérés.

Eredeti globális ledger **652 hívás /33.4716975 USD**; a változatlan305/10.732030 baseline óta v6 **347 hívás /22.7396675 USD**, remaining **0.2603325 USD** a jóváhagyott összesen23-ból. Globálisan15 lezárt unknown teljes foglalása megmarad. A maradék nem fedezte a következő teljes kérést; további fizetős hívás nem indul. Ár/billing, provider-wallet egyenleg vagy új költségengedély ebből nem következik.

Root mind a15 elfogadott fejezetet és az eltérő köztes prózát végigolvasta, a végső body-hasheket a jegyzetekkel egyeztette. Az alkotói ív a portfólió olvashatóságától saját képregényen és kézi példányokon át a barátság/portré eltérő elvárásaiig jut; az utolsó közös séta más zárófunkciót ad. A munkahelyi ívben elfogadott rövid fizetett megbízás, befejezés, jelentkezés, majd külön strukturált döntésválasztással elfogadott junior szerkesztői állás és egy folyamatváltással feleslegessé váló saját útmutató következik. Ez konkrét oksági életfejlődés; nem kötelező előléptetési menetrend. A fork új boltmegfigyelő történetet ír, nem örökli a későbbi főági képi munkákat. A kitalált diagnosztikai főágon a harness determinisztikus első opciót választ, a fork eltérő opcióval indul; ez nem tényleges humán tesztválasz vagy szemantikai megfeleltetési jóváhagyás.

**Nyitott irodalmi kockázat:** több részben a főszereplő túlmagyaráz, miközben más szereplő egy hétköznapi tárgyat/munkát intéz; több penultima közvetlenül felidézi a következő választási útvonalakat. Van jelentésbeli változás, ezért az ismétlődő motívum önmagában nem automatikus hiba. Az elfogadott editorok minden score-ja>=4 és mind a7 flag igaz, de ez nem zárja le a teljes ív vagy a humán érdeklődés kérdését. Külön accepted-only, nyolc alkotói és hat munkahelyi részt olvasó AI-kritika lezárult (részletek alább); ez sem emberi H1/H2 vagy retention PASS. F05/F06/N08 PARTIAL, N09 nyitott; PR#50 draft, nincs merge/production/béta/billing/entitlement módosítás.


#### Teljes elkészült ívek kiegészítő AI-kritikája

Külön, csak az elfogadott nyolc alkotói és hat munkahelyi teljes főági prózát olvasó Claude Code előfizetéses kritika lezárult; a korábbi root-pontszámokat/jegyzeteket, titkokat és ledgert nem kapta meg. A kezdeti4-turn vizsgálat, majd egy1-turn kontextuspontosító addendum sikeres. Ez claude.ai Pro használat, nem Anthropic API-wallet költés vagy a23 USD v6 keret emelése.

A kritikus mindkét szálat tovább olvasná, konkrét oksági törést nem talált; az alkotói8 barátság/portré jelenete és a munkahelyi6 fölöslegessé váló útmutatója szerinte ténylegesen megváltoztatja a korábbi motívumok funkcióját. Ugyanakkor az elfoglalt beszélgetőtárs/túlmagyarázás ismétlődése az alkotói6–7 táján fárasztóvá válhat; mindkét profil hasonló szerzői kontrolltémát, azonos keresztnevű fő mellékszereplőt és ismétlődő hónapváltási prezentációt használ. Ezek megkülönböztetett, részben vitatható olvasói kockázatok, nem új szó-, név-, helyszín- vagy cselekménykvóták.

A root a kritika alkalmazási kontextus nélkül túlzó részeit visszaellenőrizte. A kritikus az addendumban visszavonta, hogy az azonos hat hónapos hossz generátori hiba lenne: ez domain-előírás, csak a hónapok hasonló prózai elhelyezése marad stiláris kérdés. Visszavonta az állás elfogadásának hiányzó agency-jét is: az a tényleges strukturált választásban megtörtént, a body-only olvasmány azt nem mutatta. Pontosította, hogy Niamh saját rajzi hozzájárulását kapja vissza, nem jogosulatlanul sajátítja ki a főszereplő munkáját. Az Aoife-jelenet romantikus értelmezése lehetséges olvasat, nem megállapított kánon. A kritikát ezekkel a korrekciókkal őrizzük meg; hibás részeit nem emeljük termékszabállyá.

Root következtetés: ez a korpusz tartalmaz jó, továbbvihető történeti eredményeket, de nem igazolt a minden mintán stabil kiváló minőség vagy a megújítási hajlandóság. Az emberi17-kérdéses értékelés nincs kitöltve, a második nyolcas ablak/fork hiányzik; a fenti konkrét első-draft konzisztencia és ismétlődési vizsgálat marad a következő előkészítés. Új paid futás nem indul.

## V7 jelölt — offline állapot és mérési kérdések, 2026-10-18

A [046 v7 terv](../plans/046_fiction_v7_narrative_economy.md) quality2.6 jelöltje offline ellenőrzött; valódi fizetős mérés nem futott, és a v6 keret maradéka (0,2603325 USD) új mérésre nem elég. Új előpróbához új, számszerű tulajdonosi engedély kell. A mérési profilok (`tests/narrative-fixtures.ts`) mostantól 1–2 kitalált család-, pár- vagy barátkapcsolatot tartalmaznak, ezért minden új mérés új sourceHash-t kap; a lezárt v6 korpusz ezzel nem hasonlítható össze közvetlenül és nem egészíthető ki. A következő méréskor a 046 terv mérési kérdéseit (futások közti jelenetismétlés, névdiverzitás, karrierív-konvergencia, hónapritmus, magánélet súlya, új szereplők száma) a kiegészítő AI-olvasás és a független emberi értékelés külön rögzíti; ezek nem kapuk vagy kvóták.

### V7 valódi mérés — 2026-10-19, részleges

Forrás `fb2ceb1`, tulajdonosi keret 7,39 USD (plafon 40,8616975). Stage A munkahelyi 3/3 elfogadott, 15 hívás, 0 repair, 0,76589 USD. Stage B **15 elfogadott / 1 elutasított / 2 hiányzó** a 18 célból (alkotói 9/9; munkahelyi főági 1–5 + fork, a 6. ismétlődés miatt elutasítva), 98 hívás, 6 sikeres repair, 0 unknown, 5,8490725 USD. Eredeti ledger **765 hívás / 40,08666 USD**, 0 nyitott, maradék 0,775 USD. Ügynöki olvasás: a döntési ágak szó szerint nem épülnek újra, de visszatérő ütem, azonos alakú lezárások, futások közti cselekményismétlés és szűk névkészlet maradt; az `overexplain_while_other_busy` jelzés nem jelent meg. Nincs human PASS vagy teljes B8. Részletek: [046 v7 terv](../plans/046_fiction_v7_narrative_economy.md#valódi-mérés--2026-10-19-részleges).

## V8 jelölt — költségmentes sorozat-audit, 2026-10-19

A [047 v8 terv](../plans/047_fiction_v8_series_evidence.md) jelöltje offline ellenőrzött. A már legenerált futások sorozatszintű ismétlése modellhívás és ledger-írás nélkül mérhető:

```bash
pnpm narrative:audit --out <kimeneti-mappa> <run-mappa> [<run-mappa> ...]
```

Minden run-mappában a runner által írt `report.json` kell. A kimenet `series-audit.json` és `series-audit.md`: ismétlődő mondatnyitások és fordulatok, fejezetenként a v8 editor-bizonyíték jelzése, záró mondatok, névgyakoriság, a profil alapkapcsolatainak említése, futások közti közös teljes nevek és fordulatok, azonos profil azonos fejezetének lexikai átfedése. Heurisztika, nem irodalmi pontszám és nem release gate; a humán olvasás mellé ad összehasonlítható számokat. A v6/v7 baseline és a következő mérés küszöbei a 047 tervben vannak.

## Helyi ügynökök (Codex, agy) — 2026-10-20

`pnpm narrative:codex` és `pnpm narrative:agy` mindig offline módban fut, API-kulcs, ledger és budget guard nélkül, az előfizetéses kvótát fogyasztja, és csak a tulajdonos engedélyével indítható. A kimenet irányjelző fejlesztési bizonyíték (`comparableWithPaid: false`), nem N08-mérés. A termékhívással egyező beállítások, a kvótakapuk és az agy lépéskorlátozása: [047 terv, Kvótakapuk és az agy futtató](../plans/047_fiction_v8_series_evidence.md#kvótakapuk-és-az-agy-futtató--2026-10-20).

## Élő világ (v9) kiválasztása — 2026-10-20

`--fiction-generation v9` (csak `--creative` / `--creative-only` mellett) a v9 policy-generációval futtat; kapcsoló nélkül vagy `v8` értékkel a futás, a report és a manifest-kötés bájtra a v8-é. A v9 a report `fictionGeneration` mezőjét és mintánként a `character` mezőt (`projectionBytes`, `deltaBytes`, `omittedActors`, az author hívás(ok) `authorOutputTokens` és `authorReasoningTokens` értéke, valamint a javítás `repairMessage` szövege és a `characterRepair` jelző, ha a javítás oka szereplőállapot-hiba) adja, hogy az 5. fázis ellenőrizhesse az ideiglenes korlátokat, az author kimeneti token-eloszlását és a delta miatti javítások arányát. A helyi Codex/agy transport **nem ad token- és költségadatot**, ezért az 5. fázis a 0,419 USD-os költségkaput nem tudja eldönteni: a runner a `character.outputSizes` mezőben stage-enként (`stages`: task, `outputChars`, `outputBytes`, `estimatedTokens`) és a próza, valamint a delta hosszára (`proseChars/Bytes`, `deltaChars/Bytes`) rögzít karakter- és bájthosszt, és ebből ≈3,5 bájt/token becsléssel ad `estimated*Tokens` értéket. Ez irányjelző; a kaput a fizetős mérés dönti el. A v9 **paid** futás a runnerben tiltott (`--mode paid` elutasítva) addig, amíg a 7. fázishoz nincs külön tulajdonosi keret. A helyi Codex/agy runnerek ugyanezt a kapcsolót használják (`pnpm narrative:codex --creative-only --fiction-generation v9 ...`); irányjelző, nem N08-mérés.

### Karakter-audit és negatív kontrollok (4. fázis, C1)

`pnpm narrative:character-audit [--out <mappa>] <run-mappa> ...` a runner tárolt `report.json`-jain fut, modellhívás és ledger nélkül (`character-audit.json` és `.md`). Diagnosztikai számlálók, **evidence, nem ütemterv és nem kapu** (terv §43): szereplőnként jelenlét, a szereplő saját célja/gondja megjelenik-e, minden rá vonatkozó bekezdés a protagonist projektjéről szól-e (témafegyelem), funkcionális visszajelzés-minta, rövid beszédű profil hosszú monológja, tárolt megoldatlan ügy későbbi eltűnése; sorozatszinten azonnali kibékülés, kényszerített rendetlenség és testi kellemetlenség, melodráma-jelzők, valamint az embodiment-jelzők sűrűsége (küszöb nélkül). A kérésoldali láthatóság: fejezetenként a projection bájtja, a delta bájtja, az `omittedActors` és a nem elférők relevanciajelei (`fictionCharacterOmitted`, additív diagnosztika; a projection kimenete és hash-e változatlan). A küszöbök (jelzés legalább 2 fejezetben és ≥ 75%-ban, 35 szavas beszéd, 3 melodráma-jelző) névvel ellátott, ideiglenes értékek, angol próza heurisztikái. A negatív kontroll korpusz (`tests/narrative-character-controls.ts`: A funkcionális NPC, B tökéletes témafegyelem, C azonnali kibékülés, D figyelmen kívül hagyott személyiség, E kényszerített rendetlenség, F kényszerített testiség, G melodráma, plusz eltűnő megoldatlan ügy és egy jó ellenpélda) a saját jelzését adja, a jó ellenpélda egyiket sem; mutációs ellenpróbával ellenőrizve. Szövegminőségi bizonyíték ez sem: a humán olvasást nem helyettesíti.


### 5. fázis: helyi Codex-diagnosztika, v9 és v8 pár (futtatási menet)

Cél: ugyanazon a fixture-ön és ugyanazzal a modellel (Codex, gpt-6.1-sol) a v9 szerződés-, folytonosság- és szereplőállapot-viselkedésének irányjelzője a v8 baseline mellett. Irányjelző (`comparableWithPaid: false`), nem N08-mérés. Nincs fizetős hívás, API-kulcs, ledger, push és merge. A futtatás a tulajdonos gépén történik, a felhő nem futtat Codex-et.

**Ág és kód.** `claude/living-world-impl-w3ihlb-c1` (a #61 ága, a teljes #58–#61 verem). A kód a `0a6aea4` commit tartalmával azonos; az ezt követő commit(ok) csak dokumentációt érintenek. Futtatás külön worktree-ben:

```bash
git fetch origin claude/living-world-impl-w3ihlb-c1
git worktree add ../future_flow_phase5 origin/claude/living-world-impl-w3ihlb-c1
cd ../future_flow_phase5
pnpm install --frozen-lockfile
```

**Kvóta.** A runner indulás előtt maga ellenőrzi a kapukat (Codex ≥30% az 5 órás és ≥20% a heti ablakban, fejezethatáron 10% / 5%), és a jelölőfájlba naplózza; kapu nem teljesül → a futás megáll (kilépési kód 3, `EVAL_QUOTA_HALT`). Csendes ügynök- vagy modellváltás nincs; megállás esetén a koordinátort kell értesíteni. A kvótát futásonként előtte és utána rögzíteni kell.

**1. v9, career-transition, 3 periódus.** A `quality` címkében minden lépést a Codex válaszol (az agy ebben a címkében nem kap lépést).

```bash
pnpm narrative:agy --run-label quality --creative-only --fiction-generation v9 \
  --fixtures career-transition --periods 3 --no-forks \
  --out .local/narrative-evaluation/v9-codex-career
```

**2. v8 baseline** (ugyanaz a fixture és modell, a v9 kapcsoló nélkül). Előbb a v9, utána a v8. Kvótakimerülésnél a futás fejezethatáron áll meg; az újraindítás ugyanazzal a paranccsal és mappával csak a hiányzót generálja.

```bash
pnpm narrative:agy --run-label quality --creative-only \
  --fixtures career-transition --periods 3 --no-forks \
  --out .local/narrative-evaluation/v8-codex-career
```

**3. Audit** a két mappán (modellhívás nélkül):

```bash
pnpm narrative:character-audit --out .local/narrative-evaluation/audit-career-3 \
  .local/narrative-evaluation/v8-codex-career \
  .local/narrative-evaluation/v9-codex-career
```

**4. Visszaadandó.** A két kimeneti mappa (`report.json`, jelölő- és kvótanapló, `transport-records.json`, attempts-trace) és az audit kimenete (`character-audit.json`, `character-audit.md`); a tartalom szintetikus fixture, személyes adat nincs. Futásonként: kvóta előtte és utána (5 órás és heti ablak), kilépési kód, esetleges `EVAL_QUOTA_HALT`. A reportból futásonként: `requestCount`, `repairUsed`, `errorCode`, `physicalLatenciesMs`, `character.projectionBytes`, `character.deltaBytes`, `character.omittedActors`, `character.omitted`, `character.authorOutputTokens`, `character.characterRepair`, `character.repairMessage`, `character.outputSizes` (stage-enként `requestBytes` is: a nyers kérés mérete, a termelési guard +4096 bájtot ad hozzá, így a valódi v9 kérések az `AI_FICTION_MAX_REQUEST_BYTES` ellen mérhetők). A v8 futásnak nincs `character` mezője, a v8 stage-hosszak a `transport-records.json`-ban vannak (`outputBytes`, `requestBytes`), ezért ezt a fájlt is át kell adni. Az audit (`character-audit.json`/`.md`) a `generation` szakaszban a hívásszámot, a javítást és annak okát, a becsült kimeneti tokent adja szekvenciánként. A Codex nem ad token- és költségadatot, ezért a 0,419 USD/fejezet költségkaput ez a futás nem dönti el (lásd fent: csak hossz és becsült token); a kaput a fizetős mérés (7. fázis) dönti el.

**4/a. Folytonossági és testiségi diagnosztika (hosszabb sorozat előtt).** A v9 tervező minden `unresolved_matter` vagy `open_thread` jelű projection-szereplőre `continuityDecisions` bejegyzést (carry/defer/resolve, rövid indok) ad. A hiányzó döntés nem hard fail, hanem jelzés: a runner `character.continuity` (`required`, `missing`, `intentMissing`, `decisions`; a vázlatot az attempts-trace utolsó befejezett tervezői hívásából veszi, ugyanonnan a javítás szövegét is, ha a lezárt job checkpointja már nem őrzi), az audit `continuity` szakasza és a `continuityDecisionMissing` jelzés mutatja. Fejezetenként az `embodimentPerChapter` számolja az embodiment-jelzőket (küszöb nélkül). A v8 riportokon mindkettő üres, jelzés nincs. A `recent_change` jel jelentése „az utolsó két megírt periódus egyikében változott", ezért a 0. fejezet változása az 1. és a 2. fejezetnél még friss.

**4/b. Bukott minta diagnózisa.** A job rekordja csak a hibakódot őrzi (egy kódot sok helyen dobnak), ezért a runner `report.failures` bejegyzése `stage` és `diagnostic` (`code`, `message`, `frames`) mezőt is kap. Egy már bukott mintát modellhívás nélkül újra lehet játszani a mentett állapotából: `pnpm narrative:commit-replay --state .local/narrative-evaluation/<kimenet>/state/<fixture>-narrative-v1 [--job <id>]`. A parancs alapból az állapot másolatán dolgozik, és JSON-t ad: `outcome` (`committed`, `failed` a validátor üzenetével és a frame-ekkel, vagy `needs_model_call`), a megállási `stage`-t és a `providerRequestCount`-ot. `--in-place` csak akkor cseréli le az eredeti állapotot, ha a job most commitol, és cserével, nem felülírással: az eredeti `<állapot>.bak` néven megmarad (ha már van `.bak`, a parancs megáll); ezután a futás ugyanazzal a paranccsal és kimeneti mappával folytatható.

**4/c. Futások összevetése.** `pnpm narrative:compare [--out <mappa>] <v8-mappa> <v9-mappa>` a tárolt `report.json`-ból és `transport-records.json`-ból (modellhívás nélkül) mintánként táblázatot ad: hívásszám, javítás, idő, hibakód, a legnagyobb nyers kérés stage-enként (KB), a 100 000 bájtos guardot (nyers + 4096) átlépő kérések, a kérésméret növekedése a sorozaton (`plan`, `author`), és ahol van, a projection-bájt, delta-bájt, `omittedActors`, `characterRepair`, hiányzó folytonossági döntések; a bukott minták `stage`-et és üzenetet is mutatnak. A v8 stage-bájtjai itt is megvannak, mert a `transport-records.json` a v8 mappában is rögzíti őket. A szövegszintű összevetés (funkcióismétlés, embodiment fejezetenként, eltűnt szálak) a karakter-auditban marad.

**5. Második lépés (csak külön jóváhagyással).** A szereplőállapot hatása több periódus után látszik: egy fixture 6 periódussal v9-cel (ha a kvóta engedi, v8-cal is), forkokkal; a `--no-forks` csak a 3 periódusos career-transition smoke-ra érvényes, itt elhagyandó (`--periods 6`, `--out .local/narrative-evaluation/v9-codex-career-6`). A forkos futás hívásszáma és kvótaigénye nagyobb.

**Feldolgozás (felhős szál).** Az audit és a v8–v9 pár összevetése (javítási arány, hívásszám, bájt, latency irányjelzőként), majd a fejezetek elolvasása a Reddit-kritériumok szerint (alacsony feszültség, „túl tiszta”, testiség hiánya, NPC-k funkcionalitása), kifejezetten modellolvasásként jelölve, nem humán bizonyítékként. Az eredményjegyzet ebbe a szakaszba és a `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md` v9 szakaszába kerül.
