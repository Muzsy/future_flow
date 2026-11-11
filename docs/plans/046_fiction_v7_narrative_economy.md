---
status: active-supporting
owner: agents
created: 2026-10-18
base_commit: f755a57aca37ee6a2e995400c76fc0394f1cdc88
predecessor_pr: 50
issue: 45
workstream: F05/F06 quality follow-up
state: measured-candidate-partial
paid_provider_calls_authorized: true
numeric_authority_usd: 7.39
production_authorized: false
related:
  - 045_fiction_v6_earned_life_evolution.md
  - ../decisions/ADR-008-creative-fiction-final-author-canon.md
  - ../operations/NARRATIVE_EVALUATION_HU.md
---

# 046 — v7 fikciós jelölt: narratív ökonómia, lezáró bekezdések, mintajelzés és magánélet

## Állapot — 2026-10-18

A v6/quality2.5 a PR #50-ben mért checkpointként beolvadt (`f755a57`). Ez a terv a tulajdonos által a v6 korpusz és két külső AI-értékelés átnézése után elfogadott javításokat tartalmazza. A jelölt offline implementált és 2026-10-19-én valódi méréssel ellenőrzött (Stage A 3/3, Stage B 15/18 részleges; lásd [Valódi mérés](#valódi-mérés--2026-10-19-részleges)). A 7,39 USD-s keretből 0,775 USD maradt; új mérés csak új, számszerű tulajdonosi engedéllyel indulhat. Production, cohort, billing és entitlement nem változik.

## Kiválasztott tuple

| Elem | v6 checkpoint (befagyasztva) | v7 jelölt (új jobok) |
| --- | --- | --- |
| planner / author / plan reviewer | v6 | v7 |
| editor | v5 | v6 |
| fidelity | v1 | v1 (változatlan) |
| qualityPolicy | 2.5.0 (`fictionV6Quality25Policy()`) | 2.6.0 (`fictionV7Policy()`, `fictionPolicy()`) |
| editor report | 1.2.0 | 1.3.0 |
| sequenceSignature | 1.0.0 | 1.1.0 |

A 2.6.0 a 2.5.0 összehangolt fidelity+editor javítási útját örökli. Normál öt, legfeljebb kilenc fizikai kérés, egy globális tartalmi javítás, ugyanaz a modell, küszöbök, byte- és budget-guardok. A report 1.3.0 mezői és kapui azonosak az 1.2.0-val; egyetlen különbség, hogy a sequenceSignature 1.1.0, amely egy új rhetoricalFlags értéket ismer.

Befagyasztás: a v1–v6 prompt-hashek változatlanok, és a v6 editor provider felé küldött 1.2.0 output-sémájának hash-e a `f755a57` checkpointon számolt értékkel egyezik (`tests/fiction-v7-candidate.test.ts`). A közös `mechanics` szöveg nem változott; a v7 a saját másolatában cseréli le a szereplőkorlátot. Már sorban álló v1–v6 jobok a saját snapshotjukkal futnak le.

## Döntések és megvalósítás

