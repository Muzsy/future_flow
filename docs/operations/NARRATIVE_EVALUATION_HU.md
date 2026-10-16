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

Az elfogadott fejlesztési terv külön emberi engedélyt kér a fizetett benchmarkhoz. Szükséges a konkrét approval azonosító, legfeljebb 5 USD **összesített fejlesztési keret**, valamint külön fejlesztési OpenAI project és project/service-account kulcs. A személyes béta éles kulcsát/windowját/ledgerét nem használjuk. A fájlban tárolt kulcs útvonalát kell az operátornak átadni, a kulcsot nem chatben.

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
