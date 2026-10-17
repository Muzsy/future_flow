---
status: active-supporting
owner: personal-simulation
last_reviewed: 2026-10-16
related:
  - ../plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md
  - NARRATIVE_RELEASE_HU.md
---

# Személyes történetminőség: reprodukálható összehasonlítás

## Bizonyítékok és korlátok

A `scripts/evaluate-narrative.ts` N08 mérőeszköz kizárólag a repository nyolc kitalált tesztprofilját fogadja. Minden mód saját tartós, helyi PGlite adatbázist használ a valódi queue/worker/budget/checkpoint/commit útvonallal. Nincs production DB, Auth, saját tesztelői fiók vagy operátori állapot. Az offline mód alapértelmezett, nem hoz létre fizetett SDK-klienst, általános OPENAI_API_KEY mellett is mock transportot használ. A program nem tölti be automatikusan a projekt .env fájlját.

Három külön vizsgálat készül:

- Teljes pipeline: nyolc profil, három időszak, legacy és narrative-v1, 48 fejezet és 24 páros értékelés. Eltérő planner kimenetek megengedettek, ezért ez a teljes rendszer teljesítménye.
- Azonos kánon: nyolc fixture-authored, domain-validált eseménysor és jelenetterv, két writer út, 16 fejezet és nyolc pár. A tervhez nincs hamis planner receipt; ez nem alkalmazási period commit. Első draftokat hasonlít, nincs javítás.
- Alternatív ág: az első két profil második döntésénél ellenkező, előre rögzített szemantikai irány, négy fejezet és két pár. Valódi saját-history fork, a szülő harmadik fejezete nem kerül a child memóriába.

Összesen 68 fejezet és 34 vak pár. A jelenlegi tervellenőrzött normál offline út 248 mock transporthívás; valódi hiba/javítás több kísérletet igényelhet. Ez **működési bizonyíték, nem irodalmi minőség**. Az editor modell pontjai diagnosztikai adatok, nem független értékelés.

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

Az elfogadott fejlesztési terv külön emberi engedélyt kér a fizetett benchmarkhoz. Szükséges a konkrét approval azonosító, az engedélyezett **összesített fejlesztési keret** (jelenleg 10 USD a 2026-10-16-i explicit bővítéssel), valamint külön fejlesztési OpenAI project és project/service-account kulcs. A bővítés az eredeti 5 USD keret teljes addigi költését is magában foglalja. A személyes béta éles kulcsát/windowját/ledgerét nem használjuk. A fájlban tárolt kulcs útvonalát kell az operátornak átadni, a kulcsot nem chatben.

Csak explicit átadott `NARRATIVE_EVAL_API_KEY`, `NARRATIVE_EVAL_PROJECT_ID`, `NARRATIVE_EVAL_PROJECT_CONFIRMATION=dedicated-development` olvasható; általános OPENAI_API_KEY fallback nincs. Az environment marker a kezelő nyilatkozata, nem OpenAI project-ownership API-bizonyíték; a külön fejlesztési projektet az operátornak ellenőriznie kell. Titokfájl a repo/image/report része nem lehet.

```text
pnpm evaluate:narrative --mode paid --allow-paid --budget-usd <APPROVED_TOTAL_USD> --approval-id <APPROVAL_ID> --out .local/narrative-evaluation/paid-reviewed-source
```

Tiszta committed forrás kell. Az SDK explicit OpenAI végpontot, megadott projectet, default service tier-t, store=false-t és nulla SDK retryt használ. A közös provider parser retry minden fizikai kísérlete valódi admission/reservation előtt ellenőrzött; az új reviewed narrative policy legfeljebb nyolc slot, a régi policy hét slot, mindkettőben egy globális tartalmi javítás. Fix-canon pár legfeljebb hét összesített slot. Nem ismert usage után teljes reservation marad elszámolt; budget denial sem adja vissza a már elfoglalt slotot.

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


A creative szolgáltatói határidő 180 másodperc hívásonként; productionben külön `AI_FICTION_TIMEOUT_MS` (1000–300000 ms) szabályozza. A régi módok `AI_TIMEOUT_MS` határideje megmarad. A nagyobb strukturált author-kimenet miatt a hosszabb határidőt és tényleges össz-latenciát mérni kell; ez nem tesz kötelezővé hosszú választ, nem ad plusz hívást és nem emel USD-keretet.


A `--creative-only` külön, szintetikus olvasói diagnózis: csak az új creative út fut, nincs legacy/fixed kontroll ismételt költsége. `diagnosticOnly=true`, `complete=false`, így nem teljes benchmark és nem qualityRelease-bizonyíték. Több időszaknál az első, alternatív forkban a második opciót választja determinisztikusan; `selection=diagnostic-index`, `reviewed=false` és kifejezett nem-emberi indoklás kerül a logba. Ez nem szemantikai párosítás, nem valós user választása, és nem engedi meg a `reviewed=true` kitalálását. A teljes párosított benchmarkban változatlanul a tényleges szemantikai review szükséges. Példa: `pnpm evaluate:narrative --creative-only --mode offline --fixtures bounded-career --periods 3 --out .local/narrative-evaluation/creative-reading-diagnostic`.