1. **Visszatérő szereplők — narratív ökonómia.** A v6-ig örökölt „periódusonként legfeljebb egy új recurring actor_add” prompt-korlát a v7-ben megszűnik. Helyette: minden tartós, visszatérő új személy saját actor_add-ot kap, periódusonkénti darabszám nélkül; új visszatérő ember akkor lép be, ha saját akarata vagy más által nem betölthető oksági szerepe van. Egyszeri névtelen résztvevő nem kell regisztrálni. A domain 30-as actor-határa, a chronology/ID/privacy/memory/request guardok változatlanok.
2. **Döntési felület visszaszivárgása.** A v6 döntési határa a záró mondatra vonatkozott; a v7 kiterjeszti a teljes lezáró szakaszra (utolsó három bekezdés). Ott nem épülhet újra prózában a strukturált döntés két vagy több ága és azok ára. Az editor v6 a `systemMechanicsInvisible` jelzést erre is alkalmazza, bekezdés-indexes bizonyítékkal. Egyetlen természetes kívánság, ajánlat vagy aggodalom nem hiba.
3. **Túlmagyarázás, miközben a másik szereplő mással foglalkozik.** Új, sorozatszintű mintajelzés: `overexplain_while_other_busy` a sequenceSignature 1.1.0 `rhetoricalFlags` listájában. Az editor minden előfordulást rögzít; egy előfordulás nem hiba, nincs kvóta vagy tiltás. Csak ha az előzmény már tartalmazza, és a fejezet ugyanabban a funkcióban ismétli, akkor számít `distinctRhetoricalShape`/`behavioralVariety` bizonyítéknak — ugyanúgy, ahogy korábban az `almost_then_stop`. A planner/author látja a jelzést az előzményben, és alapértelmezésként más forrásból építi a jelenet érzelmi csúcsát. A második külső értékelés „1–2 előfordulás 8 fejezetben” javaslatát a v6 terv kvótatilalma miatt nem vettük át.
4. **Első draft konzisztencia-javítások kategorizálása.** Lásd az alábbi táblát. Mind az öt eset szerzői oldali: a próza és a typed állapot közti szemantikai eltérés, amelyet csak olvasó (fidelity) tud észlelni. Automatikus kánon-normalizálás nincs: az ADR-008 szerint a végső kánont a szerző adja, ennek megváltoztatásához dokumentált döntés kellene. A v7 author kap egy rövid egyeztetési útmutatót a meglévő típusokkal. Új determinisztikus strict check nem került be, mert egyik mért eset sem volt gépileg eldönthető.
5. **Magánélet (tulajdonosi döntés: „Mindkettő”).** Minden mérési profil 1–2 kitalált alap család-, pár- vagy barátkapcsolatot kap (`tests/narrative-fixtures.ts`), és az author takarékosan további, regisztrált magánéleti szereplőt vezethet be, ha a történetnek szüksége van rá. A megadott személyekről nem találhat ki új tartós magánéleti tényt (egészség, szakítás, pénz, munka, titok), és a biztonsági scope változatlan. Az új szereplő helyszínhez illő, köznapi nevet kap, amely nem egyezik egy másik fontos szereplő nevével.

## Első draft javítások (v6 hosszú mérés, 5 eset)

| Eset | Mit kért a fidelity | Kategória | Miért | v7 kezelés |
| --- | --- | --- | --- | --- |
| alkotói 3 | visszatérő névtelen szereplő regisztrálása | szerzői | csak a prózából látszik, hogy ugyanaz a személy tér vissza; az örökölt egyszereplős korlát is ütközhetett | narratív ökonómia, korlát feloldva |
| alkotói 4 | befejezett vállalás opportunity-lezárása | szerzői | a „befejezett” állapot prózai tény; a sémában nincs `completed` státusz | egyeztetési útmutató: a meglévő, hűen illő státusz |
| alkotói 8 | ajándékba adott portré typed asset-je | szerzői | tartós, következményes tárgy vagy apró ajándék — irodalmi mérlegelés | csak tartós, következményes tárgy kap asset-et |
| munkahelyi 3 | korábbi tapasztalat storyFact-je | szerzői | arról kell dönteni, hogy egy későbbi fejezet támaszkodik-e rá | continuity StoryFact útmutató |
| munkahelyi 4 | teljesített megbízás opportunity-lezárása | szerzői | mint alkotói 4 | mint alkotói 4 |

**Determinisztikus kategória:** a mért mintában üres. Lehetséges jövőbeli szigorú ellenőrzés például egy olyan nyitott opportunity, amelynek `expiresAt` dátuma a periódus vége előtt van; ezt egyik mért eset sem igényelte, ezért nem vezettük be. A `completed` opportunity-státusz hiánya sémadöntés, külön Issue-ban kezelendő.

## Mérési kérdések (nem szabályok)

A következő engedélyezett méréskor ezekre kell választ keresni. Egyikből sem lett prompt-kvóta vagy kapu:

