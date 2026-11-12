---
status: active-supporting
owner: personal-simulation
created: 2026-11-12
base_commit: 27adddc46d2d7da6f04a022bd2b1774530089684
related:
  - 049_story_directions_00_overview_hu.md
  - 049_story_directions_01_product_ux_hu.md
  - 049_story_directions_02_contracts_data_hu.md
  - 049_story_directions_03_engine_hu.md
  - 049_story_directions_04_publication_ops_hu.md
  - 049_story_directions_05_tests_acceptance_hu.md
---

# 049/06 — Munkacsomagok, sorrend és függőségek

A munka a repó szabályai szerint halad (AGENTS.md 4. pont): Issue → feature branch → megvalósítás → ellenőrzés → PR → review → CI → merge. Egy csomag egy PR. Közvetlenül a `main` ágra írni csak kifejezett tulajdonosi utasításra lehet.

## 1. Áttekintés

| ID | Csomag | Függ | Éles hatás kikapcsolt kapcsolóval |
| --- | --- | --- | --- |
| TI00 | Döntések és kanonikus dokumentáció | — | nincs |
| TI01 | Szerződések: katalógus, `story` blokk, opcionális cél | TI00 | nincs |
| TI02 | Core: ellenőrzés, cím, projekció, publikálhatóság | TI01 | nincs |
| TI03 | v10 generáció: policy és promptok | TI01, TI02 | nincs |
| TI04 | Mentés, sorba állítás, konfiguráció, API | TI02, TI03 | nincs |
| TI05 | Új indító felület | TI01, TI04 | nincs |
| TI06 | Adatkezelés: export, tájékoztató, (opcionális) hozzájárulás | TI04 | a tájékoztató szövege változik |
| TI07 | Publikálási kapu és történetoldal | TI02, TI05 | nincs |
| TI08 | Üzemeltetés: kapcsolók bekötése, kiadási pinek | TI04 | nincs |
| TI09 | Mérőeszköz és tartalmi próba | TI03, TI04 | nincs (fejlesztési környezet) |
| TI10 | Bevezetés és (külön döntéssel) politikai irány | TI05–TI09 | igen: a kapcsolók bekapcsolása |

Sorrend: TI00 → TI01 → TI02 → TI03 → TI04 → (TI05, TI06, TI07, TI08 párhuzamosan; a TI07 a TI05 után) → TI09 → TI10.

Párhuzamosíthatóság: a TI05, TI06 és TI08 egymástól független fájlokat érint. A TI03 és a TI04 közös fájlja nincs, de a TI04 tesztjei a v10 policyt használják, ezért sorban készülnek.