A paid v1 első próbája két végső tervellenőrzésnél csonka, 80 karakteres decisionPattern miatt állt meg, noha mind a négy tervpont 4 volt. Új planner/author/reviewer v2 csak az új jobokban rövid snake_case címkét követel gépi patternnel és 80 karakteres határral; a reviewer javaslata is ebbe a mezőbe illeszkedjen. Régi v1 promptok hash-pinnel megmaradnak. Ez nem minőségküszöb-lazítás vagy a sikertelen mérés törlése.


A 32 KiB artifact túllépése strukturális csomagtömörítést igényelhet akkor is, ha a próza már átment. Ilyenkor az egyetlen javítás `author_package`, nem változatlan kánonhoz kötött `prose_only`; a domain és mindhárom végső ellenőr újra fut, max9-en belül. Az összes egyedi mezőben érvényes, de együtt túl nagy artifact regressziója ezt valós worker/DB útvonalon ellenőrzi. A byte-limitet nem növeltük és nem csonkítunk csendben.


## 2026-10-16-i explicit keretbővítés és szekvenciális próba

A tulajdonos a cumulative development maximumot 5-ről **10 USD-ra** engedélyezte. Az értékelő CLI ennyit fogad el; az ExperimentAiBudget alapértelmezett ceilingje továbbra 5, a narratív értékelő külön explicit 10-es maximumot ad át. Más smoke és production guard nem változik. Új approval ID: `user-2026-10-16-fiction-quality-10usd`. Ugyanaz a canonical ledger/bindings és dedicated development projekt marad; 190 korábbi hívás / 4,81984 USD sem törölhető. Régi source-bound run nem írható át új source identityra.

A qualityPolicy 2.1.0 kalibrációjában először a korábbi ismétlődő fejezetet kell a saját korábbi jeleneteivel és lezárásaival újraértékelni. Az új pontszám önmagában nem bizonyít javulást: az ismétlődő negatív kontrollt el kell utasítania. Ezután új többprofilos creative-only folytatások és fork, naplózott szintetikus választásokkal; nem vak emberi benchmark. A tényleges szövegeket külön is el kell olvasni. Ismételt kapuhiba után a költést meg kell állítani és az okot elemezni; nem szabad a küszöböt lejjebb vinni.


Az örökölt választások azonos időbélyeges sorrendhibájának javítását új forrású, friss fork-próbával kell igazolni. A korábbi sikeres kétperiodos prefix átvehető szintetikus regressziós kiindulásnak, de az eredeti forrás/fejezet/kanonikus hash és az új forrás/script/payload kötését együtt rögzíteni kell. Új fork és normál guarded worker szükséges; az eredeti failed job/payload, receipt és költség nem írható át. Ez célzott kétforrású continuity regresszió, nem a teljes benchmark új forrásra átnevezése.


## Legutóbbi lezárt diagnózis

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

A tulajdonos 2026-10-18-án összesen **legfeljebb új 8 USD v6 fogyasztást** engedélyezett, a korábbi maradékot beleértve. Nyitó eredeti ledger **305 hívás / 10.732030 USD accounted**, kumulatív ceiling **18.732030 USD**. A korábbi 4.472505 USD nem további keret. Stage A belső előirányzat 1.50 USD (ceiling 12.232030); a Stage B előtt az aktuális eredeti ledger és fennmaradó összesített authority újraellenőrzendő. Nincs ledger/bindings másolás, reset, productionkulcs vagy automatikus `.env` fallback. Default tier, store=false, dedikált development projekt, tiszta source és exact sourceHash kötelező.

A valódi hívás előtt közöljük a becslést, utána a tényleges accountolt fogyasztást. A sikertelen munka és a javítás is költség; külön rögzítendő az initial/final ok, repair típusa, fizikai hívás, idő, trace, yield, p50/p95, unknown usage és unassigned reservation. A 2026-10-18-án visszaolvasott [hivatalos ár](https://developers.openai.com/api/docs/pricing) változatlan: gpt-6.1-sol default/short input 2, cached 0.10, cache-write ceiling 2.50, output 10 USD/millió token. Az accounted összeg konzervatív elszámolás, nem API-egyenleg vagy szolgáltatói számla.

A blinded olvasói csomag kizárólag elfogadott teljes szövegeket, közös prefixű alternatív folytatást és semleges kérdéseket tartalmaz. Nincs modell-/policycímke, pontszám, javítás, trace, token vagy költség. Az emberi kérdések az érdemi változást, annak oksági útját, bezártságot, időbeli metronómot, döntésfelület-szivárgást és tovább olvasási/megújítási kedvet vizsgálják; válaszokat nem találunk ki.