- **Futások közti jelenetismétlés:** két független munkahelyi futás 3. fejezete szinte azonos próbafeladatot kapott (lemondási oldal, „előző este” vs. „48 óra” szabály). Megmarad-e a v7-ben?
- **Névdiverzitás profilon belül:** 18 fejezetben 6 keresztnév, a „Niamh” két profilban két külön fontos szereplő. A v7 private-life szakasza csak az új magánéleti szereplőnél kér eltérő nevet; a szélesebb kérdés mérési adat marad.
- **Karrierív-konvergencia:** a két munkahelyi futás hasonló életívre jut. A profil célja ezt részben magyarázza.
- **Hónapritmus:** a periódus domain szerint hat hónap (február–július / augusztus–január); csak a hónapváltások hasonló prózai elhelyezése stiláris kérdés. A v6 temporal-focus szakasz változatlan.
- **Magánélet súlya:** az új alapkapcsolatok megjelennek-e természetesen, anélkül hogy minden fejezet motorjává vagy terápiás eszközzé válnának.
- **Új szereplők száma:** a korlát feloldása után túl sok vagy túl kevés visszatérő szereplő jelenik-e meg.

## Ellenőrzés és következő lépés

Lefutott: `pnpm format:check`, `pnpm docs:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm schemas` (a `docs/contracts` diff csak az új 1.1.0/1.3.0 sémákat és a context-séma uniont tartalmazza). Az offline Stage A/B korpusz a v7 defaulttal fut.

Következő: exact-source CI és külön kódátnézés után új, számszerű költségengedéllyel friss háromfejezetes előpróba, majd elfogadható eredménynél teljes kétprofilos mérés két alternatív ággal; ezután a független emberi 17 kérdéses értékelés. A lezárt v6 korpusz nem egészíthető ki v7 forrással.

## Numerikus authority — 2026-10-19

A tulajdonos a v7 valódi mérésére **legfeljebb 7,39 USD** új fejlesztési fogyasztást engedélyezett. Kiinduló eredeti ledger a lezárt v6 után: 652 hívás / 33,4716975 USD accounted; új kumulatív plafon **40,8616975 USD** (`evaluationApprovedCumulativeBudgetUsd`). A v6 fel nem használt 0,2603325 USD maradéka nincs hozzáadva; nincs ledger-reset vagy másolt ledger. A futás előtt a mérőcheckout ledgerét vissza kell olvasni: ha az accounted összeg eltér a 33,4716975 USD-től, a mérés nem indul. Sorrend: friss háromfejezetes munkahelyi előpróba (no-fork), majd csak elfogadható eredménynél friss kétprofilos 18-célos mérés, ameddig a plafon engedi. A plafon kimerülése részleges mérés, nem ok a keret emelésére.

## Valódi mérés — 2026-10-19, részleges

Forrás `fb2ceb1071fc7dc8ec9949c9fda27c6b2614de37` (CI SUCCESS), ugyanaz a mérőcheckout és eredeti ledger, a tulajdonos által megerősített dedikált fejlesztési projekt. A kulcs csak a futás környezetébe került; log/output nem tartalmazza.

**Stage A** (`v7-quality26-career-smoke-paid`, munkahelyi 3 főági, no-fork): **3/3 elfogadott**, 15 hívás, 0 repair, 0 unknown. 0,76589 USD accounted (usage-becslés 0,67495). P50 17,3 s / P95 136,7 s hívásonként. Címek: The Sheet Beside the Printer · The Missing Notification · The Background Paragraph. Ügynöki olvasás: feltételes Go; egyik lezárás sem építi újra a döntési ágakat, a visszatérő szereplők (Niamh, Maeve) saját céllal lépnek be; watchpoint az azonos alakú csendes lezárás és a prózában meg nem jelenő alapkapcsolatok.