Minden csomag közös elfogadási feltétele: a [05 §1](049_story_directions_05_tests_acceptance_hu.md#1-elvek) szerinti kötelező ellenőrzések zöldek; a befagyasztott tesztek módosítatlanok; a PR leírása tartalmazza a hatókört, a teszteket, a dokumentációs hatást és az ismert kockázatokat.

## 2. Csomagok

### TI00 — Döntések és kanonikus dokumentáció

Cél: a terv döntéseinek átvezetése a kanonikus dokumentumokba, hogy a további csomagok elfogadott alapra épüljenek.

Teendők:

1. Új ADR: `docs/decisions/ADR-012-story-direction-and-optional-goal.md` (`status: canonical`), a [00 §5](049_story_directions_00_overview_hu.md#5-architektúra-döntések) A1–A10 döntéseivel. Elfogadása tulajdonosi jóváhagyás.
2. `docs/DEVELOPMENT_PLAN_HU.md`: új munkafolyam a „5. Új, az eredeti azonosítókon kívüli workstreamek” alatt: „TI00–TI10 — Választható történetirányok”, státusszal és elfogadási kapukkal.
3. `docs/DOCS_INDEX_HU.md`: a „személyes történetminőség” sor támogató dokumentumai közé a hét `049_story_directions_*` fájl.
4. `docs/product/PRODUCT_HU.md`: az indítás új leírása (irány, opcionális cél, rögzített irány).
5. A nyitott döntések ([00 §7](049_story_directions_00_overview_hu.md#7-nyitott-tulajdonosi-döntések)) rögzítése az Issue-ban; az N5 szövegek jóváhagyatása.

Elfogadás: `pnpm docs:check` zöld; az ADR tulajdonosi jóváhagyása dokumentált.

Megjegyzés: a `docs/plans/048_fiction_v9_decision_stakes_and_archetypes.md` nem követett terv; erre a csomag nem hivatkozik forrásként, és a tartalmát nem vezeti be.

### TI01 — Szerződések

Cél: a [02 §2–§3](049_story_directions_02_contracts_data_hu.md#2-a-történet-szerződése) sémái.

| Fájl | Változtatás |
| --- | --- |
| `packages/contracts/src/story-catalog.ts` (új) | a motor- és szerkezeti katalógus típusa, `storyCatalogs['1.0.0']` a [01 §1, §3](049_story_directions_01_product_ux_hu.md#1-irányok-és-altípusok) és a [03 §5.1](049_story_directions_03_engine_hu.md#51-a-storydirection-projekció) tartalmával, a `hardLimits` mezővel |
| `packages/contracts/src/story-labels.ts` (új) | megjelenítési szövegek két nyelven, azonosító szerint; a katalógusverziótól független ([02 §2.1](049_story_directions_02_contracts_data_hu.md#21-a-katalógus)) |
| `packages/contracts/src/story.ts` (új) | `storyPreference`, hangsúlysémák, `storyV1Schema`, `storySetupV1Schema`, `storyDraftV1Schema`, `storySetupFromDraft`, `firstIncompleteStep` |
| `packages/contracts/src/life-v2.ts` | G1–G4 ([02 §3.2](049_story_directions_02_contracts_data_hu.md#32-érintett-helyek)); `story` mező a bemenetben, az indítási és a piszkozati sémában; `relationships[].address` |
| `packages/contracts/src/fiction.ts` | v10 enumok, `fictionV10Policy`, minőségi listák ([03 §4.3](049_story_directions_03_engine_hu.md#43-érintett-kódhelyek)) |
| `packages/contracts/src/error-messages.ts` | három új hibaüzenet ([02 §5](049_story_directions_02_contracts_data_hu.md#5-api)) |
| `packages/contracts/src/index.ts`, `export-schemas.ts` | exportok; új sémafájlok |
| `docs/contracts/**` | a `pnpm schemas` kimenete |
| `docs/V2_SIMULATION_CONTRACT_HU.md` | az opcionális cél és a `story` blokk leírása |

Tesztek: U-C1–U-C21 (a betűvel jelölt alesetekkel). Az U-C1 lenyomata ebben a csomagban még nem rögzített: a katalógus `1.0.0` verziója az R5 lépésig jelölt, a lenyomat a TI09 végén kerül a tesztbe.

Figyelmeztetés: a `lifeStateV2Schema.goals` és `lifeInputV2Schema.goals` alsó korlátjának elhagyása minden hívót érint. A típusellenőrzés (`pnpm typecheck`) után kézzel is át kell nézni a `find(…primary)!` és `goals[0]!` alakokat ([02 §3.2](049_story_directions_02_contracts_data_hu.md#32-érintett-helyek) G11–G17); a nem null állítás (`!`) elfedi a hibát.

### TI02 — Core

| Fájl | Változtatás |
| --- | --- |
| `packages/core/src/story-direction.ts` (új) | `validateStorySetup`, `lifeTitle`, `storyDirectionProjection`, `storyPublication`, `assertPublishableStory` |
| `packages/core/src/life-v2.ts` | `validateLifeInputV2`: G5 és a `story.cast` ellenőrzése |
| `packages/core/src/index.ts` | exportok |

Tesztek: U-K1–U-K18 (a betűvel jelölt alesetekkel).

A `validateStorySetup` a kapcsolók állapotát paraméterként kapja (a core nem olvas környezeti változót).

### TI03 — v10 generáció

| Fájl | Változtatás |
| --- | --- |
| `packages/ai/src/fiction-prompts.ts` | a v9 eredmény nevesítése és korai visszatérése; a v10 építése a [03 §5.2–§5.6](049_story_directions_03_engine_hu.md#52-a-határszabály-módosítása) szerint; betöltéskori ellenőrzés a v10-re |
| `packages/ai/src/index.ts` | `editFiction` sémaválasztás |
| `packages/ai/src/fiction-schema.ts` | a kompakt UUID-minta |
| `packages/core/src/fiction.ts` | `fictionScope` szabály; `fictionPlannerRequest` új kulcs és a minőségi lista |
| `docs/plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md`, `docs/AI_MODEL_ROUTING_HU.md` | a v10 leírása; jelölés: mérés előtti jelölt |

Tesztek: U-M1–U-M15 (a betűvel jelölt alesetekkel).

Lépések sorrendje:

1. Előbb az U-M2 teszt készül el a **mai** kódra (a v9 öt promptjának hash-e), és csak utána a refaktor. Így a refaktor bájtazonossága a saját tesztjével igazolt.
2. A v10 szöveg megírása; minden csere a meglévő `once` segédfüggvénnyel.
3. A kérés bővítése és a méretmérés.

A v10 szövege ebben a csomagban jelölt; a TI09 után fagy be.

### TI04 — Mentés, sorba állítás, konfiguráció, API

| Fájl | Változtatás |
| --- | --- |
| `packages/database/src/narrative-memory.ts` | `NarrativeConfig.storyDirections`; a három kapcsoló beolvasása és ellenőrzése |
| `packages/database/src/fiction-memory.ts` | `FictionGeneration`; `boundFictionContext` és `personalFictionPeriod` generációkezelése |
| `packages/database/src/lives.ts` | `buildLifeInput` (G6, `cast`); `create` (ellenőrzés, `draftRevision` kezelése, a piszkozat feltételes kiürítése: [02 §7.1](049_story_directions_02_contracts_data_hu.md#71-a-piszkozat-kiürítése-indítás-után)); `persistPrepared` (cím); `createPrepared*` védelem; `queue` (generációválasztás, előzmény-ellenőrzés); `retry` (policy) |
| `packages/database/src/life-jobs.ts` | `assertServiceJobPolicy` |
| `packages/database/src/repository.ts` | export fejléc: `storyContractVersion` |
| `apps/api/src/app.ts` | `GET /api/v2/story-directions`; a meglévő útvonalak sémái a szerződésből következnek |
| `docs/architecture/ARCHITECTURE_HU.md` | a generációválasztás és a kapcsolók |

Tesztek: I-S1–I-S13 (az I-S11 aleseteivel), I-D1–I-D6, I-F1–I-F8, I-W1–I-W8, I-E1–I-E6, I-C1–I-C4, I-P1–I-P3, I-R1–I-R5.

Kiemelt kockázat: a `queue()` módosítása a régi életek útvonalán fut. Az I-F4 és I-W6 teszt, valamint a v9 bájtrögzítő tesztek a kapu.

### TI05 — Új indító felület

| Fájl | Változtatás |
| --- | --- |
| `apps/web/components/story-start.tsx` (új; szükség szerint alkomponensek a `apps/web/components/story-start/` alatt) | az [01 §6](049_story_directions_01_product_ux_hu.md#6-az-indító-folyamat) szerinti folyamat |
| `apps/web/lib/story-messages.ts` (új) | kérdés- és válaszszövegek két nyelven ([01 §4–§6](049_story_directions_01_product_ux_hu.md#4-kérdések)) |
| `apps/web/components/life-experience.tsx` | a `page === 'start'` ágban: engedélyezett funkciónál `<StoryStart/>`, különben a régi űrlap; a régi űrlap rácsjavítása; az üres lista szövege; az irány megjelenítése a listán |
| `apps/web/lib/life-messages.ts` | az üres lista szövege |
| `apps/web/app/globals.css` | `.story-start`, választókártyák, háromállapotú vezérlő, a régi űrlap egyoszlopos rácsa ([01 §8](049_story_directions_01_product_ux_hu.md#8-vizuális-javítások)) |
| `apps/web/lib/client.ts` (ha kell) | a `GET /story-directions` hívása |

Előfeltétel: az N5 szerint jóváhagyott szövegek. Az `apps/web/AGENTS.md` előírása szerint kódírás előtt el kell olvasni a telepített Next.js verzió vonatkozó útmutatóját (`node_modules/next/dist/docs/`).

Tesztek: W-1–W-13 (a W-10b esettel), V-1–V-6, a [05 §4.3](049_story_directions_05_tests_acceptance_hu.md#43-kézi-végigpróba) 1–6. és 8–9. lépése helyben, worker nélkül.

Megvalósítási megkötések:

- A mentési mechanizmus (`save`, revízió, `saveChain`, ütközéskezelés) a meglévő kódból kerül át, viselkedésváltozás nélkül.
- A lépések adatvezéreltek: az irányfüggő kérdések leírása egy helyen áll (kulcs, típus, értékkészlet, megjelenési feltétel), a megjelenítő általános.
- A felület semmilyen választ nem tárol a böngésző tartós tárolójában (`localStorage`); csak a meglévő `sessionStorage` gyorsítótár marad, új kulccsal.

### TI06 — Adatkezelés

| Fájl | Változtatás |
| --- | --- |
| `apps/web/lib/i18n/messages.ts` | a tájékoztató szövege ([02 §8.4](049_story_directions_02_contracts_data_hu.md#84-tájékoztató-és-hozzájárulás)), a tulajdonos által jóváhagyott megfogalmazással |
| `docs/PRIVACY_SECURITY_CATALOG_HU.md` | az `aw_lives.input` és `aw_drafts.payload` leírása |
| `tests/legal-pages.test.ts` | a szövegváltozás követése |
| (opcionális, N1 szerint) `packages/database/src/lives.ts`, `apps/api/src/app.ts`, `packages/contracts/src/privacy-consent.ts` | `story_sensitive_preferences` hozzájárulás rögzítése és ellenőrzése |

Tesztek: I-P4–I-P7; I-P8 csak a hozzájárulásos változatnál.

Előfeltétel: az N1 döntés. Ha a döntés új elfogadási verziót kíván (`TERMS_ACCEPTANCE_VERSION`), az külön, saját kockázatú változtatás (az admission újraelfogadási útját érinti), és külön Issue-ba kerül.

### TI07 — Publikálási kapu és történetoldal

| Fájl | Változtatás |
| --- | --- |
| `packages/core/src/public-preview-editor.ts`, `public-draft.ts` | `assertPublishableStory` a három függvény elején; `privateCopyLabels` bővítése |
| `packages/core/src/public-fork.ts`, `packages/database/src/official-life.ts` | védelmi ellenőrzés |
| `apps/web/components/life-experience.tsx` | a másolat-hivatkozás feltétele; az irány megjelenítése a fejlécben |

Tesztek: I-B1–I-B6, W-11.

### TI08 — Üzemeltetés

| Fájl | Változtatás |
| --- | --- |
| `deploy/compose.yaml`, `deploy/server.env.example`, `.env.example` | a három kapcsoló, alapértelmezetten kikapcsolva |
| `scripts/ops/contabo-service-env.py` | az `ALLOWED` halmaz és az érvényesítők |
| `tests/ops/service-env-operator.test.mjs` | az új kulcsok esetei |
| `scripts/ops/story-draft-quarantine.ts` (új) | megőrző elkülönítés: `plan`, `park`, `restore`, `destroy` ([04 §6.5](049_story_directions_04_publication_ops_hu.md#65-v-4-megőrző-elkülönítés)) |
| a kiadási ellenőrzőlista | új pont: az image megérti a `story` blokkos piszkozatot és életet, a v10 jobot és artefaktumot; az R5 időpontjának rögzítése mint kompatibilitási padló |
| a kiadási pinek fájljai (`REVIEWED_IMAGE_CHANGES`, `REGISTRY_040_CHANGE_HASHES`) | a kiadás végleges PR-jában, a futó forrás közvetlen utódjaként |
| `docs/operations/NATIVE040_IMAGE_RELEASE_HU.md`, `docs/operations/NARRATIVE_RELEASE_HU.md` | a kiadás, a kapcsolók és a visszaállítás leírása ([04 §4–§6](049_story_directions_04_publication_ops_hu.md#4-kiadás-és-bevezetés)) |
| `docs/operations/TESTING_HU.md` | az új tesztkészlet |

Tesztek: I-C5, I-R6–I-R11; a meglévő üzemeltetési tesztek zöldek.

Az elkülönítő eszköz a bevezetés (TI10) előfeltétele: készen és tesztelve kell állnia, mielőtt a kohorsz bekapcsol, hogy szükség esetén ne rögtönzött megoldás szülessen.

Ez a csomag forrásmunka. Éles env-módosítás, image-kiadás vagy telepítés csak a TI10-ben, tulajdonosi jóváhagyással történik.

### TI09 — Mérőeszköz és tartalmi próba

| Fájl | Változtatás |
| --- | --- |
| `tests/story-fixtures.ts` | `storyProfiles` ([05 §6.2](049_story_directions_05_tests_acceptance_hu.md#62-profilok)) |
| `scripts/lib/narrative-evaluation-options.ts`, `narrative-evaluation-runner.ts`, `narrative-evaluation-fixtures.ts`, `narrative-probe.ts` | irányprofilok, v10 policy, a cél nélküli profilok fixture-ága |
| `docs/operations/NARRATIVE_EVALUATION_HU.md` | a próba leírása és eredménye |

Lépések:

1. Offline főpróba (mock szállítás): mind a 12 profil egy fejezettel; költés nincs.
2. A tulajdonos számszerű jóváhagyása (N3) után A szakasz; értékelés.
3. B szakasz; emberi értékelés a [05 §6.3](049_story_directions_05_tests_acceptance_hu.md#63-mérési-szempontok-és-küszöbök) szerint.
4. Promptjavítás, ha kell, és az érintett szakasz megismétlése a jóváhagyott kereten belül.
5. A v10 promptok és a katalógus `1.0.0` verziójának befagyasztása: a promptok hash-e a `tests/fiction-v10-prompts.test.ts`, a katalógus lenyomata a `tests/story-catalog.test.ts` fájlba kerül.

Elfogadás: az A és B szakasz küszöbei teljesültek, vagy a tulajdonos az eltérést írásban elfogadta.

A fizetős futás **nem** része a megvalósító ügynök önálló hatáskörének: csak kifejezett, számszerű tulajdonosi engedéllyel indítható.

### TI10 — Bevezetés

Lépések a [04 §4.1](049_story_directions_04_publication_ops_hu.md#41-sorrend) R2 és R5–R8 pontjai szerint, mindegyik külön tulajdonosi jóváhagyással:

1. Image-kiadás kikapcsolt kapcsolókkal; füstpróba régi élettel; megfigyelési időszak ([04 §6.2](049_story_directions_04_publication_ops_hu.md#62-kompatibilitási-padló)).
2. Tulajdonosi kohorsz; éles végigpróba ([05 §4.3](049_story_directions_05_tests_acceptance_hu.md#43-kézi-végigpróba) 7. és 10. lépés).
3. Általános bekapcsolás; megfigyelés a [04 §5](049_story_directions_04_publication_ops_hu.md#5-monitorozás) szerint legalább egy hétig.
4. (N2 pozitív döntése és a C szakasz után) a politikai irány bekapcsolása.
5. `docs/STATUS_HU.md` frissítése a ténylegesen ellenőrzött állapottal.
6. Későbbi, külön PR: a régi űrlap eltávolítása.

## 3. Függőségi megjegyzések

- A TI01 és a TI03 egyaránt módosítja a `packages/contracts/src/fiction.ts` fájlt. A v10 enumok és a policy a TI01 részei, hogy a TI02–TI04 tesztjei használhassák; a TI03 csak a promptokat és a kéréseket adja hozzá.
- A TI05 a TI04 `GET /story-directions` végpontjára épül; a felület fejlesztése közben a végpont válasza helyettesíthető.
- A TI07 a `life-experience.tsx` ugyanazon részét érinti, mint a TI05; ezért a TI05 után készül.
- A TI06 szövegváltozása pinelt fájlt érint (`messages.ts`); a pin frissítése a TI08 kiadási PR-jának része.

## 4. Kockázatok

| Kockázat | Hatás | Kezelés |
| --- | --- | --- |
| A refaktor megváltoztatja egy befagyasztott prompt bájtjait | a régi életek kérései eltérnek | U-M2 a refaktor előtt; a v8 és v9 bájtrögzítő tesztek |
| Az üres céllista egy nem azonosított hívón kivételt okoz | 500-as hiba cél nélküli életnél | TI01 kézi átnézés; I-S2, I-W1, I-B1; a cél nélküli élet csak v10 útvonalra juthat (U-M7) |
| A v10 nem követi a hangsúlyt, vagy rontja a minőséget | gyenge történetek | a v10 éles forgalmat csak a TI09 után kap; kapcsoló |
| A modell megsérti a „nincs megadva” szabályt | bizalmi és adatvédelmi kár | M7 szigorú küszöbe; a hűségellenőrző új kategóriája; a kapcsoló |
| A kérésméret a korlát fölé nő | elutasított szolgáltatói kérés | U-M12 mérés; a projekció korlátja; a meglévő N09 döntés a korlát értékéről |
| A politikai irányban valós szereplő jelenik meg | jogi és reputációs kockázat | külön kapcsoló; C szakasz; publikálási tiltás |
| Visszaállás a kiadás előtti image-re az első bekapcsolás után | a régi kód nem kezeli az új piszkozatot és a v10 jobot | kompatibilitási padló és megfigyelési időszak; a kapcsoló mint megőrző üzemmód; végső esetre megőrző elkülönítés, törlés nélkül ([04 §6](049_story_directions_04_publication_ops_hu.md#6-visszaállítás)) |
| Párhuzamos lapok a piszkozat kiürítésekor | újabb piszkozat elvesztése vagy felülírása | revízió- és tartalomegyezéshez kötött kiürítés, megmaradó revíziószámláló (I-S11c–I-S11f) |
| A politikai korlát más irányú történetben is hat | indokolatlan javítási körök, torzuló történetek | a korlát csak a politikai irány katalógusbejegyzésében él (U-K13b, U-M6b, M11b) |
| A cél nélküli szabály elnyomja a főszereplő vágyait | lapos, szándék nélküli történetek | a szabály csak az előre megadott célt zárja ki (U-M5b, M6) |
| A pinelt fájlok lenyomata nem frissül | a kiadási ellenőrzés elutasítja az image-et | TI08 |
| A tájékoztató frissítése elmarad a bekapcsolás előtt | megtévesztő adatkezelési tájékoztatás | K3 kapu ([04 §4.5](049_story_directions_04_publication_ops_hu.md#45-elfogadási-kapuk-a-bekapcsolás-előtt)) |

## 5. Amit a megvalósító ügynök nem dönthet el önállóan

- A nyitott tulajdonosi döntések ([00 §7](049_story_directions_00_overview_hu.md#7-nyitott-tulajdonosi-döntések)).
- Fizetős AI-hívás indítása.
- Éles telepítés, env-módosítás, adatbázis-művelet.
- A meglévő tartalmi védelem szövegének lazítása.
- Felhasználói adat (piszkozat, élet) törlése bármely üzemeltetési lépés részeként.
- Kiadott katalógusverzió vagy befagyasztott promptverzió módosítása.
- A befagyasztott tesztek módosítása.
- Adatbázis-migráció bevezetése (a terv szerint nem szükséges; ha annak látszik, meg kell állni).

Minden más megvalósítási részletben a terv az irányadó; ahol a terv hallgat, a meglévő kód mintáját kell követni, és a döntést a PR leírásában rögzíteni kell.
