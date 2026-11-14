---
status: active-supporting
owner: personal-simulation
created: 2026-11-12
base_commit: 27adddc46d2d7da6f04a022bd2b1774530089684
related:
  - 049_story_directions_00_overview_hu.md
  - 049_story_directions_02_contracts_data_hu.md
  - 049_story_directions_03_engine_hu.md
---

# 049/04 — Publikálás, meglévő funkciók és üzemeltetés

Ez a dokumentum nem ad kiadási vagy költési engedélyt. Minden éles lépés a meglévő tulajdonosi kapukhoz kötött (`docs/operations/NATIVE040_IMAGE_RELEASE_HU.md`, `docs/operations/DEPLOYMENT_HU.md`).

## 1. Hatókör

A változtatás a privát személyes történetet érinti. A Shared, a Community és a nyilvános funkciók az utolsó megőrzött éles állapot szerint kikapcsoltak (`docs/STATUS_HU.md`), a kódjuk azonban él, ezért a cél nélküli és az irányt választó életek viselkedését ezeken az útvonalakon is meg kell határozni.

## 2. Publikálás

### 2.1. Mai állapot

| Útvonal | Mit vár az élettől | Forrás |
| --- | --- | --- |
| Privát másolatszerkesztő (`GET /branches/:id/public-preview`) | angol élet, 1–12 időszak, elsődleges cél (kategória és leírás) | `packages/core/src/public-preview-editor.ts:9-76` |
| Előnézet készítése és előellenőrzés (`POST …/public-preview`, `…/check`) | ugyanaz; a pillanatkép `goal` és `startingPoint.goalCategory` mezője kötelező | `packages/core/src/public-draft.ts:105-225`, `packages/contracts/src/public-draft.ts:108-150` |
| Tartalomcsomag, AI-előszűrés, kurátori lépés, közzététel | meglévő előnézetre épül | `packages/database/src/public-content.ts`, `publications.ts` |
| Elágazási ellenőrzőpont | meglévő előnézetre épül; a sablonséma legalább egy célt kér | `packages/core/src/public-fork.ts:374-386`, `packages/contracts/src/public-fork.ts:58-80` |
| Scenario-sablon | saját törzsből készül; legalább egy cél és aktív elsődleges cél | `packages/core/src/public-scenarios.ts:24-45` |
| Személyes scenario-indítás, nyilvános elágazás indítása | sablonból vagy ellenőrzőpontból új életet épít (`createPrepared`, `createPreparedFork`) | `packages/database/src/personal-scenario-starts.ts`, `public-fork-starts.ts` |
| Felfedezés | a pillanatkép `category` mezőjéből dolgozik | `packages/contracts/src/discovery.ts` |

Minden életből induló nyilvános útvonal az előnézeten halad át. Egyetlen belépési kapu ezért elegendő.

### 2.2. Első kiadás: típusos tiltás

Két életfajta nem léphet be az előnézeti útvonalra:

| Életfajta | Ok |
| --- | --- |
| cél nélküli (`input.goals.length === 0`) | a nyilvános szerződések kötelező célmezői |
| politikai irányú (`story.emphases` tartalmaz `politics` irányt) | nincs politikai tartalomra vonatkozó előszűrési és kurátori szabály ([03 §2.2](049_story_directions_03_engine_hu.md#22-a-további-útvonalak)) |

```ts
// packages/core/src/story-direction.ts — JAVASLAT
export function storyPublication(input: LifeInputV2):
  | { available: true }
  | { available: false; reason: 'no_goal' | 'politics' };
export function assertPublishableStory(input: LifeInputV2): void {
  const result = storyPublication(input);
  if (!result.available)
    throw new DomainError('PUBLIC_PREVIEW_STORY_UNSUPPORTED',
      'This story cannot be prepared for publication yet.', 409);
}
```

Hívási helyek (mindegyik függvény első utasításaként):

- `preparePublicEditorSource` (`packages/core/src/public-preview-editor.ts:9`),
- `inspectPublicPreviewCopy` (`packages/core/src/public-draft.ts:70`),
- `preparePublicSnapshotDraft` (`packages/core/src/public-draft.ts:105`),
- védelmi hívás: az ellenőrzőpont-vetítés belépésénél (`packages/core/src/public-fork.ts`, az élet bemenetét fogadó függvény) és a hivatalos élet forrásának olvasásánál (`packages/database/src/official-life.ts:163`).

Felület (`apps/web/components/life-experience.tsx:1017-1023`): ha a `storyPublication(detail.branch.input)` nem elérhető, a „Prepare a story copy” hivatkozás helyén rövid szöveg áll (EN / HU): “Story copies are not available for this kind of story yet.” / „Ehhez a történettípushoz még nem készíthető másolat.” A `/preview/[id]` oldal közvetlen megnyitásakor a szerver hibája jelenik meg a szokásos hibaértesítésben.

A kompromisszum: a cél nélküli és a politikai irányú történet az első kiadásban nem osztható meg. Indok: a nyilvános szerződések zártak, hash-kötöttek és külön felülvizsgálati rendhez tartoznak; ál-cél generálása a közzététel kedvéért ellentétes a rögzített döntéssel; a nyilvános funkciók élesben kikapcsoltak, így a korlátnak ma nincs felhasználói hatása.

### 2.3. Ami változatlan

- Célt tartalmazó, nem politikai irányú, irányt választó élet az előnézeti és közzétételi útvonalon a mai módon halad. A nyilvános kategória továbbra is a cél kategóriájából származik (`packages/core/src/public-preview-editor.ts:27-32`).
- A `story` blokk egyetlen nyilvános szerződésnek sem része. A pillanatkép, a tartalomcsomag, a sablon és az ellenőrzőpont engedélylistás séma.
- A determinisztikus előellenőrzés privát címkéi kiegészülnek az irány rövid szövegeivel, hogy azok ne kerülhessenek észrevétlenül a nyilvános másolatba. A `privateCopyLabels` (`packages/core/src/public-draft.ts:44-69`) új elemei: `story.title`, `story.emphases[0]` alatt a `field`, `fieldLabel`, `venture` (ha `specified`), `workKind`, `destination`, `role`, `inventedNames[]`.
- Scenario-ból, nyilvános elágazásból és hivatalos életből induló új élet irány nélküli, v9 policyval; ezek az útvonalak nem változnak.
- A meglévő nyilvános pillanatképek, sablonok és ellenőrzőpontok érintetlenek.

### 2.4. Későbbi bővítés: P2a és P2b

Nem része az első kiadásnak ([00, N4](049_story_directions_00_overview_hu.md#7-nyitott-tulajdonosi-döntések)); a terv a határokat rögzíti.

**P2a — cél nélküli történet nyilvános másolata.** Új pillanatkép-verzió (`PUBLIC_DRAFT_VERSION = '1.1.0'`), amelyben:

- `goal`: `nullable`; `startingPoint.goalCategory`: `nullable`;
- `publicPreviewCopySchema.goalDescription`: `nullable`; `publicEditorSourceSchema.goalCategory`: `nullable`;
- a nyilvános kategória cél híján az irányból származik: relationships → `relationships`, career → `career` (founder és transition: `business`), creative → `lifestyle`, travel → `adventure`;
- az olvasó felületek (`public-content-preview.tsx`, `publication-reader.tsx`) a célblokkot csak meglévő cél esetén jelenítik meg;
- az AI-előszűrés mezőlistája (`packages/core/src/public-review.ts:25`) a célmezőt csak akkor veszi fel, ha létezik.

A régi `1.0.0` pillanatképek olvashatók maradnak; a tárolt hash-kötések nem változnak.

**P2b — irány átvitele nyilvános elágazásba és scenario-ba.** Új ellenőrzőpont- és sablonverzió, amely az irányból kizárólag az `direction`, `subtype` és `startingSituation.id` értéket viszi át; a háromállapotú válaszok, a szabad szövegek és a `cast` soha. Az így induló élet `story` blokkjában minden háromállapotú mező `unspecified`. A cél nélküli sablon (`goals.min(0)`) ugyanennek a csomagnak a része.

A politikai irány közzététele külön döntés és külön előszűrési policy ([03 §2.6](049_story_directions_03_engine_hu.md#26-későbbi-bővítés)).

## 3. Jogosultság, ingyenes fejezet, előfizetés, elszámolás

Ezek a szabályok nem változnak; a v10 ugyanazon az útvonalon halad.

| Szabály | Hol érvényesül | Hatás a v10-re |
| --- | --- | --- |
| Hozzáférés és admission | `assertServiceGeneration` a sorba állításnál és minden szolgáltatói kérés előtt (`lives.ts:541`, `life-jobs.ts:168,233`) | változatlan |
| Fejezetfoglalás, fogyasztás, visszaadás | `reserveGenerationChapter` (`lives.ts:713`), `consumeGenerationChapter` (`life-jobs.ts:500`), `releaseGenerationChapter` (`life-jobs.ts:144,518`) | egy job = egy fejezet, generációtól függetlenül |
| Első ingyenes fejezet, havi keret, ajándék fejezet | a számlázási mag (`packages/core/src/billing*.ts`, `packages/database/src/billing.ts`) | nem érintett |
| Generálási útvonal kapuja | `@ClosedBetaGeneration()`, `@ChapterBilledGeneration()` a `POST /api/v2/lives` útvonalon (`app.ts:767-769`) | változatlan; új generálási útvonal nem készül |
| Napi és párhuzamos korlát | `lives.ts:554-564` | változatlan |
| Szolgáltatói kérések plafonja | `maxPhysicalRequests: 9`, `maxContentRepairs: 1` a policyban | a v10 örökli |
| USD-keret és kérésméret-őr | `DatabaseAiBudget`, `AI_FICTION_MAX_REQUEST_BYTES` (`packages/database/src/ai-budget.ts:132`) | változatlan; a v10 kérése a projekcióval legfeljebb 6144 bájttal nagyobb |
| Szolgáltatási profil policy-ellenőrzése | `assertServiceJobPolicy` (`life-jobs.ts:59-70`), `retry` (`lives.ts:1009-1018`) | a v10 hash csak `story` blokkos payloaddal elfogadott ([03 §4.3](049_story_directions_03_engine_hu.md#43-érintett-kódhelyek)) |

Kockázat: a javítási kérés a v8 és v9 mérések szerint már ma is meghaladja az alapértelmezett 100 000 bájtos korlátot (`tests/fiction-v9-request-bytes.test.ts`, a korlát emelése nyitott tulajdonosi döntés az N09 keretében). A v10 ezt legfeljebb 6144 bájttal növeli. A v10 kérésméretét a tesztkészlet méri ([05 §2.3](049_story_directions_05_tests_acceptance_hu.md#23-motor)); az éles korlát értéke a meglévő döntési folyamat része, ez a terv nem módosítja.

Ami szándékosan nem változik: nincs új ingyenes fejezet, keretvisszaállítás vagy külön díj az új irányokhoz. Az `STORY_DIRECTION_UNAVAILABLE` és `STORY_DIRECTION_INVALID` hiba a foglalás előtt keletkezik (a `create` a `queue` előtt ellenőriz), ezért fejezetet nem fogyaszt és nem foglal.

## 4. Kiadás és bevezetés

### 4.1. Sorrend

| Lépés | Tartalom | Éles hatás |
| --- | --- | --- |
| R1 | A teljes kód a főágra kerül, minden kapcsoló kikapcsolva (TI01–TI08) | nincs: a felület a régi űrlapot mutatja, a kérések bájtra azonosak |
| R2 | Image-kiadás a meglévő runbook szerint, kikapcsolt kapcsolókkal; utána megfigyelési időszak ([§6.2](#62-kompatibilitási-padló)) | viselkedésváltozás nélkül; füstpróba régi élettel |
| R3 | A tartalmi próba (TI09, külön költési engedéllyel) | fejlesztési környezet, nem éles |
| R4 | A promptok véglegesítése a próba alapján; ha a szöveg változik, új image | nincs |
| R5 | Tulajdonosi kohorsz: `STORY_DIRECTIONS_COHORT_USER_IDS` a tulajdonos fiókjával | csak a kohorsz látja az új indítót |
| R6 | Tulajdonosi végigpróba élesben ([05 §4.3](049_story_directions_05_tests_acceptance_hu.md#43-kézi-végigpróba)) | a tulajdonos saját kerete terhére |
| R7 | Általános bekapcsolás: `STORY_DIRECTIONS_ENABLED=true` | minden felhasználó az új indítót kapja |
| R8 | (külön döntés) `STORY_DIRECTION_POLITICS_ENABLED=true` a C próbaszakasz után | megjelenik az ötödik irány |
| R9 | A régi űrlap eltávolítása külön PR-ban, legalább egy stabil kiadási ciklus után | kódtakarítás |

Az R1–R2 lépés a többi nélkül is biztonságos: a kapcsolók nélkül a rendszer a mai működést adja. A katalógus `1.0.0` verziója és a v10 promptok az R5 lépéskor válnak kiadottá; addig jelöltek ([02 §2.1](049_story_directions_02_contracts_data_hu.md#21-a-katalógus)).

### 4.2. Kapcsolók

| Környezeti változó | Érték | Alapérték | Hatás |
| --- | --- | --- | --- |
| `STORY_DIRECTIONS_ENABLED` | `true` \| `false` | `false` | az új indító és a `story` blokkos indítás minden felhasználónak |
| `STORY_DIRECTIONS_COHORT_USER_IDS` | vesszővel elválasztott UUID-lista, legfeljebb 100 | üres | a felsorolt fiókoknak akkor is engedélyezett, ha az általános kapcsoló ki van kapcsolva |
| `STORY_DIRECTION_POLITICS_ENABLED` | `true` \| `false` | `false` | a politikai irány választhatósága (csak engedélyezett felhasználónak) |

Szabályok:

- A kapcsolókat a `narrativeConfigFromEnv` olvassa (`packages/database/src/narrative-memory.ts:29-80`), a meglévő kohorszlista ellenőrzési mintájával. Érvénytelen érték indításkor `NARRATIVE_CONFIG_INVALID`.
- Bekapcsolás csak `NARRATIVE_PIPELINE_MODE=narrative-fiction-v2` és `NARRATIVE_FICTION_GENERATION=v9` mellett érvényes; más összeállításban indításkor hiba.
- A kapcsoló kizárólag az **új indítást** szabályozza. Már elindított, `story` blokkos élet folytatása, elágaztatása és újrapróbálása kikapcsolt kapcsolónál is működik.
- A web a kapcsolót a `GET /api/v2/story-directions` válaszából ismeri ([02 §5](049_story_directions_02_contracts_data_hu.md#5-api)); build-idejű változó nem készül.
- Üzemeltetési bekötés: a három kulcs felkerül a `deploy/compose.yaml` `x-narrative` blokkjába (`:65-69`), a `deploy/server.env.example` és `.env.example` fájlba, valamint a `scripts/ops/contabo-service-env.py` `ALLOWED` halmazába (`:211`) saját érvényesítővel. A `tests/ops/service-env-operator.test.mjs` kiegészül.

### 4.3. A régi és az új verzió együttélése

| Helyzet | Viselkedés |
| --- | --- |
| Kikapcsolt kapcsoló | régi űrlap; `story` blokkos indítás 409; minden meglévő élet változatlan |
| Kohorsz | a kohorsz tagja az új indítót látja, mások a régit |
| Bekapcsolt kapcsoló | mindenki az új indítót látja; a régi életek v9-cel, az újak v10-zel futnak egymás mellett |
| Kiadás közben nyitva maradt régi kliens | a `story` nélküli kérés érvényes; irány nélküli élet jön létre (v9) |
| Kiadás közben futó job | a befagyasztott payloaddal fejeződik be |
| Kikapcsolás bekapcsolás után | új `story` blokkos élet nem indítható; a meglévők folytathatók; a piszkozat irányválaszai megmaradnak ([§6.3](#63-a-kikapcsolt-állapot-új-adatokkal)) |

### 4.4. Kiadási mechanika

- A kiadás image-only váltás; adatbázis-lépés nincs ([02 §6](049_story_directions_02_contracts_data_hu.md#6-adatbázis-migráció)).
- A meglévő védelem szerint az image-váltó a futó forrás közvetlen utódjaként, a megváltozott termékfájlok teljes listájának és SHA-256 lenyomatának egyezésekor fogadja el a kiadást (`REVIEWED_IMAGE_CHANGES`); a már pinelt fájlok lenyomata (`REGISTRY_040_CHANGE_HASHES`) frissítendő (`docs/operations/NATIVE040_IMAGE_RELEASE_HU.md`, „A regisztráció-visszajelzés pinjei” és „A párhuzamos fejezetgenerálás kiadása” szakasz mintájára). Ez a csomag több pinelt fájlt érint (legalább: `apps/web/lib/i18n/messages.ts`, `packages/contracts/src/error-messages.ts`, `packages/database/src/index.ts`); a végleges bejegyzés az utolsóként mergelt PR-ban készül.
- A váltás a runbook szerinti rövid zárással történik; előtte friss mentés, offsite másolat és izolált visszaállítási próba a meglévő rend szerint.
- A kiadás után a `docs/STATUS_HU.md` frissítendő a ténylegesen ellenőrzött állapottal.

### 4.5. Elfogadási kapuk a bekapcsolás előtt

| Kapu | Feltétel |
| --- | --- |
| K1 (R2 előtt) | a teljes tesztkészlet zöld; a v8 és v9 bájtrögzítő tesztek módosítás nélkül zöldek; független review |
| K2 (R5 előtt) | a megfigyelési időszak letelt hiba nélkül; az A és B próbaszakasz elfogadási feltételei teljesültek ([05 §6.3](049_story_directions_05_tests_acceptance_hu.md#63-mérési-szempontok-és-küszöbök)); a promptok befagyasztva; N1 és N5 eldöntve |
| K3 (R7 előtt) | tulajdonosi végigpróba sikeres; a tájékoztató frissítve |
| K4 (R8 előtt) | N2 eldöntve; a C próbaszakasz sikeres |

## 5. Monitorozás

Új telemetria, eseménymező vagy naplósor nem készül. A megfigyelés a meglévő adatokból, csak olvasó, összesített lekérdezésekkel történik, a meglévő üzemeltetői csatornán.

| Mit figyelünk | Forrás | Jelzés |
| --- | --- | --- |
| Indítások irány és altípus szerint | `aw_lives.input->'story'->'emphases'->0->>'direction'`, `…->>'subtype'` darabszám | tájékoztató |
| Cél nélküli indítások aránya | `jsonb_array_length(input->'goals') = 0` darabszám | tájékoztató |
| v10 fejezetek sikeraránya | `aw_jobs.status`, `error_code`, a payload policy minőségi verziója szerint csoportosítva | a `NARRATIVE_QUALITY_FAILED` arány a v9 alapvonalának másfélszerese fölött: vizsgálat |
| Javítási arány | befejezett jobok `checkpoints->>'repairUsed'` | a v9 alapvonalának másfélszerese fölött: vizsgálat |
| Kérésszám fejezetenként | `checkpoints->>'providerRequestCount'` | átlag 7 fölött: vizsgálat |
| Kérésméret-elutasítás | a budget őr elutasításai (`aw_budget_reservations`, a meglévő monitor) | bármely új előfordulás: vizsgálat |
| Fejezetköltség | a meglévő elszámolás (`aw_ai_runs`, budget táblák) | a v9 átlagának 1,25-szöröse fölött: vizsgálat |
| Indítási hibák | `STORY_DIRECTION_INVALID`, `STORY_DIRECTION_UNAVAILABLE` gyakorisága az API válaszaiban | tartós `INVALID`: kliens–katalógus eltérés |
| Előnézeti tiltás | `PUBLIC_PREVIEW_STORY_UNSUPPORTED` gyakorisága | tájékoztató; a P2a igényét jelzi |

Szabályok az összesítésre: csak darabszám és arány; a háromállapotú mezők, a szabad szövegek és az egyedi életek tartalma nem kérdezhető le rutinszerűen; öt alatti csoport nem jelenik meg jelentésben. A v9 alapvonal a már meglévő éles jobokból számítható (nem új generálás).

Felhasználói visszajelzés: a fejezetenkénti visszajelzési űrlap (`FeedbackForm`) változatlan; az irány szerinti bontás a `aw_feedback` és az `aw_lives` összekapcsolásával, összesítve készül.

## 6. Visszaállítás

Alapelv: **a visszaállítás adatot nem töröl.** Piszkozatot, életet vagy fejezetet egyik szint sem semmisít meg; ahol a régi kód nem tudja kezelni az új adatot, ott az adat megőrzése vagy elkülönítése az előírt megoldás.

### 6.1. Szintek

| Szint | Mikor | Lépés | Hatás az adatokra |
| --- | --- | --- | --- |
| V-1 kapcsoló | minőségi, költség- vagy felületi gond az új indításokkal | `STORY_DIRECTIONS_ENABLED=false`, kohorsz ürítése (a meglévő env-eszközzel) | semmi nem változik; a piszkozatok irányválaszai megmaradnak ([§6.3](#63-a-kikapcsolt-állapot-új-adatokkal)) |
| V-2 politikai kapcsoló | gond csak a politikai iránnyal | `STORY_DIRECTION_POLITICS_ENABLED=false` | semmi nem változik; a meglévő politikai életek folytathatók |
| V-3 korábbi image a padló fölött | hibás kiadás, amely a régi életeket is érinti | visszaállás egy olyan korábbi image-re, amely már ismeri a csomag szerződéseit | semmi nem változik; adatművelet nem kell |
| V-4 a padló alá | csak ha a V-1–V-3 és az előrefelé javítás sem alkalmazható | megőrző elkülönítés, majd a kiadás előtti image ([§6.5](#65-v-4-megőrző-elkülönítés)) | a piszkozatok irányválaszai titkosított archívumba kerülnek és visszaillesztésre várnak; az életek érintetlenek |

### 6.2. Kompatibilitási padló

**Padló:** az első élesben futó image, amely tartalmazza a csomag szerződéseit (a [§4.1](#41-sorrend) R2 lépésének image-e). Minden későbbi image a padló fölött van.

Szabályok:

1. **R2 és R5 között megfigyelési időszak.** A padló image kikapcsolt kapcsolókkal legalább három napig és legalább egy teljes napi mentési cikluson át fut, mielőtt a kohorsz bekapcsolható. Ebben az időszakban új alakú adat még nem keletkezhet, így a kiadás előtti image-re visszaállni adatművelet nélkül lehet. A megfigyelés azt igazolja, hogy az image a meglévő életeket hibátlanul kiszolgálja.
2. **Az első bekapcsolás (R5) után a kiadás előtti image nem visszaállítási cél.** A kiadási naplóban rögzíteni kell az R5 időpontját; ettől kezdve a visszaállítás a V-1–V-3 szintekre korlátozódik.
3. **Minden későbbi kiadás megőrzi az olvasási képességet.** A kiadási ellenőrzőlista új pontja: az image elfogadja a `story` blokkos piszkozatot és életet, a v10 policyjú jobot és artefaktumot. Ezt a [05 §3.9](049_story_directions_05_tests_acceptance_hu.md#39-visszaállítás-és-megőrzés) tesztjei igazolják, és a tesztek a kódban maradnak.
4. **A kikapcsolt állapot a megőrző üzemmód.** A padló image kikapcsolt kapcsolóval a kiadás előtti viselkedést adja úgy, hogy közben minden új adatot megért és megőriz. Ezért képes a kapcsoló a visszaállítás elsődleges eszköze lenni.

Miért nem külön „megőrző” image: az R2 image kikapcsolt állapota ugyanazt nyújtja, és a megfigyelési időszakban élesben bizonyít. Külön image egy további kiadási ciklust és zárást jelentene, többletvédelem nélkül.

### 6.3. A kikapcsolt állapot új adatokkal

A V-1 és a V-2 után a rendszer így viselkedik:

| Adat | Viselkedés kikapcsolt kapcsolóval |
| --- | --- |
| `story` blokkos élet | olvasható, folytatható, elágaztatható, újrapróbálható (v10) |
| futó vagy sorban álló v10 job | befejeződik |
| piszkozat `story` blokkal | a régi űrlap betölti a közös mezőket; a `story` blokkot és a szereplők megszólítását változatlanul visszaírja minden mentéskor; a felület jelzi: „A történetirány kiválasztása átmenetileg nem érhető el. A korábbi válaszaid megmaradtak.” / “Choosing a story direction is temporarily unavailable. Your earlier answers are kept.” |
| indítás a régi űrlapról | a kérés csak a régi mezőket tartalmazza (`story` és megszólítás nélkül, `draftRevision` nélkül): irány nélküli élet jön létre, a piszkozat nem ürül ki, így az irányválaszok megmaradnak a visszakapcsolásig |
| `story` blokkos indítási kérés | `STORY_DIRECTION_UNAVAILABLE` (409); a piszkozat érintetlen |

Visszakapcsoláskor a felhasználó a megőrzött válaszaival folytathatja.

### 6.4. V-3: korábbi image a padló fölött

Előfeltétel: a cél image a padló vagy annál újabb. Adatművelet nincs; a futó jobokat a meglévő kiadási rend szerint kell kifuttatni vagy megvárni. A cél image a v10 jobokat és életeket ismeri, ezért folytatásuk nem szünetel.

### 6.5. V-4: megőrző elkülönítés

Utolsó eszköz, kizárólag tulajdonosi döntésre. Akkor merül fel, ha az első bekapcsolás után mégis a kiadás előtti image-et kell futtatni.

**Mit kell megvédeni.** A kiadás előtti kód az új adat két fajtáját nem tudja kezelni ([02 §4.3](049_story_directions_02_contracts_data_hu.md#43-visszafelé-nem-kompatibilis-irány-az-új-adat-és-a-régi-kód)): a `story` blokkos piszkozatot (nem tudja menteni) és a v10 jobot (visszafordíthatatlanul sikertelennek jelölné). Az életeket nem módosítja.

**Megoldás piszkozatokra: leválasztás és archiválás, visszaillesztéssel.** A piszkozat `story` blokkja és a megszólítások titkosított archívumba kerülnek; a sorban a pontosan mai alakú közös rész marad, amelyet a régi kód kezel. A felhasználó a közös adatait a régi űrlapon tovább szerkesztheti.

Eszköz (javaslat, a TI08 része): `scripts/ops/story-draft-quarantine.ts`, négy üzemmóddal.

| Üzemmód | Mit tesz | Adatot módosít? |
| --- | --- | --- |
| `plan` | megszámolja az érintett piszkozatokat és a v10 jobokat | nem |
| `park` | leválaszt és archivál | igen: a piszkozat `payload` és `revision` mezője |
| `restore` | visszailleszt | igen: ugyanezek |
| `destroy` | megsemmisíti az archívumot | csak az archívumot |

`park`, felhasználónként egy tranzakcióban, a felhasználói sor zárolásával:

1. Kiolvassa a sort (`FOR UPDATE`). Érintett, ha a `payload` tartalmaz `story` kulcsot vagy megszólítást bármely szereplőnél.
2. Archívumrekordot ír: `{ userId, revision, story, addresses: [{ index, label, address }], payloadSha256, parkedAt }`. Az archívum a mentésekkel azonos védelmű (a mentések `age` címzettjével titkosított, a szerver védett mentési kötetén); a rekord kiírása és lemezre kényszerítése megelőzi az adatbázis-módosítás véglegesítését.
3. A sort feltételesen frissíti: `UPDATE aw_drafts SET payload=$közös, revision=revision+1 WHERE user_id=$1 AND revision=$olvasott`. Ha a feltétel nem teljesül, a művelet a felhasználóra megismétlődik; az árva archívumrekord ártalmatlan (a visszaillesztés ellenőrzi).

Ellenőrzés a `park` után: az archívumrekordok száma egyenlő a módosított sorok számával; az archívum visszafejthető, a rekordok lenyomata egyezik; nem maradt `story` kulcsot tartalmazó piszkozat.

`restore`, a visszatérés után, rekordonként:

| Állapot | Teendő |
| --- | --- |
| a felhasználó és a piszkozatsor létezik, a `payload` nem `null` és nincs benne `story` | a `story` visszaillesztése; a megszólítások visszaillesztése azoknál a szereplőknél, akiknek a címkéje változatlan; `revision=revision+1`. A közben szerkesztett közös mezők a felhasználó újabb értékei maradnak. |
| a `payload` JSON `null` vagy a sor nem létezik | a rekord nem illeszthető vissza; a futás jelentésében szerepel, adat nem íródik felül |
| a `payload` már tartalmaz `story` blokkot | nem ír felül; jelentés |
| a felhasználó törölte a fiókját | a rekord kihagyva; az archívum megsemmisítésekor megszűnik |

A `restore` megismételhető: a már visszaillesztett rekord a harmadik sorba esik.

A fejlesztői ágon a parancs `pnpm exec tsx scripts/ops/story-draft-quarantine.ts`.
A `plan` csak számlál. A `park ARCHIVE RECIPIENT` zárt alkalmazás mellett,
a v10 sor kifutása után használható. Az `ARCHIVE` privát könyvtárban lévő,
új `.age` fájl. A `restore ARCHIVE IDENTITY` a hozzá tartozó `.committed`
bizonylatot és a mentési identitás privát fájlját várja. A bizonylat az
archívum lenyomatát és a DB-végpont kötését tartalmazza. Ha a folyamat a
commit és a bizonylat létrehozása között megszakad, az archívumot meg kell
őrizni, és a mentésből, valamint a piszkozatok revízióiból meg kell
állapítani a tényleges állapotot az újabb művelet előtt. Az archívum
törlésének szabálya külön tulajdonosi döntés.

**Megoldás jobokra: kifuttatás a váltás előtt.** A váltás előfeltétele, hogy ne legyen sorban álló vagy futó v10 job:

```sql
SELECT count(*) FROM aw_jobs
WHERE status IN ('queued','running')
  AND payload->'narrativeContext'->'policy'->>'qualityPolicyVersion' = '2.9.0';
```

A lezárt oldal mellett az új worker fut tovább, amíg az érték nulla. Ami nem fejeződik be, azt az új worker zárja le a saját, újrapróbálható hibájával; a régi worker v10 jobot nem kaphat.

**Életek.** Nem módosulnak. A kiadás előtti kód alatt olvashatók; a folytatás kísérlete hibát ad fejezetfoglalás nélkül, a visszatérésig. Ez a V-4 ismert, elfogadott korlátja.

**A V-4 lépései:**

1. Tulajdonosi jóváhagyás; az oldal lezárása a meglévő rend szerint.
2. Friss mentés → offsite másolat → izolált visszaállítási próba (a meglévő lánc).
3. `plan`; a v10 jobok kifuttatása nullára.
4. `park`; ellenőrzés.
5. Váltás a kiadás előtti image-re.
6. Visszatéréskor: váltás a javított image-re, `restore`, ellenőrzés, majd `destroy`.

**Az archívum megőrzése.** Legfeljebb 14 napig; addig vagy visszaillesztés, vagy tulajdonosi döntés a további teendőről. Az archívum a mentésekkel azonos hozzáférési körben marad, a repóba és jelentésbe nem kerül. Ha a visszaállás véglegesnek bizonyul, az elkülönített válaszok sorsáról (megőrzés a tájékoztatóban vállalt határidőn belül, vagy megsemmisítés) a tulajdonos dönt; a terv automatikus megsemmisítést nem ír elő.

### 6.6. Előrefelé javítás

A promptszöveg hibája új promptverzióval (v11) javítandó, nem a v10 szövegének átírásával, ha a v10 már éles forgalmat kapott. Éles forgalom előtt (R5 előtt) a v10 szövege és a katalógus `1.0.0` verziója még szabadon módosítható.

## 7. Mentés és helyreállítás

- Új tábla, oszlop, index nincs, ezért a mentési, visszaállítási és adatvédelmi helyreállítási profilok (`scripts/lib/privacy-recovery-*.ts`, `tests/privacy-recovery-*.test.ts`, `tests/schema040-fixture-contract.test.ts`) nem változnak.
- A `story` blokk a meglévő `jsonb` oszlopok része, így a mentés és a visszaállítás automatikusan tartalmazza.
- A kiadás előtti mentés–offsite–izolált visszaállítás lánc a meglévő runbook szerint kötelező; ez a csomag nem ad hozzá új lépést.