**Stage B** (`v7-quality26-long-paid`, seed `alterward-v7-quality26-stage-b-2026-10-19`, két profil × 8 + fork): **15 elfogadott / 1 elutasított / 2 hiányzó** a 18 célból. Alkotói 8 főági + fork kész (9/9); munkahelyi főági 1–5 + fork kész, a 6. fejezetet az editor elutasította (novelty 3; distinctDramaticStructure/distinctEnding/distinctRhetoricalShape false, két canon-scope major issue, repair nem futott), ezért 7–8 nem készült. 98 hívás, 6 repair (mind elfogadva), 0 unknown. **5,8490725 USD accounted**, kb. 0,39 USD/elfogadott fejezet; P50 26,3 s / P95 154,2 s.

Ledger: 652 / 33,4716975 → 667 / 34,2375875 → **765 hívás / 40,08666 USD**, 15 korábbi unknown, 0 nyitott foglalás; v7 összesen 6,61496 USD, maradék **0,775 USD** a 40,8616975 plafonig. Nincs ledger-reset, újrafuttatás vagy keretemelés.

### Válaszok a mérési kérdésekre (ügynöki olvasás, nem human PASS)

- **Döntési felület:** szó szerinti újraépítés nincs. Több lezárás viszont jelenetként előrevetíti a következő ágat (munkahelyi 5: „Operations Administrator” hirdetés; alkotói 8: rétegzett rajz; alkotói fork: vásárló). Ez még nem hiba, de a lezárási szabály hatását humán olvasásnak kell megítélnie.
- **Túlmagyarázás:** az `overexplain_while_other_busy` jelzés egyszer sem jelent meg, miközben enyhe, önkritikusan megírt előfordulások vannak (alkotói 1 és 4, munkahelyi 1). Az editor ezt a funkciót nem ismeri fel megbízhatóan.
- **Editor-jelzések:** az elfogadott 15 fejezetben minden sequence flag igaz és szinte minden pont 4. Az ügynöki olvasás vitatja a behavioralVariety/distinctDramaticStructure/distinctEnding értékeket: visszatérő ütem („a másik változtatást javasol → a főszereplő ellenáll, bosszús → félig enged”), és azonos alakú csendes, megfigyelő lezárások. Az elutasított munkahelyi 6 ismétlődése valós.
- **Futások közti ismétlés:** a „jelentkezés → gyakorlati próba → ajánlat → hívás, amelyben a munkáltató egy befejezetlen dokumentumot nyit meg” sor a Stage A 3., a munkahelyi 3. és az elutasított 6. fejezetben is megjelenik; a munkahelyi 1–2 cselekménye a Stage A 1–2-é.
- **Névdiverzitás:** szűk névkészlet; „Niamh Byrne” mindkét profilban és a Stage A-ban, „Kavanagh”, „Doyle” és „Maeve” több külön szereplőnél.
- **Magánélet:** alkotói anya egyszer természetesen; az iskolai barát a teljes alkotói ív központi, névtelen társszereplője (domináns); munkahelyi lakótárs csak az 1. fejezetben; munkahelyi nővér egyszer sem. Az alapkapcsolatok egyenetlenül élnek.
- **Új szereplők:** a feloldott korlát mellett nem lett túl sok: munkahelyi Orla Kavanagh (3–5) és Declan Walsh (4–5) működő visszatérő szereplők; a többi egyszeri.
- **Pozitív:** az alkotói 8 valódi önálló munkába fordul, a munkahelyi 5 a hat hónapos szerződést tényleg lezárja, az alkotói fork (bizományos könyvesbolt) külön út.

Következtetés: a v7 technikailag stabilabb (0 unknown, minden repair sikeres, kevesebb elutasítás a v6 hosszú méréshez képest), de a sorozatszintű változatosság (visszatérő ütem, lezárási alak, futások közti cselekmény, névkészlet) és az editor önértékelése nem igazolt. Nincs teljes kétprofilos B8, human PASS, merge vagy production engedély. Kimenetek a tulajdonos gépén: `.local/narrative-evaluation/v7-quality26-long-paid/human-review/sequence-index.html`.
