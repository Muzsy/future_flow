---
status: active-supporting
owner: agents
created: 2026-10-19
base_commit: 98bdfc3
predecessor_pr: 51
issue: 45
workstream: F05/F06 quality follow-up
state: offline-candidate
paid_provider_calls_authorized: false
production_authorized: false
related:
  - 046_fiction_v7_narrative_economy.md
  - ../decisions/ADR-008-creative-fiction-final-author-canon.md
  - ../operations/NARRATIVE_EVALUATION_HU.md
---

# 047 — v8 fikciós jelölt: determinisztikus sorozatbizonyíték, névpaletta és költségmentes ellenőrzés

## Állapot — 2026-10-19

A v7 (PR #51, 2026-10-19-én mérési checkpointként merge-elve, `466ed29`, production nélkül) mérése és két független olvasat után ez a terv rögzíti, mit javítunk a v8-ban, és hogyan ellenőrizzük **fizetős modellhívás nélkül**. A v8 a v7 ágából indult; a PR #51 merge-e után a PR #52 célága a `main`. A jelölt offline implementált; valódi mérés nem futott (a v7 keretből 0,775 USD maradt, új futás csak új számszerű engedéllyel). Production, cohort, billing és entitlement nem változik.

## Diagnózis: mi maradt a v7 után

| Tünet (v7 olvasat)                                                        | Ok                                                                                                | Miért nem elég egy újabb promptszabály                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Neither of you…” 7×, azonos alakú csendes lezárások                      | az editor csak a legutóbbi 3 fejezet nyitó/záró részletét és kategória-címkéket lát               | a szerkesztő a saját címkéit megbízhatatlanul adja (az `overexplain_while_other_busy` egyszer sem szólalt meg, minden flag igaz), tehát az ismétlés mérése nem bízható rá |
| visszatérő ütem: a másik javasol → a hős bosszúsan ellenáll → félig enged | ugyanaz a modell-alapértelmezés minden fejezetben                                                 | az ütem neve eddig nem szerepelt a promptban; ez az egy pont kap célzott, rövid szöveget                                                                                  |
| Niamh Byrne minden futásban, Kavanagh/Doyle/Orla/Maeve több szereplőn     | a modell kedvenc ír nevei; minden profil `IE`; nincs per-élet változatosság                       | a „használj változatos nevet” szabály nem hat, ha a modell mindig ugyanabból a szűk eloszlásból választ                                                                   |
| a nővér sosem jelenik meg, az anya egyszer, a barát névtelen              | a profilokban csak szerepcímke volt („Fictional older sister”), és senki nem számolta, ki tűnt el | a v7 private-life szabály nem tudja, hogy egy személy hány fejezete hiányzik                                                                                              |
| az alkotói szál az 5. fejezettől topog, nem jut el külső olvasóig         | a goal typed állapota fejezeteken át nem változik, és ezt senki nem jelzi                         | az earned-evolution szöveg megvan; hiányzik a tény, hogy a cél hány fejezete áll                                                                                          |
| a három munkahelyi szöveg cselekményváza azonos                           | futások közti modell-prior; egy életen belül csak a 3 fejezetes ablak látszik                     | futások közti ismétlést egy élet promptja nem láthat; ezt mérni kell, és a névpaletta/ledger csökkenti                                                                    |

## Döntések és megvalósítás (v8 / quality2.7)

Kiválasztott tuple: planner/author/reviewer **v8**, editor **v7**, fidelity v1, qualityPolicy **2.7.0** (`fictionV8Policy()`, `fictionPolicy()`), report 1.3.0 / signature 1.1.0 változatlan sémával. A 2.7.0 a 2.6.0 összehangolt javítási útját örökli; kérés-, repair-, byte- és budget-guard nem változik. A v1–v7 prompt-bájtok befagyasztva (a v7 hash-ek tesztje változatlanul zöld), a v8 szöveg a v7 végére fűzött kiegészítés.

1. **Determinisztikus sorozatnapló (`seriesLedger` 1.0.0).** A szerver minden saját fejezetből kiszámolja (`packages/core/src/fiction-series.ts`, `fictionSeriesLedgerFrom`): több fejezetben visszatérő mondatnyitások és ötszavas fordulatok (darab + fejezetszám), az utolsó hat fejezet záró mondata, a megadott pár/család/barát szereplők jelenléte (hány fejezet eseményében szerepeltek, mióta nem), és célonként, hány fejezete nem változott a typed goal-állapot. Csak quality2.7 contextben lehet, saját 3 KiB-os határa van, withheld memóriánál nem kerül be. Ezek tények, nem kvóták: a v8 szöveg kifejezetten kimondja, hogy egyik szám sem ír elő eseményt.
2. **Szerkesztői bizonyíték (`seriesEchoFindings`).** Az editor kérése determinisztikus listát kap arról, hogy az új fejezet narrációja hol használja újra a naplóban már visszatérő nyitást vagy fordulatot. Az editor v7 ezt mért tényként kezeli: ≥2 előfordulás vagy két különböző találat esetén `distinctRhetoricalShape=false`, a záró mondatot a `recentClosings`-hoz méri, és a „javaslat–bosszús ellenállás–félig engedés” ütem ismétlésére nem adhat `behavioralVariety=true`-t. Kapu-, séma- és repair-szabály nem változik; a gépi mérés a modell önértékelését pontosítja, nem írja felül.
3. **Per-élet névpaletta (`castingProjection`).** Kérésenként, tárolás nélkül számolt, az élet azonosítójából seedelt 10 keresztnév + 8 családnév az ország (IE, GB, US, HU, illetve hu locale) készletéből, az életben már használt névtagok kizárásával. A készletből szándékosan kimaradtak a v7 alapértelmezései (Niamh, Byrne, Kavanagh, Doyle, Orla, Maeve). Ajánlás, nem engedélylista: bármely más helyhez illő név megengedett, meglévő szereplő nem nevezhető át.
4. **Visszatérő ütem és cselekményváz.** Egy rövid v8 szakasz megnevezi a két mért mintát (javaslat → ellenállás → félig engedés; jelentkezés → próba → ajánlat → hívás), és azt kéri, hogy ha az előzmény ezt mutatja, a periódus a hős saját tettén, kudarcán vagy elutasításán forduljon. Ez nem kvóta és nem ütemterv.
5. **Mérési profilok.** Minden kitalált alapkapcsolat keresztnevet kapott (`Fictional older sister Clodagh`, `Fictional school friend Nessa` stb.). Ez új sourceHash-t ad; a v6/v7 korpusz nem egészíthető ki v8 forrással.

Nem változik: automatikus kánon-javítás (ADR-008), a v7 túlmagyarázás-jelzése (megmarad, de nem építünk rá), ütemterv vagy fejezetszám-alapú szabály (a tulajdonos 2026-10-17-i döntése szerint tilos).

## Költségmentes ellenőrzés

Három szint, egyik sem hív fizetős modellt és nem ír a ledgerbe:

1. **Determinisztikus egység- és integrációs tesztek** (`tests/fiction-v8-candidate.test.ts`, `tests/fiction-worker.test.ts`): a ledger, a visszhang-találatok, a névpaletta és a context-határok szintetikus „v7-szerű” prózán; a következő job contextjében valódi adatbázison át megjelenik a napló; a v7 prompt-hash-ek változatlanok. CI-ben fut.
2. **Offline sorozat-audit a már legenerált fejezeteken:** `pnpm narrative:audit --out <dir> <run-dir>...` a tárolt `report.json`-okból számol: ismétlődő nyitások/fordulatok, fejezetenként mit jelzett volna a v8 editor-bizonyíték, záró mondatok, névgyakoriság, magánéleti szereplők említése, futások közti közös teljes nevek és fordulatok, azonos profil azonos fejezetének lexikai átfedése. Ez a v6/v7 baseline; a következő mérés ugyanezzel a paranccsal hasonlítható. Eredmény: lásd [Baseline](#baseline--v6v7-audit).
3. **Elfogadási küszöbök a következő engedélyezett méréshez**, ugyanazzal az audittal, a humán olvasás mellett: lásd a [Baseline](#baseline--v6v7-audit) szakaszt. A tulajdonos és a független olvasás dönt.
4. **Helyi Codex-futtatás** (opcionális, előfizetésből): lásd [Codex vizsgálat](#codex-vizsgálat--2026-10-19).

### Helyi Codex mint ingyenes futtató

A tulajdonos javaslata (2026-10-19): a gépén telepített Codex CLI ugyanazzal a modellel, előfizetésből futtathatná a generálást. Vizsgálat eredménye: lásd [Codex vizsgálat](#codex-vizsgálat--2026-10-19).

## Baseline — v6/v7 audit

2026-10-19, a tulajdonos gépén, a `811515d` forráson, modellhívás nélkül; bemenet a `v6-quality25-base-window-paid`, `v7-quality26-long-paid` és `v7-quality26-career-smoke-paid` `report.json`-ja. Csak főági szekvenciák (a forkok egyfejezetesek):

| Szekvencia    | Fejezet | v8 szabály szerint jelölt | Legerősebb ismétlődő nyitás                                             | Magánélet név / szerepszó szerint        |
| ------------- | ------- | ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| v6 munkahelyi | 6       | 2                         | „there is no” 6× / 4 fejezet                                            | nővér 0/0, lakótárs 0/0                  |
| v6 alkotói    | 8       | 1                         | 6 nyitás egyenként 3× / 3 fejezet                                       | anya 0/0, barát 0/0                      |
| v7 munkahelyi | 5       | 2                         | „there is no”, „you read the” 5× / 4                                    | nővér 0/0, lakótárs 0/1                  |
| v7 alkotói    | 8       | 1                         | „neither of you”, „you leave it”, „you leave the”, „you put the” 4× / 4 | anya 0/1, barát 0/8 (csak „your friend”) |
| v7 előpróba   | 3       | 0                         | „you have been” 3× / 3                                                  | nővér 0/0, lakótárs 0/0                  |

Futások közt: a „Niamh Byrne” teljes név két független szekvenciában; a v6 alkotói sorozatban Aoife 5, Niamh 4 fejezetben. Azonos profil azonos fejezetének lexikai átfedése 0,11–0,23 (a durva mérőszám a cselekményváz-egyezést nem fogja meg; azt továbbra is olvasás dönti el).

Mit mutat: az olvasat fő állításai gépileg is látszanak (nyitás-tikk, a nővér és a barát neve sosem jelenik meg, Niamh Byrne futások között), tehát a v8 napló a valódi hibát kapja. Az editor-szabály szándékosan mérsékelt: egyetlen visszatérés egy 2 fejezetben már szereplő nyitásra még nem jelöl, mert a jelölés elutasítást és újabb kérést okoz; a szerző viszont az összes ismétlődő nyitást „kerülendő” listaként kapja. Ha a következő mérés szerint a szerzői oldal nem elég, a szigorítás egy küszöbcsere a `seriesEchoFlags`-ben. Ismert zaj: helynevek (pl. „Ireland”) névként jelenhetnek meg az auditban.

**Elfogadási küszöbök a következő engedélyezett méréshez** (a fenti baseline-hoz képest): egyik nyitás sem fordul elő 3-nál több fejezetben; a futások közti közös teljes nevek száma 0; minden alapkapcsolat név szerint legalább egy fejezetben megjelenik; a jelölt fejezetek aránya nem nő. Ezek fejlesztési jelzések, nem release gate.

## Codex vizsgálat — 2026-10-19

Tények a tulajdonos gépén, modellhívás nélkül: `codex-cli 0.159.1`, **ChatGPT-fiókkal** belépve; `OPENAI_API_KEY` és `CODEX_API_KEY` nincs beállítva; a config alapmodellje `gpt-6.1-sol` (a modell-cache szerint elérhető, `supported_in_api=true`); a `codex exec` ismeri a `--output-schema`, `--model`, `--config`, `--ephemeral` és `--sandbox read-only` opciókat.

Megvalósítva: `pnpm narrative:codex` (`scripts/evaluate-narrative-codex.ts`, `scripts/lib/narrative-evaluation-codex.ts`). Mindig offline módban fut, a pipeline minden kérését `codex exec`-kel teljesíti egy üres ideiglenes mappában, a szerver ugyanazt a validációt, javítási utat és artefaktumot használja. A gyermekfolyamat semmilyen `OPENAI_*`, `CODEX_API_KEY` vagy `NARRATIVE_EVAL_*` változót nem kap, a paid opciókat elutasítja, ledgert és budget-guardot nem érint; a kimenet mellé `codex-local.json` kerül `comparableWithPaid: false` jelöléssel.

Mire elég: gyors, dollárköltség nélküli iterációra (például hogy a v8 napló csökkenti-e az ismétlődő nyitásokat az auditban), séma- és pipeline-hibák keresésére valódi modellválaszokkal, és olvasási korpusz előállítására. Mire nem: a hivatalos mérés helyettesítésére. Eltérések: a Codex saját ügynöki utasításai a mi rendszerpromptunk elé kerülnek; a reasoning effort és a mintavétel nem azonos a termék Responses API-hívásával (a futtató `low` effortot állít be, `ALTERWARD_CODEX_EFFORT`-tal változtatható); nincs token- és költségadat; a strukturált kimenetet a Codex kényszeríti ki. Az előfizetés kvótáját fogyasztja (a v7 háromfejezetes előpróbája 15 hívás volt, javítással több). Futtatás csak a tulajdonos kifejezett engedélyével.

## Codex előpróba — 2026-10-19

A tulajdonos engedélyével (a szálban, 11:46) a `7196e6c` forráson, a gépén, ChatGPT-előfizetéssel, `gpt-6.1-sol` `low` efforttal: háromfejezetes munkahelyi előpróba, kilépési kód 0, **3/3 elfogadva**, 15 Codex-hívás (5/fejezet), 0 javítás, kb. 3,5 perc/fejezet, API-költség és ledger-írás nincs. Fejezetek: „The Room Beyond Reception” (749 szó), „The Missing Middle” (779), „At Actual Size” (798). A kimenet csak a gépen van (`/tmp/ff-v8-codex-out/v8-codex-smoke-2`).

| Mutató (`pnpm narrative:audit`)       | v7 fizetős előpróba | v8 Codex előpróba  |
| ------------------------------------- | ------------------- | ------------------ |
| Ismétlődő nyitások                    | 7                   | 3 (mind 2×)        |
| Visszhang miatt jelölt fejezet        | —                   | 0/3                |
| Záró mondat átlagos hossza (szó)      | 16,7                | 9                  |
| Alapkapcsolatok név szerint (fejezet) | nővér 0, barát 0    | Clodagh 1, Tunde 2 |
| Futások közti közös teljes név        | Niamh Byrne         | nincs              |
| Azonos profil szóátfedése             | —                   | 0,136–0,18         |

Olvasás: a palettáról jöttek az új nevek (Fiona Hegarty, Nuala Cullen); a cselekményváz már nem pályázat → próbafeladat → ajánlat → hívás, hanem saját térképprojekt, kudarc, visszajelzés, önkísérlet, portfólió; a rokonok saját szándékkal lépnek be, a nézeteltérések nyitva maradnak. Megmaradt: minden fejezetben visszatér egy ingerültség-ütem (más szavakkal), a csendes megfigyelő zárások egymáshoz hasonlók, a 3. fejezet befelé forduló, kevés szereplővel és tételmondatszerű zárással, a pályaváltási cél lassan halad. Irányjelzés, nem összevethető a fizetős méréssel.

### Második Codex-kör: ingerült pillanat — 2026-10-19

Ugyanaz a háromfejezetes kör `948e72a` alapon, egy helyi, nem commitolt promptváltozattal (a szereplő ingerült reflexe legfeljebb egyszer fejezetenként, egymást követő fejezetekben nem; az editor ilyenkor `behavioralVariety=false`). 3/3 elfogadva, 19 hívás, a 3. fejezet egy javítással ment át, mert az editor az 1. fejezet motorjának ismétlését találta (novelty 3). Narrált súrlódásszavak fejezetenként: előző v8 kör 3/3/3, v7 1/3/2, új kör 0/0/0; kézi olvasás szerint maga a gesztus is eltűnt, a súrlódás a mellékszereplőktől jön és nyitva marad. Ismétlődő nyitás 1 („for a moment” 2×); Clodagh 2, Tunde 3 fejezetben név szerint. Maradt: új apró tikk („You had hoped… / You had expected… Instead”), a Clodagh-séta mindkét Codex-körben visszatér. A commitolt változat (`83c76b7`) ezt determinisztikus `frictionBeat` naplóval és editor-bizonyítékkal valósítja meg, és még nem futott Codexen. Irányjelzés, nem összevethető a fizetős méréssel.

### Harmadik Codex-kör: commitolt változat — 2026-10-19

`b332a22`, tiszta forrás, ugyanaz a profil és seed: **1/3**, 16 hívás. Az 1. fejezet egy javítással ment át (choiceStakes 3), súrlódásszó 0. A 2. fejezet a javítás után is `distinctEnding=false` lett, mert a zárás az 1. fejezet fogását ismételte (hétköznapi háttérzaj szakítja meg a tovább folyó tevékenységet: busz → vízforraló), és több javítás nem fér bele, így `NARRATIVE_QUALITY_FAILED`; a 3. fejezet nem futott. A súrlódás-szabály működött; a bukás oka a zárásfajta ismétlése, a kapu helyesen fogta meg. Válasz: a v8 planner/author `ENDING-KIND CRAFT` blokkot kap, amely a zárások _fajtáját_ nevezi meg (felfüggesztett tevékenység háttérzajjal), és ilyenkor más zárásfajtát kér. A kaput nem lazítjuk. A Codex-oldali variancia nagy (3/3 → 1/3 ugyanazzal a seeddel).

### Negyedik Codex-kör és szereplőváltozás — 2026-10-19

`101c899`: 0/3. Az 1. fejezet irodalmilag átment (editor pass, a zárás új fajta: kimondott mondat), de a fidelity a névtelen tesztelőket regisztrálatlan jelenetszereplőnek vette, a javítás két `actor_add`-ot adott, és a domain-validátor („Only one new recurring actor may be introduced”) determinisztikusan elutasította. Gyökérok: a v7 prompt kvóta nélküli szereplőfelvételt kért, a validátor egyet engedett. Tulajdonosi döntés: quality 2.6/2.7 alatt legfeljebb 3 új visszatérő szereplő periódusonként, és szereplők távozhatnak a történetből. Megvalósítás: Life V2 `actor_remove` (publikus forkban `actorKey`), a távozó a saját eseményében még szerepelhet; v8 alatt csak kitalált szereplő távozhat; v8 `CAST-CHANGE CRAFT` és bővített `sceneActorRule` (névtelen egyszeri szereplő nem jelenetszereplő). Ismert hiány: a diagnosztika nem tárolja a validátor kivételét, és a fidelity indoklása a javítási utasítás közepén csonkul.

### Ötödik Codex-kör: szereplőváltozás után — 2026-10-19

`37f9b00`, tiszta forrás, ugyanaz a profil és seed: **3/3 elfogadva**, 22 hívás, 2 javítás (ch1: fidelity, regisztrálatlan tény és februárnál korábbi múlt; ch2: editor, choiceStakes 3), ch3 elsőre átment. Szereplőváltozás: ch1 egy `actor_add` (Fiona Carroll), később se új szereplő, se `actor_remove`; a 3-as keret és a távozás három periódusban nem került próbára. Súrlódásszó 1/3 (egy téves találat: „dislike” egy dokumentumrészre); visszhang miatt jelölt fejezet 0/3; zárások: kimondott mondat, felismerés, reprodukálhatatlan kép, egyik sem felfüggesztett tevékenység. Visszatérő motívum maradt: a „longer route” séta és a vacsorával félbeszakított munka. A ch3 valódi külső kudarcot hoz (elutasítás az interjú után), és a pályaváltási cél végre a külvilágba ér. Egy Codex-hiba: a fidelity indoklásába kínai írásjelek kerültek, és szó szerint bementek a javítási üzenetbe. Irányjelzés, nem összevethető a fizetős méréssel.

### Fizetős mérési keret — 2026-10-19

Tulajdonosi döntés (15:29, a szálban): **8 USD** a v8/quality2.7 mérésre. Kumulatív plafon `48.0866575` = lezárt v7 ledger `40.0866575` (765 hívás; v7 6,61496) + 8; a fel nem használt v7 maradék (0,775) nem adódik hozzá, a ledger nem nullázódik. Menet: Stage A háromfejezetes career-transition előpróba fork nélkül, `--budget-usd 41.5866575` (legfeljebb 1,50 USD); csak elfogadható eredmény után Stage B kétprofilos mérés a v7-long felépítésével, `--budget-usd 48.0866575`. A béta 10 USD-s kerete külön van, ezt a ledgert nem terheli.

### Fizetős Stage A előpróba — 2026-10-19

`b9f3195`, tiszta forrás, career-transition, 3 periódus, fork nélkül, `--budget-usd 41.5866575`, approval `v8-stage-a-smoke`: **3/3 elsőre elfogadva**, 15 hívás, 0 javítás, 0 hiba, elszámolt **0,81911 USD** (v7 smoke 0,76589), P95 generálási idő 257,2 s. Ledger: 765 → **780 hívás**, 40,08666 → **40,90577 USD**, 0 nyitott foglalás; a 48,0866575 plafonig **7,18 USD** maradt. Minden fejezetnél plan_review 4/4/4/4, fidelity valid, editor pass, minden pontszám 4; egyetlen minor megjegyzés a ch3 vitajelenetére. Szereplők: ch1 Ella Carroll (koordinátor), ch3 Joanne Keane (interjúztató); `actor_remove` nem fordult elő. Audit (v7 smoke-hoz mérve): súrlódásszó 3/3 → 0/3, átlagos zárómondat 16,7 → 8,3 szó, visszhang miatt jelölt fejezet 0/3, a nővér és a barát név szerint 1, illetve 2 fejezetben (v7: 0/0), közös teljes név nincs, szóátfedés 0,17–0,18. Maradt: ismétlődő nyitások („there is no” ×3, „you read the” ×3, az első előfordulás után a szabály nem jelöli), a Clodagh-séta a hosszabb úton és Tunde vacsorával megszakított munkája szinte minden körben, „Carroll” vezetéknév a Codex-körökben is. Olvasás: a fejezetek valódi következményláncot építenek (hiányzó fájl → javítás → a tisztítás kiradírozza a számot → elutasítás → interjú, ahol a főszereplő magabiztos szerkesztése téved → ajánlat), a mellékszereplőknek saját céljuk van. Egy futás nem általánosít; a v7 hasonló kerete 6,61 USD volt a teljes mérésnél.

### Fizetős Stage B teljes mérés — 2026-10-19

`b9f3195`, tiszta forrás, két profil (creative-portfolio, career-transition), 8 periódus + fork, `--budget-usd 48.0866575`, approval `v8-stage-b-window`. **Részleges: 16/18 minta elkészült és elfogadva**, a futás a career 8. fejezet kontextus-összeállításánál `NARRATIVE_CONTEXT_INVALID` hibával állt le (exit 1), modellhívás nélkül; nem indítottuk újra, a plafont nem emeltük. Hiányzik: career 8. fejezet és career fork. Elkészült: creative 1–8 + fork (9/9), career 1–7.

Költség: **95 hívás, mind completed** (nincs response_unavailable, timeout), elszámolt **5,78719 USD** (v7-long: 98 hívás, 5,849 USD, 15 minta). Ledger: 780 → **875 hívás**, 40,90577 → **46,69296 USD**; a 48,0866575 plafonból **1,39 USD** maradt. Minőségi bukás nincs (a v7-ben a career 6. elutasítva); javítás 6 mintánál kellett (creative 4., 5., 7., fork; career 5., 6.), mind elfogadva.

Audit (v7-long-hoz mérve): súrlódásszó creative 8/8 → 1/8, career 4/5 → 1/7 (a találat: „annoyed”, illetve „dislike” — az utóbbi téves); visszhang miatt jelölt fejezet 3/13 → 0/15; magánélet-szálak név szerint (Nessa 6/8, Bernadette 3/8, Clodagh 3/7, Tunde 3/7; v7: 0); sorozatok közti névismétlés nincs. Maradt: ismétlődő nyitások („there is a”, „you explain that”, „in january you”, „you had expected”, „you spent most” — mind ×3).

Szereplőváltozás: creative 1 Sinéad Dolan; career 1 Úna Hegarty, 3 Fiona Cullen, 5 Joanne Daly, 6 Ella Moran (két egymás utáni „dokumentációs vezető”); **`actor_remove` egyszer sem fordult elő**.

Időigény (medián / P95 / max, s): plan 116/132/175 (v7: 151/176/178); author 95/106/112 (v7: 121/157/162); plan_review 6/8/14; fidelity 5/7/9; editor 22/37/40; fejezet falióra 262/387/401 (v7: 341/499/500). Egyik hívás sem lépte át a 180 s-ot (a creative fork plan-hívása 175 s), de a fejezetenkénti falióra 4–7 perc, ezért a termékben aszinkron kezelés kell; javítás nélküli fejezet 206–271 s, javított 335–401 s.

A leállás valószínű oka (nem bizonyított, a CLI csak a kódot írja ki): `packages/database/src/fiction-memory.ts` „Required fiction continuity cannot fit its context bound” (12 KB-os memóriakeret / legfeljebb 24 kötelező tény; a `sequenceHistory`-t a vágás soha nem csökkenti, a career szálban 4 új szereplő rögzített ténye marad), másodlagos jelölt a `fictionReferenceProjection` 2048 bájtos korlátja. Modellhívás nélküli visszajátszással igazolható; a javítás külön döntés.

### Kontextushiba okának megerősítése és javítása — 2026-10-19

Ingyenes, modellhívás nélküli visszajátszás a Stage B futás saját adatbázisának másolatán (7. karrierfejezet utáni állapot): ugyanaz a kivétel, `NARRATIVE_CONTEXT_INVALID`, a méretági. A vágások után a kontextus **12 332 bájt** a 12 288-as korlát ellen (44 bájt túllépés); a kötelező tények száma 6 (a 24-es ág nem érintett). Bontás: `sequenceHistory` 5 546 B (a vágási lánc nem csökkentette), kötelező tények 2 458 B, `fictionalActors` 2 349 B (4 szereplő), a többi a minimumon. Javítás (`boundFictionContext`): a szignatúra-előzmények kiürítése után a nyers `sequenceHistory` a legrégebbi bejegyzéstől vágódik, legalább a legközelebbi periódus megmarad; a hívó tömbje nem módosul. A kötelező tények, nyitott szálak, szereplőprofilok és a 12 KB-os korlát változatlan; a seriesLedger a korláton kívül utazik, így az ismétlés-jelzés megmarad. Regressziós teszt: `tests/fiction-human-core.test.ts`. Ugyanebben a körben: a memóriába (`personalNarrativeMemory`) már csak azok az invented szereplők kerülnek, akik a legutóbbi periódus végállapotában még jelen vannak, így a távozottak (`actor_remove`) nem foglalják a keretet; a végállapot nélküli (régi) sorok viselkedése változatlan. Teljes pipeline-tesztet erre nem írtam (a kanonikus adat módosíthatatlan, az `actor_remove` még nem futott éles mérésben); a lefedettség a meglévő narratív integrációs tesztekre és a következő mérésre épül.

### Ingyenes keretméret-összehasonlítás (12/16/24 KiB) — 2026-10-19

`9e4d18b`, Codex CLI (ChatGPT-fiók, API-kulcs és ledger nélkül), career-transition, 8 periódus + fork, a Stage B seeddel; a konstans csak ideiglenes worktree-kben volt átírva. Irányjelző, a szórás nagy. **12 KiB: 9/9 kész**, 49 hívás, 1 javítás, nincs hiba; a korábban leállító 8. fejezet kontextusa 10 483 B (2 nyers sequenceHistory-bejegyzés marad), a 9. bemenete 12 023 B. **16 KiB** (2 próba) és **24 KiB** (2 próba) 0–2 kész fejezetnél leállt, amikor a memória még szinte üres: bejegyzetlen előtörténet (fidelity), csak minor issue-kra „revise” az editortól, egyszer `AI_PROVIDER_FAILED` (három párhuzamos futás). Következtetés: a keretméretről ebből a körből nem dönthető; context-bound dobás egyik futásban sem volt. A 12 KiB-nál a régi periódus-összefoglalók (memory.history) már kiesnek, csak a legutolsó marad. Falióra (12 KiB) fejezetenként 168–274 s, medián 190 s. Audit (12 KiB, 8 fejezet): súrlódásszó 1/8, visszhang 1/8, ismétlődő nyitások maradtak (×3), Clodagh és Tunde 5/8 fejezetben; `actor_add` három fejezetben, `actor_remove` nem fordult elő. Visszatérő kapuhatások, amelyek több fejezetet visznek el, mint bármi más: (a) bejegyzetlen előtörténet az 1. fejezetben (a mai körökben 4. alkalom); (b) javítás után csak minor issue-k miatti elutasítás. Keretemelés csak ezek kezelése után, 1–2 párhuzamos futással mérhető.

## Következő lépés

Exact-source CI és kódátnézés után, új számszerű engedéllyel: friss háromfejezetes munkahelyi előpróba (kb. 0,77 USD a v7 alapján), majd az audit és rövid humán olvasás; csak elfogadható eredménynél teljes kétprofilos mérés. Merge és production csak a tulajdonos kifejezett engedélyével.
