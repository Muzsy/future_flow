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

## Következő lépés

Exact-source CI és kódátnézés után, új számszerű engedéllyel: friss háromfejezetes munkahelyi előpróba (kb. 0,77 USD a v7 alapján), majd az audit és rövid humán olvasás; csak elfogadható eredménynél teljes kétprofilos mérés. Merge és production csak a tulajdonos kifejezett engedélyével.
