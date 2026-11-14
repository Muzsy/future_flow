---
status: active-supporting
owner: personal-simulation
created: 2026-11-12
base_commit: 27adddc46d2d7da6f04a022bd2b1774530089684
workstream: TI (történetirányok)
state: specification-ready
paid_provider_calls_authorized: false
production_authorized: false
related:
  - 049_story_directions_01_product_ux_hu.md
  - 049_story_directions_02_contracts_data_hu.md
  - 049_story_directions_03_engine_hu.md
  - 049_story_directions_04_publication_ops_hu.md
  - 049_story_directions_05_tests_acceptance_hu.md
  - 049_story_directions_06_work_packages_hu.md
---

# 049 — Választható történetirányok és opcionális cél: áttekintés

Ez a dokumentumcsomag megvalósításra kész terv. Kódot, adatbázist és éles beállítást nem módosít, fizetős AI-hívást nem engedélyez. Nem kanonikus forrás: a megvalósító első PR-je vezeti át a döntéseket a kanonikus dokumentumokba (lásd [06, TI00](049_story_directions_06_work_packages_hu.md#ti00--döntések-és-kanonikus-dokumentáció)).

## 1. Dokumentumtérkép

| Fájl | Tartalom |
| --- | --- |
| `049_story_directions_00_overview_hu.md` | Cél, rögzített döntések, forrásállapot és eltérések, architektúra-döntések, nyitott tulajdonosi döntések |
| [`…_01_product_ux_hu.md`](049_story_directions_01_product_ux_hu.md) | Irányok, altípusok, kezdőhelyzetek, kérdések pontos szövege, indító folyamat, vizuális javítások |
| [`…_02_contracts_data_hu.md`](049_story_directions_02_contracts_data_hu.md) | Sémák, payloadok, validáció, kompatibilitás, tárolás, migráció, adatkezelés |
| [`…_03_engine_hu.md`](049_story_directions_03_engine_hu.md) | Politikai irány vizsgálata, v10 policy, promptok, kérésprojekció, folytonosság, elágazások |
| [`…_04_publication_ops_hu.md`](049_story_directions_04_publication_ops_hu.md) | Publikálás, jogosultság és elszámolás, kiadás, bevezetés, monitorozás, visszaállítás |
| [`…_05_tests_acceptance_hu.md`](049_story_directions_05_tests_acceptance_hu.md) | Unit-, integrációs és felületi tesztek, elfogadási feltételek, későbbi tartalmi próbák |
| [`…_06_work_packages_hu.md`](049_story_directions_06_work_packages_hu.md) | Munkacsomagok, sorrend, függőségek, érintett fájlok |

## 2. A megvalósítandó végeredmény

1. A történetindítás elején a felhasználó egy történetirányt választ. Az irány határozza meg a további kérdések egy részét és a felkínált kezdőhelyzeteket.
2. A cél megadása opcionális. Cél nélkül a történet a szereplők, a helyzetek és az elfogadott döntések nyomán alakul, a meglévő folytonossági szabályok szerint.
3. Az irány az élethez (`aw_lives.input`) kötve, módosíthatatlanul tárolódik, és az élet minden ágára érvényes.
4. A választott irány a tervező, az író, a három ellenőrző és a javítási kör kérésében is megjelenik, a folytatásokban és az elágazásokban is.
5. A régi történetek, piszkozatok és futó generálások változatlanul működnek; régi adatra utólag sem irány, sem cél nem kerül.
6. Új irány, altípus, kezdőhelyzet vagy kérdés hozzáadása katalógusbővítés, nem az indító folyamat újraépítése.

## 3. Rögzített termékdöntések

Ezek követelmények; a terv egyiket sem írja felül.

| # | Döntés | Hol teljesül a tervben |
| --- | --- | --- |
| 1 | A cél opcionális; cél nélküli, sandboxszerű történet is indítható. Csak az előre megadott cél marad el: a történetben kialakulhatnak vágyak és szándékok | [02 §3](049_story_directions_02_contracts_data_hu.md#3-a-cél-opcionálissá-tétele), [03 §5.3](049_story_directions_03_engine_hu.md#53-cél-nélküli-történet) |
| 2 | A sandbox nem véletlenszerű; a korábbi döntések és kapcsolatok hatnak | [03 §6](049_story_directions_03_engine_hu.md#6-hosszú-távú-következetesség) |
| 3 | Első változatban egy fő hangsúly | `emphases` tömb, `min(1).max(1)`: [02 §2.2](049_story_directions_02_contracts_data_hu.md#22-a-tárolt-story-blokk) |
| 4 | Később több összeférő hangsúly | tömbös tárolás és `compatibleWith` a katalógusban: [02 §9](049_story_directions_02_contracts_data_hu.md#9-bővíthetőség) |
| 5 | Az irány indítás után nem módosítható; öröklés az elágazásokban | [03 §7](049_story_directions_03_engine_hu.md#7-az-irány-rögzítése-és-öröklése) |
| 6 | Történettípusonként több kezdőhelyzet, illeszkedő kérdésekkel | [01 §3–§4](049_story_directions_01_product_ux_hu.md#3-kezdőhelyzetek) |
| 7 | Bővíthetőség az indítás újraépítése nélkül | verziózott motorkatalógus és külön javítható megjelenítési szövegek: [02 §2.1](049_story_directions_02_contracts_data_hu.md#21-a-katalógus), [02 §9](049_story_directions_02_contracts_data_hu.md#9-bővíthetőség) |
| 8 | Érzékeny kapcsolati kérdések, három elkülönített állapot | [01 §5](049_story_directions_01_product_ux_hu.md#5-érzékeny-kérdések-megszólítás-és-vonzódás), [02 §2.3](049_story_directions_02_contracts_data_hu.md#23-a-háromállapotú-preferencia), [02 §8](049_story_directions_02_contracts_data_hu.md#8-adatkezelés) |
| 9 | Nincs kontrollgenerálás a jelenlegi motorral; most nincs fizetős futás | [05 §6](049_story_directions_05_tests_acceptance_hu.md#6-későbbi-tartalmi-próbák-terve) |
| 10 | Nincs kötelező három archetípus, kötelező cselekményrotáció, kötelező visszafordíthatatlan veszteség | [03 §5.5](049_story_directions_03_engine_hu.md#55-döntési-szabály); a nem követett `048_fiction_v9_decision_stakes_and_archetypes.md` tervre ez a csomag nem épít |
| 11 | Valóban különböző opciók, mesterséges számnövelés nélkül | [03 §5.5](049_story_directions_03_engine_hu.md#55-döntési-szabály), [05 §6](049_story_directions_05_tests_acceptance_hu.md#6-későbbi-tartalmi-próbák-terve) |

## 4. Forrásállapot és eltérések az előzménydokumentumokhoz képest

Vizsgált forrás: `main`, `27adddc` (2026-11-12). Az előzménydokumentumok a `0b82cd5` commitra hivatkoznak.

### 4.1. Bizonyított tények

| # | Tény | Forrás |
| --- | --- | --- |
| T1 | A `0b82cd5..27adddc` különbség tíz fájlt érint (regisztrációs felület, levél, hibaüzenetek, üzemeltetési scriptek). A motor, a szerződések, a mentés, a worker és a történetindító felület nem változott, ezért a korábbi motorvizsgálat megállapításai ma is érvényesek. | `git diff 0b82cd5 HEAD --stat` |
| T2 | Az indító űrlap 12 rögzített lépés; a cél leírása legalább 3 karakter, az időtáv kötelező. | `apps/web/components/life-experience.tsx:524-537`, `packages/contracts/src/life-v2.ts:214-235` |
| T3 | A bemenet és az állapot is legalább egy célt követel; pontosan egy elsődleges cél kell. | `packages/contracts/src/life-v2.ts:87`, `packages/contracts/src/life-v2.ts:264`, `packages/core/src/life-v2.ts:131-142` |
| T4 | A történet címe az elsődleges cél leírása. | `packages/database/src/lives.ts:486-496` |
| T5 | Az `aw_lives` sor módosíthatatlan: `BEFORE UPDATE` trigger kivételt dob. | `database/migrations/003_period_lives.sql:73`, `001_foundation.sql:125-126` |
| T6 | Az élet bemenete életszintű: minden ág a `aw_lives.input` mezőt olvassa, a job payload ebből épül. | `lives.ts:300-305`, `lives.ts:593-594` |
| T7 | A tervező kérése a teljes `input` objektumot átadja; az író, a review, a hűségellenőrző és a szerkesztő kérése erre épül. | `packages/core/src/fiction.ts:237-282`, `:367-497` |
| T8 | A fikciós promptok verziónként befagyasztottak; a v8 és v9 kérések bájtjait tesztek rögzítik. | `packages/ai/src/fiction-prompts.ts`, `tests/fiction-v8-golden.test.ts`, `tests/fiction-v9-request-bytes.test.ts` |
| T9 | A szolgáltatási profil három helyen a v9 policy pontos hashét követeli. | `lives.ts:200-208`, `lives.ts:1009-1018`, `packages/database/src/life-jobs.ts:59-70`, `narrative-memory.ts:69-74` |
| T10 | A „political/religious profiling” tiltás négy forráshelyen szerepel, mindenhol profilozásként. Más politikai szabály a forrásban nincs. | `fiction-prompts.ts:12`, `narrative-prompts.ts:24`, `packages/ai/src/index.ts:255`, `packages/ai/src/index.ts:647` |
| T11 | A nyilvános előnézet angol nyelvű élethez kötött, és elsődleges célt vár; cél nélkül kivételt dobna. | `packages/core/src/public-preview-editor.ts:14-26`, `packages/core/src/public-draft.ts:168-222` |
| T12 | A scenario-sablon és az elágazási ellenőrzőpont legalább egy célt és aktív elsődleges célt követel. | `packages/contracts/src/public-scenarios.ts:37-54`, `packages/core/src/public-scenarios.ts:39-45`, `packages/contracts/src/public-fork.ts:67` |
| T13 | A termék indulási nyelve az angol; a magyar tartalomnyelv tárolt, de nem engedélyezett. | `packages/contracts/src/locales.ts:6-8`, `docs/STATUS_HU.md` („Magyar termékkiadás: halasztott”) |
| T14 | A piszkozat az élet létrehozása után megmarad. | `lives.ts:383-392` (nincs törlés) |
| T15 | A fiókexport az `aw_drafts` és `aw_lives` sorokat teljes egészében tartalmazza; a törlés kaszkádol. | `packages/database/src/repository.ts:590-629`, `003_period_lives.sql` |
| T16 | A legördülő mező a kétoszlopos rácsban 205 px széles; a „Prefer not to say / unknown” 191 px, a szövegnek kb. 155 px jut. | helyi mérés a valódi `globals.css`-szel, lásd [01 §8](049_story_directions_01_product_ux_hu.md#8-vizuális-javítások) |

### 4.2. Új megállapítások, amelyek az előzménydokumentumokban nem szerepelnek

1. **A kérdőív minden megadott szereplőt barátként rögzít.** A `life-experience.tsx:754-757` minden címkéhez `relationship: 'friend'` értéket ír. A motor ismeri a `partner`, `family`, `friend`, `colleague`, `other` típust (`packages/contracts/src/life-v2.ts:52`), és a magánélet-nyilvántartás is ezekre épül (`fiction-series.ts` `privateLife`), de a szokásos indításból partner vagy családtag ma nem jut el a motorhoz. Az előző vizsgálat „szereplőket és kapcsolatokat kezel” megállapítása a motorra igaz, a kérdőíves indításra csak részben.
2. **Az irány módosíthatatlansága és az ágankénti öröklés a meglévő tárolásból következik** (T5, T6), ha az irány a `aw_lives.input` része. Külön zárolási logika nem kell.
3. **A meglévő motorra új promptot írni nem lehet**: a v9 befagyasztott (T8), a szolgáltatási profil a v9 hashhez kötött (T9). Új, additív generáció (v10) szükséges.
4. **A publikálási útvonalak zárt, hash-kötött nyilvános szerződésekre épülnek** (T11, T12). A cél nélküli történet közzététele ezek bővítése nélkül nem lehetséges.

### 4.3. Forrásból levont következtetések

- K1: Az irány tárolásához és a cél elhagyásához nem kell adatbázis-migráció (T5, T6; a `title text NOT NULL` oszlop más forrásból is kitölthető). Részletes indoklás: [02 §6](049_story_directions_02_contracts_data_hu.md#6-adatbázis-migráció).
- K2: A v10 kimeneti sémái azonosak lehetnek a v9-éivel, ezért a tárolt artefaktumok szerkezete nem változik ([03 §4](049_story_directions_03_engine_hu.md#4-a-v10-generáció)).
- K3: A régi életek kérései bájtra változatlanok maradnak, ha az új mezők hiányzó kulcsként (nem `null` értékként) jelennek meg ([02 §4](049_story_directions_02_contracts_data_hu.md#4-kompatibilitás)).

### 4.4. Igazolatlan feltételezések

- F1: A v10 promptok mellett a motor tartósan követi a választott hangsúlyt. Csak új történetekkel mérhető.
- F2: A modell betartja a „nincs megadva” állapot szabályát (nem állít tényt a meg nem adott részletről). Mérendő.
- F3: A politikai irányban a modell megbízhatóan elkerüli a valós szereplőket. Mérendő; ezért külön kapcsoló mögött van.
- F4: A v10 nem növeli érdemben a javítási arányt és a fejezetköltséget. A kérés mérete a projekció korlátjával (6144 bájt) nő; a hatás mérendő.
- F5: A mérés (T16) a `DM Sans` betűtípus helyi betöltődését nem igazolta; az arányok tartalék betűtípussal is fennállnak, de a pontos képpontértékek eltérhetnek.

## 5. Architektúra-döntések

| # | Döntés | Indok | Elvetett alternatíva |
| --- | --- | --- | --- |
| A1 | Az irány a `LifeInputV2` opcionális, külön verziózott `story` blokkja | Módosíthatatlan és életszintű tárolás migráció nélkül (T5, T6); minden kérésbe eljut (T7) | Új oszlop vagy tábla: migrációt, sémaőröket és visszaállítási profilt érintene, előny nélkül |
| A2 | A `schemaVersion` marad `2.0.0`; a `story` blokk saját `contractVersion` mezőt kap | A `2.0.0` literált a modell által írt jelölt és az állapot is használja; az emelés a promptokat és a tárolt kánont is érintené | Élet-szerződés `2.1.0` |
| A3 | Hiányzó `story` kulcs = irány nélküli (régi vagy megbízható sablonból indított) élet; soha nem töltjük ki utólag | Régi adat nem írható át; a kérések bájtra változatlanok | `story: null` minden életen: megváltoztatná a régi kérések bájtjait |
| A4 | A cél elhagyása valódi üres céllista (`goals: []`), nem ál-cél. A történetben kialakuló szándék szálként és történeti tényként él, nem célállapotként | A rögzített döntés tiltja az indokolatlan ál-célt; az üres lista a motorban ellenőrizhető; a vágyak kialakulása nem korlátozott | Rejtett „fedezd fel az életet” cél: a sorozatnapló célaktivitása és a promptok célhaladást kérnének számon |
| A5 | Új generáció: v10, minőségi policy `2.9.0`; a v9 bájtra érintetlen | T8, T9; a repó verziózási mintája | A v9 szövegének módosítása: megszegné a befagyasztást és a futó életek folytonosságát |
| A6 | A generációt az élet dönti el: `story` blokk ⇒ v10, különben v9 | Egy élet teljes története egy generációban marad; nincs kevert előzmény | Globális átállás v10-re: a régi életek promptja megváltozna |
| A7 | A motor a hangsúlyt szerver által összeállított `storyDirection` projekcióból kapja; a felhasználói szöveg az `input.story` része marad | A szerveres keretezés és a nem megbízható felhasználói szöveg elkülönül | Az irány leírásának beírása az `environment.description` szabad szövegébe |
| A8 | A katalógus két rétegű: a motor- és szerkezeti katalógus verziózott, kiadás után bájtra változatlan, és csak új verzióval bővül; a megjelenítési szövegek külön, verzió nélküli, javítható réteget alkotnak. Az élet tárolja a katalógusverziót | A korábban indított élet hangsúlya később sem változik, miközben a felületi szöveg javítható marad | A leírás bemásolása minden életbe: megnöveli a tárolt bemenetet, és a motorutasítás a felhasználói adatok közé kerül |
| A9 | Cél nélküli és politikai irányú élet az első kiadásban nem tehető közzé; típusos hiba és felületi magyarázat jelzi | T11, T12; a nyilvános szerződések bővítése külön, felülvizsgált változtatás | Rejtett cél generálása a közzétételhez (ál-cél) |
| A10 | A bevezetés kapcsolókhoz kötött: `STORY_DIRECTIONS_ENABLED`, `STORY_DIRECTIONS_COHORT_USER_IDS`, `STORY_DIRECTION_POLITICS_ENABLED` | Kikapcsolt állapotban a rendszer viselkedése azonos a maival | Kapcsoló nélküli kiadás |
| A11 | A visszaállítás adatot nem töröl: az első bekapcsolás után a kiadás előtti image nem visszaállítási cél (kompatibilitási padló); a kikapcsolt állapot minden új adatot megőriz; végső esetre megőrző elkülönítés szolgál | Felhasználói piszkozat és történet nem veszhet el üzemeltetési lépés miatt | Piszkozatok törlése a régi image-re való visszaálláskor |
| A12 | Az irány saját, ellenőrzött korlátai (`hardLimits`) a katalógusban élnek, és csak az adott irányú életre érvényesek; a promptok irányfüggetlenek | A politikai mód szabályai nem terjednek ki más történetekre | Politikai tiltás a közös hűségellenőrző szövegében |
| A13 | Indítás után a piszkozat tartalma feltételesen ürül ki (egyező revízió és tartalom), a sor és a revíziószámláló megmarad | Más lapon közben mentett újabb piszkozat nem sérülhet; elavult lap nem írhat felül | Felhasználó szerinti törlés |

## 6. A politikai irány összefoglaló megítélése

Részletes vizsgálat: [03 §2](049_story_directions_03_engine_hu.md#2-a-politikai-irány-vizsgálata).

- A forrás **nem tilt** minden politikai témájú fikciót: a tiltás a politikai és vallási profilozásra vonatkozik (T10). A forrás azt sem bizonyítja, hogy a politikai fikció **támogatott**: nincs rá utasítás, teszt, mérés vagy publikálási szabály.
- A meglévő keretek között megvalósítható kezdeti változat: kizárólag kitalált intézmények, szervezetek és szereplők; erőszakmentes hatalmi játszmák; privát történet; külön kapcsoló mögött; saját tartalmi próba után engedélyezve.
- Nem része a kezdeti változatnak: valós személy, párt vagy esemény; közzététel; típusos intézmény- és befolyásállapot. Az utóbbi későbbi bővítés.
- A valós politikai utalások tiltása a politikai mód saját szabálya: csak politikai irányú életre érvényes, és csak ott ellenőrzött. Más irányú történetre a mai általános szabályok vonatkoznak ([03 §2.9](049_story_directions_03_engine_hu.md#29-a-szabályok-hatóköre)).
- A meglévő védelem nem lazul: a profilozási tiltás szövege változatlan marad; a v10 általános kiegészítése csak a profilozás jelentését pontosítja.

## 7. Nyitott tulajdonosi döntések

Csak azok a kérdések szerepelnek itt, amelyek a repóból és a megadott anyagokból nem dönthetők el. Mindegyikhez van ajánlás; a megvalósítás az ajánlott értékkel elindítható, a döntés a megjelölt munkacsomag előtt szükséges.

| # | Kérdés | Miért nyitott | Ajánlás | Mikor kell |
| --- | --- | --- | --- | --- |
| N1 | A megszólítás és vonzódás adatkezelési tájékoztatása | Tulajdonosi döntés | Kérdés melletti tájékoztatás és a Privacy Notice frissítése a meglévő elfogadási verzióval. | Jóváhagyva |
| N2 | A politikai irány bekerüljön-e az első kiadás választékába | Termékdöntés a [03 §2.5](049_story_directions_03_engine_hu.md#25-javasolt-kezdeti-változat) korlátai ismeretében | A kód a kapcsolóval együtt elkészül, a kapcsoló kikapcsolva marad a külön próba sikeréig | TI10 előtt |
| N3 | A fizetős tartalmi próbák kerete és időzítése | Számszerű költési engedély csak a tulajdonostól származhat | A szakaszt 2 USD, B szakaszt 20 USD, C (politikai) szakaszt 6 USD felső kerettel ([05 §6.4](049_story_directions_05_tests_acceptance_hu.md#64-költségkeret-javaslat)) | TI09 előtt |
| N4 | A cél nélküli történetek közzététele (P2a) az első kiadás része legyen-e | Terjedelmi döntés; a nyilvános funkciók élesben kikapcsoltak | Ne; külön csomagként, a nyilvános indulás előtt ([04 §2.4](049_story_directions_04_publication_ops_hu.md#24-későbbi-bővítés-p2a-és-p2b)) | TI08 előtt |
| N5 | A végleges felhasználói elnevezések és kérdésszövegek jóváhagyása | Tulajdonos által jóváhagyott szöveg a repó gyakorlata | A [01](049_story_directions_01_product_ux_hu.md) javaslatai | TI05 előtt |

Megerősítésre ajánlott, a tervben már eldöntött viselkedésváltozások (nem akadályozzák a munkát):

- V1: Az új piszkozat alapértéke „kitalált szereplő” (`identity.mode = 'alternate'`); a „saját életemhez hasonló” választható. Indok: valódi személyes adat ne legyen alapértelmezés.
- V2: Sikeres indítás után a szerver kiüríti annak a piszkozatnak a tartalmát, amelyből az élet készült, ha a revíziója és a tartalma egyezik ([02 §7.1](049_story_directions_02_contracts_data_hu.md#71-a-piszkozat-kiürítése-indítás-után)). Más lapon közben mentett újabb piszkozat érintetlen marad. Indok: az érzékeny válaszok ne maradjanak meg egy második helyen.

## 8. Elvégzett forrásellenőrzések

- Elolvasott előzmények: `Alterward/docs/elvegzendo-feladatok.md`, `tortenetiranyok-fejlesztesi-terv-20261112.md`, `tortenettipusok-motorvizsgalat-20261112.md`; a repóból `AGENTS.md`, `docs/DOCS_INDEX_HU.md`, `docs/STATUS_HU.md`, `docs/DEVELOPMENT_PLAN_HU.md` (szerkezet), `docs/DOCUMENTATION_GOVERNANCE_HU.md`, `docs/operations/NARRATIVE_EVALUATION_HU.md` (eleje).
- Teljes egészében olvasott forrásfájlok: `packages/contracts/src/life-v2.ts`, `fiction.ts`, `narrative.ts`; `packages/core/src/life-v2.ts`, `fiction.ts`, `narrative-requests.ts`, `public-draft.ts`; `packages/ai/src/fiction-prompts.ts`, `index.ts`; `packages/database/src/lives.ts`, `life-jobs.ts`, `life-job-state.ts`, `fiction-memory.ts`; `apps/worker/src/fiction-processor.ts`; `apps/web/components/life-experience.tsx`; `apps/web/lib/life-messages.ts`; `database/migrations/003_period_lives.sql`; `scripts/verify-docs.ts`.
- Célzottan olvasott részek: `apps/api/src/app.ts` (élet-, piszkozat- és előnézet-útvonalak), `apps/worker/src/main.ts` és `life-processor.ts`, `packages/database/src/narrative-memory.ts`, `repository.ts` (export), `life-deletion.ts`, `packages/core/src/public-preview-editor.ts`, `public-scenarios.ts`, `public-fork.ts`, `scenario-personalization.ts`, `fiction-series.ts`, a nyilvános szerződések (`public-draft.ts`, `public-review.ts`, `public-safety.ts`, `public-fork.ts`, `public-scenarios.ts`, `discovery.ts`), `apps/web/app/globals.css`, az adatvédelmi tájékoztató és az ÁSZF tárolt angol szövege (`apps/web/lib/i18n/messages.ts`), a CI munkafolyamat sémaellenőrzése.
- Keresések a teljes `packages`, `apps`, `database`, `scripts`, `tests` fában: politikai és vallási kulcsszavak; a cél minden felhasználási helye; a v9 policy és a generációválasztás helyei; az `aw_lives` és a cím felhasználása.
- Mérés: a legördülő mezők szélessége a valódi stíluslappal, helyi fej nélküli böngészővel, hálózati AI-hívás nélkül.
- Nem történt: tesztfuttatás, build, adatbázis-hozzáférés, éles rendszer lekérdezése, AI-hívás. A felsorolt megállapítások forrásolvasáson alapulnak, futtatással nincsenek igazolva.
