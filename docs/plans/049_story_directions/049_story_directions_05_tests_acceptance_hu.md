---
status: active-supporting
owner: personal-simulation
created: 2026-11-12
base_commit: 27adddc46d2d7da6f04a022bd2b1774530089684
paid_provider_calls_authorized: false
related:
  - 049_story_directions_00_overview_hu.md
  - 049_story_directions_02_contracts_data_hu.md
  - 049_story_directions_03_engine_hu.md
  - 049_story_directions_04_publication_ops_hu.md
---

# 049/05 — Tesztelés és elfogadási feltételek

## 1. Elvek

1. Az automatizált tesztek nem hívnak fizetős szolgáltatót. A motor tesztjei a meglévő mintát követik: mock `FictionAiProvider`, PGlite adatbázis, rögzített fixture-ök (`tests/fiction-fixtures.ts`, `tests/life-fixtures.ts`, `tests/fiction-v9-worker.test.ts`).
2. A befagyasztott generációk tesztjei (`tests/fiction-v8-golden.test.ts`, `tests/fiction-v8-baseline.test.ts`, `tests/fiction-v9-request-bytes.test.ts`, `tests/fiction-v9-prompts.test.ts`, `tests/fiction-v9-contract.test.ts`) **nem módosíthatók**; zöld állapotuk a kompatibilitás bizonyítéka. Ha valamelyik elbukik, a megvalósítás hibás, nem a teszt.
3. A tartalmi minőség automatizált teszttel nem igazolható; arra a [§6](#6-későbbi-tartalmi-próbák-terve) próbaterve szolgál, külön költési engedéllyel.
4. Kötelező ellenőrzések minden PR-ban (AGENTS.md 7. pont): `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm schemas` (utána `git diff --exit-code -- docs/contracts`), `pnpm docs:check`.

Új tesztfájlok (javaslat): `tests/story-fixtures.ts`, `tests/story-catalog.test.ts`, `tests/story-contracts.test.ts`, `tests/story-direction-core.test.ts`, `tests/story-config.test.ts`, `tests/story-life-persistence.test.ts`, `tests/story-life-api.test.ts`, `tests/story-publication.test.ts`, `tests/fiction-v10-contract.test.ts`, `tests/fiction-v10-prompts.test.ts`, `tests/fiction-v10-request-bytes.test.ts`, `tests/fiction-v10-worker.test.ts`, `tests/story-web.test.ts`, `tests/story-rollback.test.ts`, `tests/story-draft-quarantine.test.ts`.

## 2. Unit-tesztek

### 2.1. Szerződések

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| U-C1 | A motor- és szerkezeti katalógus (`story-catalog.ts`) minden kiadott verziójának kanonikus JSON-ja | a SHA-256 egyezik a tesztben rögzített értékkel. A lenyomat a kiadáskor (R5 előtt, a promptok befagyasztásával együtt) kerül a tesztbe; a megjelenítési szövegek (`story-labels.ts`) nem részei a lenyomatnak |
| U-C1b | A megjelenítési szövegek módosítása (próba: egy címke átírása) | az U-C1 lenyomata és minden `storyDirectionProjection` kimenet változatlan |
| U-C1c | Új katalógusverzió hozzáadása (próba: kitalált `1.1.0` egy új kezdőhelyzettel) | az `1.0.0` lenyomata változatlan; `1.0.0` katalógusverziójú élet projekciója bájtra azonos; új indítás csak `1.1.0`-val fogadható el |
| U-C2 | Katalógus-integritás | minden kezdőhelyzet legalább egy létező altípusra hivatkozik; minden altípusnak legalább három választható kezdőhelyzete van; a motorkeretek és a kötelező korlátok a hosszkorláton belül vannak; az `1.0.0` verzióban a `hardLimits` csak a `politics` iránynál nem üres |
| U-C2b | A megjelenítési szövegek teljessége | a `storyLabels` minden katalógusverzió minden irány-, altípus- és kezdőhelyzet-azonosítójához tartalmaz angol és magyar szöveget; ismeretlen azonosítóhoz nem tartalmaz szöveget |
| U-C2c | Azonosítók állandósága | egy későbbi katalógusverzió nem hagy el korábbi azonosítót, és az azonosító irányhoz, altípushoz tartozása nem változik |
| U-C3 | `storyV1Schema` minden irányra | az [02 §2.4](049_story_directions_02_contracts_data_hu.md#24-indítási-kérés) példája és irányonként egy teljes példa érvényes |
| U-C4 | Ismeretlen kulcs a `story` blokkban vagy egy hangsúlyban | elutasítva (`strict`) |
| U-C5 | `emphases` üres vagy kételemű | elutasítva |
| U-C6 | Háromállapotú mező: `specified` érték nélkül; `engine_decides` értékkel; ismeretlen `mode` | mindhárom elutasítva |
| U-C7 | `lifeInputV2Schema` régi bemenettel (nincs `story`, egy cél) | érvényes; a kimenet JSON-ja bájtra azonos a bemenettel |
| U-C8 | `lifeInputV2Schema` üres céllistával és `story` blokkal | a séma elfogadja |
| U-C9 | `lifeSetupV2Schema`: `goal: null`, `story` nélkül | elutasítva |
| U-C10 | `lifeSetupV2Schema`: megszólítás a szereplő sorában, `story` nélkül | elutasítva |
| U-C11 | `lifeDraftV2Schema` régi piszkozattal (a mai `defaultSetup` alakja, üres célleírással) | érvényes |
| U-C12 | `lifeDraftV2Schema` ismeretlen irányazonosítóval és ismeretlen válaszkulccsal | érvényes (a piszkozat laza) |
| U-C13 | A piszkozat `story` blokkja 8192 bájt fölött | elutasítva |
| U-C14 | `storySetupFromDraft`: teljes piszkozat | `ok: true`, a kimenet érvényes `lifeSetupV2` |
| U-C15 | `storySetupFromDraft`: hiányzó altípus, hiányzó kezdőhelyzet, `custom` megjegyzés nélkül | `ok: false`, a megfelelő lépésazonosítókkal |
| U-C16 | `storySetupFromDraft`: nem választható kezdőhelyzet a piszkozatban | `ok: false`, `staleAnswers` tartalmazza a kulcsot |
| U-C17 | `firstIncompleteStep`: régi piszkozat | `direction` |
| U-C18 | `fictionPolicySchema`: `fictionV10Policy()` | érvényes |
| U-C19 | `fictionPolicySchema`: v10 tervező v9 szerkesztővel; v10 a `2.8.0` minőséggel; v9 a v2 hűségellenőrzővel | mind elutasítva |
| U-C20 | `fictionPolicy()` | változatlanul a v8 policy |
| U-C21 | A `pnpm schemas` kimenete | az új `story*.schema.json` fájlok léteznek; a `docs/contracts` naprakész |

### 2.2. Core

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| U-K1 | `validateLifeInputV2`: régi bemenet | változatlanul érvényes |
| U-K2 | `validateLifeInputV2`: üres céllista `story` nélkül | `LIFE_GOAL_REFERENCE` |
| U-K3 | `validateLifeInputV2`: üres céllista `story` blokkal, üres célállapottal | érvényes |
| U-K4 | `validateLifeInputV2`: üres céllista, de a kezdőállapotban van célállapot | `LIFE_GOAL_REFERENCE` |
| U-K5 | `validateLifeInputV2`: két elsődleges cél | `LIFE_GOAL_REFERENCE` (a mai viselkedés) |
| U-K6 | `validateLifeInputV2`: a `story.cast` ismeretlen vagy ismétlődő szereplőazonosítóval | `STORY_DIRECTION_INVALID` |
| U-K7 | `validateStorySetup`: az [02 §2.4](049_story_directions_02_contracts_data_hu.md#24-indítási-kérés) kilenc szabályának mindegyike külön megsértve | a megfelelő hibakód (`STORY_DIRECTION_INVALID`, illetve a 7. szabálynál `STORY_DIRECTION_UNAVAILABLE`) |
| U-K8 | `validateStorySetup`: politikai irány kikapcsolt politikai kapcsolóval | `STORY_DIRECTION_UNAVAILABLE` |
| U-K9 | `lifeTitle`: megadott név; cél; cél nélkül előre megadott kezdőhelyzet; cél nélkül `custom` | sorrendben: a név; a cél leírása; „irány · kezdőhelyzet”; „irány · altípus”, mindig nem üres, az élet nyelvén |
| U-K10 | `lifeTitle`: régi élet | a cél leírása (a mai viselkedés) |
| U-K11 | `storyPublication`: célos kapcsolati élet; cél nélküli élet; politikai élet céllal; régi élet | elérhető; `no_goal`; `politics`; elérhető |
| U-K12 | `applyFactChangesV2`: `goal_progress_set` cél nélküli állapotban | `LIFE_GOAL_MISSING` |
| U-K13 | `storyDirectionProjection`: minden irány és altípus | a kimenet a korláton (6144 bájt) belül van; a katalógus motorkeretét tartalmazza; a megjelenítési szövegek (`storyLabels`) egyike sem szerepel benne |
| U-K13b | `storyDirectionProjection`: `hardLimits` | politikai irányú életnél a három korlát szerepel; minden más iránynál a tömb üres, és a projekció JSON-ja nem tartalmaz politikára utaló szöveget |
| U-K14 | `storyDirectionProjection`: beágyazott utasítást tartalmazó megjegyzés, terület és kihagyandó tétel | a projekció JSON-jában a felhasználói szöveg egyik része sem szerepel |
| U-K15 | `storyDirectionProjection`: a háromállapotú mezők mind a három állapota, mezőnként | a megfelelő sablonsor jelenik meg ([03 §5.1](049_story_directions_03_engine_hu.md#51-a-storydirection-projekció)); a „nincs megadva” sor nem azonos az „A történetre bízom” sorral |
| U-K16 | `storyDirectionProjection`: első időszak és későbbi időszak | a `startingSituation` és a kezdeti állapotra vonatkozó sorok csak az elsőben szerepelnek |
| U-K17 | `storyDirectionProjection`: `friendship` altípus | a szerelmi szálra vonatkozó tiltó sor szerepel, a `attraction` értékétől függetlenül |
| U-K18 | `storyDirectionProjection`: cél nélkül és céllal | `goalMode` értéke `none`, illetve `set` |

### 2.3. Motor

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| U-M1 | A v8 és v9 bájtrögzítő tesztek | módosítás nélkül zöldek |
| U-M2 | `fictionPrompts` v1–v9 verzióval, a változtatás előtti és utáni szöveg hash-e | azonos (rögzített hash-ek új tesztben a v9 öt promptjára) |
| U-M3 | A v10 promptok betöltése mindkét nyelven | nem dob kivételt; minden csere pontosan egyszer illeszkedik |
| U-M4 | A v10 határszabálya | tartalmazza bájtra a „Preserve the current safety scope: …” mondatot; tartalmazza a profilozásról szóló kiegészítést; nem tartalmazza a régi „Respect goal unacceptableTradeoffs and explicit context limits.” mondatot |
| U-M5 | A v10 tervező, író, review, hűségellenőrző és szerkesztő szövege | mindegyik tartalmazza a [03 §5.6](049_story_directions_03_engine_hu.md#56-szakaszonkénti-kiegészítések) szerinti szakaszait, és mindegyik pontosan egyszer |
| U-M5b | A cél nélküli szabály szövege | tartalmazza, hogy a történetben kialakuló szándék megengedett („This removes only the pre-set goal, not wanting”); nem tartalmaz olyan tiltást, amely a főszereplő vágyainak, szándékainak megjelenítését zárná ki |
| U-M6 | A v10 promptok tartalma | egyik sem tartalmaz irányspecifikus szöveget (a „relationships”, „politics” stb. keret csak a projekcióból érkezik), sem konkrét történetrészletet; a hűségellenőrző szövegében nincs valós politikai utalásra vonatkozó kategória, csak az általános `direction_limit_violation` |
| U-M6b | Hűségellenőrzői kérés nem politikai irányú életnél | a kérésben a `hardLimits` üres; a kérés JSON-ja nem tartalmazza a politikai korlátok szövegét |
| U-M7 | `fictionScope`: `story` blokk v9 policyval; `story` nélkül v10 policyval | mindkettő `NARRATIVE_CONTEXT_INVALID` |
| U-M8 | `fictionPlannerRequest`: v9 fixture | nincs `storyDirection` kulcs; a kérés hash-e a változtatás előttivel azonos |
| U-M9 | `fictionPlannerRequest`: v10 fixture | van `storyDirection` és `referenceProjection`; az `input.story` a kérés része |
| U-M10 | Review-, hűség- és szerkesztői kérés v10 fixture-rel | a `storyDirection` megmarad; a `referenceProjection` és `castingProjection` nem szerepel |
| U-M11 | Szerzői javítási kérés mindhárom módban, v10 fixture-rel | a `storyDirection` és az `input.story` szerepel |
| U-M12 | A v10 kérések mérete szakaszonként (tipikus és maximális `story` blokkal, 0, 4 és 8 szereplővel) | a v9 megfelelő kérésénél legfeljebb 6144 bájttal + az `input.story` méretével (legfeljebb 4096 bájt) nagyobb; a mért értékek a tesztben rögzítve |
| U-M13 | `editFiction` sémaválasztása v10 szerkesztővel | `fictionHumanEditorialV13Schema` |
| U-M14 | Kompakt UUID-séma v10 promptverzióval | a v9-cel azonos kezelés |
| U-M15 | `buildFictionArtifact` v10 futással | az artefaktum policyja v10; a szerkezet a v9-ével azonos |

## 3. Integrációs tesztek

PGlite adatbázissal, mock szolgáltatóval.

### 3.1. Indítás

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-S1 | Indítás minden első körös iránnyal és minden altípussal, céllal | az élet létrejön; `aw_lives.input.story` a kérésnek megfelelő; a job policyja v10 |
| I-S2 | Indítás minden iránnyal cél nélkül | `input.goals = []`, `state.goals = []`; a cím nem üres; a job sorba áll |
| I-S3 | Indítás `story` nélkül, céllal (régi kliens) | irány nélküli élet; a job policyja v9; a payload bájtra a mai alak |
| I-S4 | Kikapcsolt kapcsoló, `story` blokkos kérés | `STORY_DIRECTION_UNAVAILABLE` (409); nem jön létre élet, job, foglalás |
| I-S5 | Kikapcsolt általános kapcsoló, a felhasználó a kohorsz tagja | az élet létrejön |
| I-S6 | Politikai irány kikapcsolt politikai kapcsolóval | `STORY_DIRECTION_UNAVAILABLE`; bekapcsolva létrejön |
| I-S7 | Azonos idempotencia-kulcs kétszer | egy élet; azonos válasz |
| I-S8 | Azonos kulcs eltérő törzzsel | `IDEMPOTENCY_CONFLICT` |
| I-S9 | A megadott szereplők megszólítása | a `story.cast` a létrejött szereplőazonosítókra hivatkozik; a szereplő állapotbeli sora nem tartalmaz megszólítást |
| I-S10 | A szereplők kapcsolattípusa (partner, családtag, barát, kolléga) | a kezdőállapotban a megadott típus szerepel (nem mind `friend`) |
| I-S11 | Sikeres `story` blokkos indítás egyező `draftRevision` értékkel | a piszkozatsor megmarad, `payload` JSON `null`, a revízió eggyel nőtt; a válaszban `draftCleared: true` |
| I-S11b | Indítás `draftRevision` nélkül, illetve `story` nélkül | a piszkozat változatlan (a mai viselkedés); `draftCleared: false` |
| I-S11c | A mentés és az indítás között egy másik munkamenet újabb piszkozatot mentett (a tárolt revízió nagyobb) | az élet létrejön; az újabb piszkozat bájtra változatlan; `draftCleared: false` |
| I-S11d | Egyező revízió, de a tárolt piszkozatból képzett indítási alak eltér a kéréstől | az élet létrejön; a piszkozat változatlan; `draftCleared: false` |
| I-S11e | Kiürítés után egy elavult munkamenet a régi revízióval ment | `LIFE_REVISION_CONFLICT`; a tárolt sor változatlan |
| I-S11f | ABA-eset: kiürítés, új piszkozat mentése, majd egy még régebbi munkamenet mentése a saját régi revíziójával | `LIFE_REVISION_CONFLICT` (a revízió a kiürítés után sem indul újra); az új piszkozat változatlan |
| I-S11g | Azonos idempotencia-kulccsal megismételt indítás a kiürítés után mentett új piszkozat mellett | a tárolt válasz érkezik; az új piszkozat változatlan |
| I-S11h | A létrehozás a kiürítés után hibára fut (szimulált hiba a tranzakcióban) | a tranzakció visszagördül; a piszkozat változatlan |
| I-S12 | Legacy vagy narrative-v1 mód, `story` blokkos kérés | elutasítva; nincs mellékhatás |
| I-S13 | `createPrepared` olyan bemenettel, amely `story` blokkot tartalmaz | `STORY_DIRECTION_INVALID` |

### 3.2. Piszkozat

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-D1 | Régi alakú piszkozat mentése és visszaolvasása | változatlan tartalom |
| I-D2 | `story` blokkos, hiányos piszkozat mentése és visszaolvasása | változatlan tartalom |
| I-D3 | Elavult revízió | `LIFE_REVISION_CONFLICT` (a mai viselkedés) |
| I-D4 | Piszkozat mentése kikapcsolt kapcsolónál | sikeres |
| I-D6 | Kiürített piszkozat (`payload` JSON `null`) lekérése és új mentés | a lekérés `{ revision, payload: null }`; a mentés a kapott revízióval sikeres |
| I-D5 | Régi piszkozat az adatbázisban a kiadás után | a szerver nem módosítja; a `GET /draft` a tárolt tartalmat adja |

### 3.3. Folytatás, elágazás, változtathatatlanság

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-F1 | Irányt választó élet: fejezet, döntés, folytatás | a második job policyja v10; a payload `input.story` blokkja bájtra azonos az elsőével |
| I-F2 | Privát elágazás egy korábbi döntésből | az új ág jobja v10; az `input.story` azonos; az `aw_lives` sor változatlan |
| I-F3 | Elágazás az elágazásból | ugyanaz |
| I-F4 | Régi élet folytatása és elágaztatása a kiadás után | v9 policy; `story` kulcs nincs a payloadban |
| I-F5 | `UPDATE aw_lives SET input = …` közvetlenül | az adatbázis kivételt dob („Canonical data is immutable”) |
| I-F6 | Az API felülete | nincs olyan útvonal, amely meglévő élet `story` blokkját módosítaná (a vezérlő útvonallistájának ellenőrzése) |
| I-F7 | Újrapróbálás sikertelen v10 job után, szolgáltatási profilban | elfogadva; v10 hash `story` nélküli payloaddal elutasítva |
| I-F8 | A döntés elfogadásának hatása cél nélküli életben | az opció típusos változásai az állapotba kerülnek; a következő kérés memóriája tartalmazza a választást |

### 3.4. Worker

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-W1 | Teljes v10 job mock szolgáltatóval, cél nélküli élettel | a fejezet mentve; az artefaktum policyja v10; 5 nyugta |
| I-W2 | A mock szerző `goal_progress_set` változást ad cél nélküli életben | javítási kör indul (`LIFE_GOAL_MISSING`), egy javítás után sikeres vagy `NARRATIVE_QUALITY_FAILED` |
| I-W3 | A mock hűségellenőrző `direction_boundary_violation` hibát jelez | teljes csomagjavítás (nem tények-only) |
| I-W4 | Megszakítás a szerzői válasz után (lejárt bérlet), majd újraigénylés | a job az ellenőrzőpontból folytatódik; új tervezői és szerzői hívás nincs |
| I-W5 | Megszakítás a kész artefaktum után | a job szolgáltatói hívás nélkül véglegesít (`lifeJobReadyToCommit`) |
| I-W6 | Kiadás előtt sorba állított v9 job feldolgozása az új kóddal | sikeres; a kérések hash-e a rögzítettel azonos |
| I-W7 | A szolgáltatási profil policy-ellenőrzése | v9 és (story mellett) v10 elfogadva; v8 elutasítva (a mai viselkedés) |
| I-W8 | A kérésszám plafonja v10 jobnál | a 10. kérés előtt `NARRATIVE_REQUEST_LIMIT` |

### 3.5. Adatkezelés

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-P1 | Fiókexport irányt választó élettel és piszkozattal | a `story` blokk az `aw_lives` és `aw_drafts` sorban szerepel; a fejlécben `storyContractVersion` |
| I-P2 | Élet törlése | az élet, az ágak, a jobok (a payloadban lévő `story` másolattal) törlődnek |
| I-P3 | Fiók törlése | piszkozat, életek, jobok törlődnek |
| I-P4 | Metrika- és interakciós táblák egy teljes indítás és fejezet után | egyik sor sem tartalmaz `story` tartalmat (a táblák tartalmának átvizsgálása a megadott, egyedi tesztszövegekre) |
| I-P5 | `ff_idempotency` sor az indítás után | csak hash és válasz; a tesztszövegek nem szerepelnek benne |
| I-P6 | Alkalmazásnapló egy teljes indítás, generálás és hiba során (elfogott `console` kimenet) | a tesztszövegek és a háromállapotú értékek nem szerepelnek |
| I-P7 | Statikus ellenőrzés | a `story.` mezőket olvasó modulok listája a tervezett halmazra korlátozódik (`packages/contracts/src/story.ts`, `story-catalog.ts`, `story-labels.ts`; `packages/core/src/story-direction.ts`, `packages/core/src/fiction.ts`, `packages/core/src/life-v2.ts`; `packages/database/src/lives.ts`; az elkülönítő eszköz; a web indító és a történetoldal); profil-, metrika-, megosztott és nyilvános modul nem olvassa |
| I-P8 | (csak ha N1 szerint külön hozzájárulás kell) `specified` érzékeny érték hozzájárulási sor nélkül | `PRIVACY_ACKNOWLEDGEMENT_REQUIRED` |

### 3.6. Publikálás

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-B1 | Cél nélküli élet: szerkesztőforrás, előellenőrzés, előnézet | mindhárom `PUBLIC_PREVIEW_STORY_UNSUPPORTED` (409); nem keletkezik előnézeti sor |
| I-B2 | Politikai irányú élet céllal | ugyanaz |
| I-B3 | Célos kapcsolati élet | az előnézet elkészül; a pillanatkép nem tartalmaz `story` kulcsot és a háromállapotú értékek egyikét sem |
| I-B4 | Az irány rövid szövege (például a vállalkozás leírása) a nyilvános másolat szövegében | az előellenőrzés `private_label` jelzést ad |
| I-B5 | Régi élet előnézete | változatlan |
| I-B6 | Scenario-indítás és nyilvános elágazás indítása | az új élet `story` nélküli, v9 policyval |

### 3.7. Jogosultság és elszámolás

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-E1 | A meglévő számlázási és generálási útvonaltesztek (`tests/billing-*.test.ts`, `tests/life-billing-notice.test.ts`, `tests/service-*.test.ts`) | módosítás nélkül zöldek |
| I-E2 | Irányt választó indítás fejezetkeret nélkül | a mai kerethiány-hiba; nem jön létre élet |
| I-E3 | Irányt választó indítás az első ingyenes fejezettel | egy foglalás; sikeres befejezéskor egy fogyasztás |
| I-E4 | Sikertelen v10 job | a foglalás visszakerül |
| I-E5 | `STORY_DIRECTION_INVALID` hiba | nincs foglalás |
| I-E6 | Napi és párhuzamos generálási korlát irányt választó életekkel | a mai viselkedés |

### 3.8. Konfiguráció

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-C1 | `narrativeConfigFromEnv`: kapcsolók nélkül | a mai konfiguráció; a funkció kikapcsolt |
| I-C2 | Bekapcsolt kapcsoló legacy módban vagy v8 generációval | `NARRATIVE_CONFIG_INVALID` |
| I-C3 | Érvénytelen kohorszlista (nem UUID, ismétlődés, 100 fölött) | `NARRATIVE_CONFIG_INVALID` |
| I-C4 | `GET /api/v2/story-directions` kikapcsolt, kohorszos és bekapcsolt állapotban | a hívó felhasználóra helyes `enabled` és iránylista |
| I-C5 | Az env-eszköz (`contabo-service-env.py`) az új kulcsokkal | elfogadja az érvényes, elutasítja az érvénytelen értéket |

### 3.9. Visszaállítás és megőrzés

Ezek a tesztek a kódban maradnak; minden későbbi kiadásnak teljesítenie kell őket ([04 §6.2](049_story_directions_04_publication_ops_hu.md#62-kompatibilitási-padló)).

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| I-R1 | Kikapcsolt kapcsoló, meglévő `story` blokkos élet: folytatás, elágazás, újrapróbálás | mindhárom működik v10 policyval |
| I-R2 | Kikapcsolt kapcsoló, futó v10 job | befejeződik |
| I-R3 | Kikapcsolt kapcsoló, `story` blokkos piszkozat: mentés a régi űrlap alakjával, amely a `story` blokkot változatlanul visszaküldi | sikeres; a `story` blokk bájtra azonos |
| I-R3a | Letiltott fiók első új formátumú mentése | A szerver elutasítja, a régi piszkozat és a revízió érintetlen. |
| I-R3b | Kikapcsolás után mentés korábbi új formátumú piszkozat mellett | A közös mezők érvényes revízióval módosulnak. Az irányválaszok és megszólítások a tárolt értékekből maradnak meg, és a kliens nem cserélheti ki őket. |
| I-R4 | Kikapcsolt kapcsoló, indítás csak a régi mezőkkel, miközben a piszkozatban `story` blokk van | irány nélküli élet jön létre; a piszkozat (a `story` blokkal) változatlan |
| I-R5 | Kapcsoló ki, majd újra be | a piszkozat irányválaszai megvannak; az indító az első hiányos lépésre lép |
| I-R6 | Elkülönítő eszköz, `plan` | a megszámolt piszkozatok és v10 jobok száma helyes; adat nem változik |
| I-R7 | `park`, majd azonnal `restore` | a piszkozat tartalma bájtra azonos az eredetivel (a revízió kettővel nőtt); az archívumrekordok száma egyenlő a módosított sorokéval |
| I-R8 | `park` után a piszkozat alakja | megfelel a csomag előtti `lifeDraftV2Schema` sémának (rögzített másolat a tesztben), `story` kulcs és megszólítás nélkül |
| I-R9 | `park`, a felhasználó a közös mezőket módosítja (a revízió nő), `restore` | a módosított közös mezők megmaradnak; a `story` blokk visszakerül; a megszólítás csak a változatlan címkéjű szereplőnél áll vissza |
| I-R10 | `restore` szélső esetei: kiürített piszkozat; hiányzó sor; törölt felhasználó; a piszkozatban már van `story`; a `restore` megismétlése | egyik esetben sincs felülírás; a jelentés tartalmazza az esetet; az ismétlés hatástalan |
| I-R11 | `park` közben megszakítás az archívumírás után, az adatbázis-módosítás előtt | a piszkozat változatlan; az árva rekordot a `restore` nem illeszti vissza kétszer |

## 4. Felületi és E2E tesztek

A repóban nincs böngészős tesztkeret; a felületi logika tesztjei Vitesttel futnak (minta: `tests/signup-ui.test.ts`, `tests/billing-web.test.ts`), a végigpróba dokumentált, kézi vagy Playwrighttal vezérelt futás (minta: a 2026-11-12-i új fiókos próbanapló).

### 4.1. Logikai tesztek (Vitest)

| # | Eset | Elvárt eredmény |
| --- | --- | --- |
| W-1 | Szövegkészlet | minden irányhoz, altípushoz, kezdőhelyzethez, kérdéshez és válaszhoz van angol és magyar szöveg; nincs hiányzó kulcs |
| W-2 | Lépéslista irányonként és altípusonként | a megjelenő kérdések megegyeznek az [01 §4](049_story_directions_01_product_ux_hu.md#4-kérdések) tábláival |
| W-3 | Irányváltás | az irányfüggő válaszok és a kezdőhelyzet törlődnek; a közös válaszok megmaradnak |
| W-4 | Altípusváltás | csak a nem megjelenő mezők és a nem alkalmazható kezdőhelyzet törlődik |
| W-5 | Háromállapotú vezérlő | az alapállapot `unspecified`; az `engine_decides` csak kifejezett választásra áll be; visszaállítható |
| W-6 | Célválasztás „Nem” | az indítási kérésben `goal: null`; a piszkozat megőrzi a korábbi célmezőket |
| W-7 | Régi piszkozat betöltése | az első lépés `direction`; a közös mezők kitöltöttek; nincs irány kiválasztva |
| W-8 | Elavult azonosító a piszkozatban | a felület a megfelelő lépésre lép, a válasz törölve |
| W-9 | Összegzés | a meg nem adott érzékeny mező „Nem adom meg”, a fikcióra bízott „A történetre bízom” szöveggel jelenik meg; a `romantic` + `unspecified` vonzódás tájékoztatása megjelenik |
| W-10 | Kikapcsolt kapcsoló | a régi űrlap jelenik meg |
| W-10b | Kikapcsolt kapcsoló, a piszkozatban `story` blokk és megszólítás van | a régi űrlap a közös mezőket mutatja; mentéskor a `story` blokk és a megszólítások változatlanul visszakerülnek; a tájékoztató szöveg megjelenik; az indítási kérés nem tartalmaz `story`, megszólítás és `draftRevision` mezőt |
| W-13 | Indítás utáni gyorsítótár | `draftCleared: true` esetén a böngészőbeli gyorsítótár törlődik; `false` esetén megmarad |
| W-11 | A történetoldal | az irány neve megjelenik; cél nélküli és politikai életnél a másolat-hivatkozás helyén tájékoztatás áll |
| W-12 | Gyorsítótár-kulcs | az új kulcs használatos; a régi kulcs törlődik |

### 4.2. Megjelenés

Képernyőméretek: 360 × 740, 390 × 844, 768 × 1024, 1280 × 800; angol és magyar szöveggel; minden lépés.

| # | Ellenőrzés | Elfogadás |
| --- | --- | --- |
| V-1 | Vízszintes görgetés | nincs |
| V-2 | Levágott válasz- vagy címkeszöveg | nincs (minden választható elem `scrollWidth <= clientWidth`; legördülő mezőnél a leghosszabb opció mért szélessége kisebb a rendelkezésre álló helynél) |
| V-3 | Érintési célméret | legalább 44 × 44 px |
| V-4 | Billentyűzet | minden lépés bejárható; a fókusz látható; a választókártyák nyílbillentyűvel válthatók |
| V-5 | Képernyőolvasó | a csoportok neve a kérdés; a mentési állapot `aria-live` régióban van (a mai megoldás megmarad) |
| V-6 | A régi űrlap | a legördülő mezők teljes szélességűek, a mért leghosszabb opció elfér |

A V-2 mérés módszere megegyezik az [01 §8.1](049_story_directions_01_product_ux_hu.md#81-a-hiba-oka) mérésével.

### 4.3. Kézi végigpróba

Helyi környezetben, **worker nélkül** (a job sorba áll, szolgáltatói hívás nem történik), majd az R6 lépésben élesben a tulajdonos saját keretéből.

1. Régi piszkozattal rendelkező fiók: belépés, `/start`, az irányválasztó nyílik meg a megőrzött adatokkal.
2. Végighaladás mind a négy alapirányon, legalább egy cél nélküli és egy célos indítással; minden lépésen visszalépés és módosítás.
3. Oldal újratöltése a 6. lépésen: ugyanoda tér vissza, a válaszok megvannak.
4. Másik böngészőben folytatás: az első hiányos lépésre érkezik.
5. Irányváltás megerősítéssel: az irányfüggő válaszok törlődnek.
6. Indítás: átirányítás a történetoldalra; az irány megjelenik; a lista címe helyes.
7. (Élesben) első fejezet, döntés, második fejezet, elágazás az első döntésből; kilépés és visszatérés után minden megvan.
8. Régi történet megnyitása és folytatása: változatlan működés.
9. Cél nélküli történetnél a másolat-hivatkozás helyén tájékoztatás; a `/preview/…` közvetlen megnyitása a hibaüzenetet adja.
10. Export letöltése: tartalmazza az irányt.

## 5. Negatív esetek összefoglalása

| Terület | Eset | Hol tesztelt |
| --- | --- | --- |
| Séma | ismeretlen kulcs, hibás háromállapotú alak, túl hosszú szöveg, túl nagy blokk | U-C4, U-C6, U-C13 |
| Katalógus | ismeretlen, nem választható vagy nem alkalmazható kezdőhelyzet | U-K7, U-C16 |
| Kapcsoló | kikapcsolt irány, kikapcsolt funkció | I-S4, I-S6 |
| Cél | cél nélkül irány nélkül; célhaladás cél nélküli életben | U-C9, U-K2, U-K12, I-W2 |
| Generáció | kevert policy és `story` állapot | U-M7, I-F7 |
| Módosítás | az irány átírási kísérlete | I-F5, I-F6 |
| Publikálás | cél nélküli vagy politikai élet előnézete | I-B1, I-B2 |
| Megszakítás | bérletvesztés, újraindulás ellenőrzőpontból | I-W4, I-W5 |
| Verseny | ismételt indítás azonos kulccsal; elavult piszkozatrevízió | I-S7, I-S8, I-D3 |
| Beágyazott utasítás | utasítás a szabad szövegben | U-K14 |
| Párhuzamos munkamenetek | indítás közben más lapon mentett piszkozat; elavult lap mentése | I-S11c, I-S11e, I-S11f |
| Visszaállítás | kikapcsolás új adatok mellett; elkülönítés és visszaillesztés | I-R1–I-R11 |

## 6. Későbbi tartalmi próbák terve

Ebben a munkamenetben nem indult fizetős generálás. Az alábbi próba az új megvalósítást méri; a jelenlegi motorral kontrollgenerálás nem készül. A költség- és kérésszám-összehasonlítás alapja a v9 már meglévő, rögzített mérései és az éles jobok adatai.

### 6.1. Eszköz

A meglévő mérőeszköz (`scripts/evaluate-narrative.ts`, `docs/operations/NARRATIVE_EVALUATION_HU.md`) bővítése: irányprofilok fogadása, v10 policy, a teljes éles útvonal (sor, worker, ellenőrzőpont, mentés) helyi PGlite adatbázison. Az offline mód (mock szállítás) a futtatás előtt kötelező főpróba. A fizetős mód feltételei a runbook szerintiek: külön jóváhagyási azonosító, számszerű keret, dedikált fejlesztési projektkulcs.

### 6.2. Profilok

Kitalált profilok (új fixture: `tests/story-fixtures.ts`, `storyProfiles`), angol tartalomnyelvvel.

| Profil | Irány / altípus | Kezdőhelyzet | Cél | Kiemelt beállítás |
| --- | --- | --- | --- | --- |
| P1 | relationships / romantic | `rel.new_city` | nincs | vonzódás: a történetre bízva; megszólítás: nincs megadva; nincs megadott szereplő |
| P2 | relationships / friendship | `rel.drifting_friends` | nincs | két megadott barát, az egyik megszólítása megadott (`they_them`), a másiké nincs megadva |
| P3 | relationships / family | `rel.family_expectations` | van (család) | megadott partner és családtag; megszólítás megadott (`she_her`) |
| P4 | career / founder | `car.cofounder_tension` | nincs | vállalkozás megadva; társsal; kihagyandó: „a családi otthon kockáztatása” |
| P5 | career / transition | `car.side_project` | van (vállalkozás) | heti 8 óra; ami az állásban tart: jövedelem, kötelezettségek |
| P6 | career / employee | `car.first_time_lead` | nincs | fontos: szakmai elmélyülés |
| P7 | creative / personal | `cre.private_work` | nincs | terület: zene; tapasztalat: a történetre bízva |
| P8 | creative / livelihood | `cre.commission_vs_own` | van (személyes fejlődés) | terület: képzőművészet |
| P9 | travel / lifestyle | `trv.remote_moving` | nincs | útitárs: egyedül; otthon: nyitva hagyva |
| P10 | travel / journey | `custom` (saját megjegyzés) | nincs | úti cél megadva |
| PL1 | politics / local | `pol.new_councillor` | nincs | két kitalált név megadva |
| PL2 | politics / staff | `pol.adviser` | van (egyéb) | a megjegyzés szándékosan egy valós politikus nevét tartalmazza (ellenpróba) |

Szakaszok:

| Szakasz | Tartalom | Fejezetek | Cél |
| --- | --- | --- | --- |
| A — füstpróba | P1, P3, P4, P7, P9; egy-egy fejezet | 5 | működik-e az útvonal; durva hibák |
| B — sorozat | P1, P2, P3, P4, P5, P7, P8, P9; négy-négy fejezet; P1, P4, P7, P9 második döntéséből egy-egy elágazás egy fejezettel | 36 | hangsúly, döntések, következmények, folytonosság, elágazás |
| C — politikai | PL1, PL2; négy-négy fejezet; egy-egy elágazás | 10 | valós hivatkozás hiánya, szövetségek követése |

A döntéseket előre rögzített szándék szerint kell választani (a meglévő `--choices-file` mechanizmus), profilonként legalább egyszer a „kevésbé kézenfekvő” opcióval.

### 6.3. Mérési szempontok és küszöbök

A küszöbök javaslatok; a tulajdonos a jóváhagyáskor módosíthatja.

| # | Szempont | Mérés | Küszöb |
| --- | --- | --- | --- |
| M1 | Technikai siker | elfogadott fejezetek aránya az elindítottakhoz | B: legalább 85%; A: legalább 4/5 |
| M2 | A hangsúly követése | (a) emberi értékelés 1–5: „a fejezet fő helyzete és döntése a választott irányhoz tartozik”; (b) vak próba: az értékelő a fejezetből kitalálja az irányt négy közül | (a) átlag legalább 4, profilátlag legalább 3,5; (b) legalább 80% találat |
| M3 | A hangsúly nem merev | emberi értékelés: „a fejezet nem erőlteti az irányt, más életterület is megjelenhet” | nincs olyan profil, ahol mind a négy fejezet ugyanarra a helyzettípusra épül |
| M4 | Az opciók különbsége | emberi értékelés döntésenként: „az opciók fajtájukban különböznek”; opciószám-eloszlás | legalább 90% igen; kitöltő opció egy sincs; az eloszlás csak tájékoztató |
| M5 | Következmények | a 2–4. fejezetben látható-e az előző elfogadott döntés hatása | 100% (a terv `choiceConsequences` mezője szerveren ellenőrzött; a próza emberi ellenőrzése) |
| M6 | Cél nélküli működés | determinisztikus: nincs `goal_progress_set`. Emberi, két kérdés: (a) a fejezet nem méri a történetet előre kitűzött célhoz, és a rendszer nem jelöl ki a főszereplőnek kívülről hosszú távú életcélt; (b) a történetben megjelenhetnek a főszereplő saját, az eseményekből fakadó vágyai és szándékai, és ezek nem hatnak erőltetettnek | determinisztikus 100%; (a) legalább 90%; (b) tájékoztató: a négy fejezet során legalább egy profilnál megjelenik kialakuló szándék, és sehol nem tűnik tiltottnak vagy kerültnek |
| M7 | Megszólítás és vonzódás | megadott érték követése; „nincs megadva” részlet kimondatlansága; a fikcióra bízott részlet rögzítése és tartása | mindhárom 100%; egyetlen sértés a promptok javítását és a szakasz megismétlését vonja maga után |
| M8 | Folytonosság | emberi olvasás: ellentmondás a korábbi fejezetekkel | legfeljebb egy kisebb ellentmondás profilonként, súlyos egy sem |
| M9 | Elágazás | az ág policyja v10 (determinisztikus); az ág megtartja a hangsúlyt és a szülő múltját (emberi) | 100% |
| M10 | Tartalmi határok | karrier: nincs tanácsadó hang, nincs sikerígéret; kapcsolat: nem explicit; utazás: nincs tényként közölt előírás | sértés egy sincs |
| M11 | Politikai irány (csak a C szakasz profiljai) | determinisztikus keresés valós pártok és politikusok névlistájára + emberi olvasás; a PL2 ellenpróba kezelése; a szövetségek következetessége négy fejezeten át | valós hivatkozás egy sincs; a megadott valós név nem jelenik meg; legfeljebb egy kisebb szövetségi ellentmondás |
| M11b | A politikai korlát nem hat más irányra (A és B szakasz) | a nem politikai profilok hűségellenőrzői jelentéseiben nincs `direction_limit_violation`; valós ország vagy intézmény mellékes említése miatt nem indult javítás | egyetlen ilyen javítás sincs |
| M12 | Költség és kérésszám | fejezetenkénti kérésszám, javítási arány, elszámolt költség | átlagos kérésszám legfeljebb 7; a fejezetköltség átlaga legfeljebb a v9 rögzített átlagának 1,25-szöröse |

Az emberi értékelés vak csomagból történik (a meglévő `human-review` kimenet mintájára), a tulajdonos vagy az általa kijelölt olvasó végzi. A szerkesztő modell pontszámai diagnosztikai adatok, nem elfogadási bizonyítékok.

### 6.4. Költségkeret-javaslat

Becslési alap: a 2026-10-27-i saját fiókos próba két v9 fejezete 0,599 USD volt (`docs/STATUS_HU.md`), azaz kb. 0,30 USD fejezetenként. A v10 kérései valamivel nagyobbak; a javaslat 1,5-szörös tartalékot tartalmaz a javítási körökre és a sikertelen kísérletekre.

| Szakasz | Fejezet | Becslés | Javasolt felső keret |
| --- | --- | --- | --- |
| A | 5 | 1,5 USD | 2 USD |
| B | 36 | 10,8 USD | 20 USD |
| C | 10 | 3 USD | 6 USD |

A becslés tájékoztató; a tényleges keretet a tulajdonos hagyja jóvá ([00, N3](049_story_directions_00_overview_hu.md#7-nyitott-tulajdonosi-döntések)). A szakaszok egymásra épülnek: a B csak sikeres A után, a C csak N2 pozitív döntése után indul. A keret kimerülésekor a futás megáll; automatikus bővítés nincs.

### 6.5. A próba kimenete

- Jelentés a `docs/operations/NARRATIVE_EVALUATION_HU.md` alá vagy saját próbanaplóba: forráscommit, promptverziók, profilok, mérőszámok, költség, a talált hibák.
- Promptjavítás esetén a v10 szövege módosul (éles forgalom előtt megengedett), és az érintett szakasz megismétlendő.
- A promptok befagyasztása: a végleges szöveg hash-e bekerül a v10 prompttesztbe; ettől kezdve a v10 a v9-hez hasonlóan változatlan.

## 7. Elfogadási feltételek a rögzített döntések szerint

| Döntés | Elfogadási feltétel | Bizonyíték |
| --- | --- | --- |
| 1. Opcionális cél | Minden irányban indítható cél nélküli élet; a rendszer egyik rétege sem állít elő ál-célt; a történetben kialakuló vágyak és szándékok megengedettek | I-S2, U-K3, U-K12, U-M5b, I-W1, M6 |
| 2. Következetes sandbox | A döntések állapotváltozásai érvényesülnek és megjelennek a következő fejezetben | I-F8, M5, M8 |
| 3. Egy hangsúly | Két hangsúly nem tárolható | U-C5 |
| 4. Bővíthetőség több hangsúlyra | A tárolt alak tömb; az egyelemű tömb érvényes marad a korlát emelése után | U-C3, [02 §9](049_story_directions_02_contracts_data_hu.md#9-bővíthetőség) |
| 5. Rögzített irány, öröklés | Az irány nem módosítható; minden privát ág ugyanazt az irányt kapja | I-F1–I-F6, M9 |
| 6. Több kezdőhelyzet | Minden altípushoz legalább három előre megadott kezdőhelyzet és a saját kezdőhelyzet | U-C2, W-2 |
| 7. Bővíthető katalógus | A kiadott katalógusverzió bájtra változatlan; új kezdőhelyzet új verzióval adható hozzá a régi életek érintése nélkül; a megjelenített szöveg a katalógus módosítása nélkül javítható | U-C1, U-C1b, U-C1c, U-C2b, U-C2c |
| 8. Érzékeny kérdések | A három állapot tárolásban, projekcióban és felületen elkülönül; a válaszok nem jutnak ki az élet köréből | U-C6, U-K15, W-5, W-9, I-P4–I-P7, M7 |
| 9. Nincs kontrollgenerálás | Az automatizált tesztek nem hívnak szolgáltatót; a próbaterv csak a v10-et futtatja | [§1](#1-elvek), [§6](#6-későbbi-tartalmi-próbák-terve) |
| 10. Nincs kötelező rotáció, archetípus, veszteség | A v10 promptok nem tartalmaznak ilyen szabályt | U-M5, U-M6; szövegellenőrzés: a v10 kiegészítései nem tartalmazzák a „must rotate”, „archetype”, „irreversible” kötelező alakjait |
| 11. Valódi opciókülönbség | A döntési szabály a promptban; emberi mérés | U-M5, M4 |
| Kompatibilitás | A régi életek, piszkozatok és futó jobok változatlanul működnek | U-M1, U-M2, U-M8, I-S3, I-D1, I-D5, I-F4, I-W6 |
| Jogosultság és elszámolás | Változatlan | I-E1–I-E6 |
| Publikálás | A cél nélküli és a politikai élet típusos hibát kap; a többi változatlan | I-B1–I-B6 |
| Politikai szabályok hatóköre | A valós politikai utalások tiltása csak politikai irányú életben érvényesül | U-C2, U-K13b, U-M6, U-M6b, M11, M11b |
| Piszkozat kiürítése | Csak az a piszkozat ürül ki, amelyből az élet készült; újabb piszkozat nem sérülhet | I-S11–I-S11h, I-D6, W-13 |
| Megőrző visszaállítás | Egyik visszaállítási szint sem töröl adatot | I-R1–I-R11, W-10b |
| Felület | Nincs levágott szöveg a megadott méreteken | V-1–V-6 |
