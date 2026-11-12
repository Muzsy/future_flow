---
status: active-supporting
owner: personal-simulation
created: 2026-11-12
base_commit: 27adddc46d2d7da6f04a022bd2b1774530089684
related:
  - 049_story_directions_00_overview_hu.md
  - 049_story_directions_01_product_ux_hu.md
  - 049_story_directions_03_engine_hu.md
---

# 049/02 — Szerződések, adatmodell, kompatibilitás és adatkezelés

Minden kódrészlet **javaslat**: a megvalósítandó szerződést írja le, ma még nem létezik. A meglévő kódra tett hivatkozások a `27adddc` commitra vonatkoznak.

## 1. Áttekintés

| Elem | Állapot | Hely |
| --- | --- | --- |
| Motor- és szerkezeti katalógus (verziózott, kiadás után változatlan) | új | `packages/contracts/src/story-catalog.ts` |
| Megjelenítési szövegek (címkék, leírások; javíthatók) | új | `packages/contracts/src/story-labels.ts` |
| Tárolt `story` blokk, indítási és piszkozati alak | új | `packages/contracts/src/story.ts` |
| `lifeInputV2Schema`, `lifeStateV2Schema`, `lifeSetupV2Schema`, `lifeDraftV2Schema` | módosul | `packages/contracts/src/life-v2.ts` |
| Bemenet-ellenőrzés | módosul | `packages/core/src/life-v2.ts` (`validateLifeInputV2`) |
| Projekció és cím | új | `packages/core/src/story-direction.ts` |
| Élet létrehozása, sorba állítás | módosul | `packages/database/src/lives.ts` |
| Adatbázis | **nem változik** | — |

## 2. A történet szerződése

### 2.1. A katalógus

A katalógus két, eltérő módosíthatóságú rétegből áll. A kettőt külön fájl és külön szabály választja el, hogy a „változtathatatlan” és a „javítható” tartalom ne keveredjen.

| Réteg | Fájl | Tartalom | Verziózott? | Módosítható kiadás után? |
| --- | --- | --- | --- | --- |
| **Motor- és szerkezeti katalógus** | `packages/contracts/src/story-catalog.ts` | azonosítók, alkalmazhatóság, választhatóság, kapcsoló, célkategória-alapérték, összeférhetőség, minden motornak szánt szöveg | igen (`catalogVersion`) | **nem**, egyetlen bájt sem |
| **Megjelenítési szövegek** | `packages/contracts/src/story-labels.ts` | címkék, kártyaleírások, kezdőhelyzet-leírások két nyelven | nem | igen, bármikor |

```ts
// packages/contracts/src/story-catalog.ts — JAVASLAT
export const STORY_CATALOG_VERSIONS = ['1.0.0'] as const;
export const STORY_CATALOG_VERSION = '1.0.0'; // az új indításoknál használt verzió
export type StoryDirectionId =
  'relationships' | 'career' | 'creative' | 'travel' | 'politics';

export type StoryCatalog = {
  version: (typeof STORY_CATALOG_VERSIONS)[number];
  directions: Record<StoryDirectionId, {
    selectable: boolean;              // false = új indításnál nem választható
    flag: 'default' | 'politics';     // melyik kapcsoló engedélyezi
    goalCategory: GoalCategory;       // alapérték, ha a felhasználó célt ad meg
    compatibleWith: StoryDirectionId[]; // későbbi többhangsúlyos bővítéshez; 1.0.0-ban üres
    engine: {                         // szerver által írt, angol nyelvű motorkeret
      focus: string;                  // legfeljebb 400 karakter
      decisions: string;              // legfeljebb 300
      avoid: string;                  // legfeljebb 700; írói iránymutatás
      continuity: string | null;      // legfeljebb 400
      hardLimits: string[];           // legfeljebb 4 tétel, tételenként legfeljebb 400;
                                      // kötelező, ellenőrzött korlát; 1.0.0-ban csak a
                                      // politics iránynál nem üres
    };
    subtypes: Record<string, { engine: { focus: string } }>;
    situations: Record<string, {      // kulcs: 'rel.new_city' stb.
      subtypes: string[];
      selectable: boolean;
      engine: { brief: string };      // a motor kiinduló kerete, legfeljebb 300
    }>;
  }>;
};
export const storyCatalogs: Record<StoryCatalog['version'], StoryCatalog>;
export function storyCatalog(version: string): StoryCatalog; // ismeretlen verzió: DomainError

// packages/contracts/src/story-labels.ts — JAVASLAT
type Localized = { en: string; hu: string };
// Azonosító szerint kulcsolt megjelenítési szövegek. Lefedi minden katalógusverzió
// minden azonosítóját, mert a régi életek irányát is meg kell tudni nevezni.
export const storyLabels: {
  directions: Record<StoryDirectionId, { label: Localized; summary: Localized }>;
  subtypes: Record<string, Localized>;                 // kulcs: 'career/founder'
  situations: Record<string, { label: Localized; description: Localized }>;
};
```

A tartalom forrása: az irányok, altípusok és kezdőhelyzetek az [01 §1 és §3](049_story_directions_01_product_ux_hu.md#1-irányok-és-altípusok) táblái szerint; a motorkeretek a [03 §5.1](049_story_directions_03_engine_hu.md#51-a-storydirection-projekció) alatt. A kezdőhelyzet motorkerete (`engine.brief`) az `1.0.0` verzióban szó szerint megegyezik az [01 §3](049_story_directions_01_product_ux_hu.md#3-kezdőhelyzetek) angol leírásával, de attól külön tárolt érték: a megjelenített leírás később javítható, a motorkeret nem.

#### Verziózási szabályok

**1. Mikor válik egy katalógusverzió kiadottá.** Akkor, amikor élesben először jöhet létre vele élet, azaz a kohorsz bekapcsolásakor ([04 §4.1](049_story_directions_04_publication_ops_hu.md#41-sorrend), R5). Addig a verzió jelölt, és szabadon szerkeszthető (a v10 promptszövegekkel azonos szabály). A kiadáskor a verzió kanonikus JSON-jának SHA-256 lenyomata bekerül a tesztbe ([05, U-C1](049_story_directions_05_tests_acceptance_hu.md#21-szerződések)).

**2. Kiadott motor- és szerkezeti katalógus.** A `storyCatalogs[verzió]` teljes tartalma bájtra változatlan. Kivétel nincs: elírás javítása, új kezdőhelyzet, a `selectable` vagy a `flag` értékének megváltoztatása egyaránt új verziót kíván.

**3. Új verzió készítése.** A legutóbbi verzió másolatából, a változtatással; a korábbi verziók a `storyCatalogs` részei maradnak.

| Változtatás | Verziólépés |
| --- | --- |
| a motornak szánt szöveg javítása jelentésváltozás nélkül | PATCH (`1.0.1`) |
| új kezdőhelyzet, altípus, irány; `selectable`, `flag`, `goalCategory`, `compatibleWith` módosítása; motorkeret tartalmi módosítása | MINOR (`1.1.0`) |
| a `StoryCatalog` típus szerkezetének változása | MAJOR (`2.0.0`), a `STORY_CONTRACT_VERSION` felülvizsgálatával együtt |

**4. Azonosítók.** Egy azonosító (irány, altípus, kezdőhelyzet) jelentése minden verzióban ugyanaz. Azonosító nem törölhető és nem kaphat új jelentést; megszüntetése az új verzióban `selectable: false`.

**5. Meglévő életek.** Az élet a létrehozáskori `catalogVersion` értéket tárolja, és a motorkeretét mindig abból a verzióból oldja fel. Meglévő élet soha nem kerül át újabb katalógusverzióra.

**6. Új indítás.** Csak az aktuális verzióból (`STORY_CATALOG_VERSION`) történhet; a `selectable` jelző csak az aktuális verzióban számít.

**7. Megjelenítési szövegek.** A `storyLabels` nem része a katalógusverziónak, lenyomata nincs rögzítve, bármikor javítható. Megkötései: (a) minden katalógusverzió minden azonosítójához tartalmaz szöveget mindkét nyelven; (b) azonosítót nem töröl; (c) a javítás nem változtathatja meg az azonosító jelentését (az új jelentés új azonosító és új katalógusverzió). A megjelenítési szöveg soha nem kerül a motor kérésébe; ezt teszt igazolja ([05, U-K13](049_story_directions_05_tests_acceptance_hu.md#22-core)).

**8. Már rögzített címek.** A történet címe a létrehozáskor érvényes megjelenítési szövegből képződik, és az `aw_lives.title` oszlopban rögzül ([§3.3](#33-a-történet-címe)); a későbbi szövegjavítás a meglévő címeket nem érinti. A történetoldalon megjelenő iránynév az aktuális megjelenítési szöveg.

**9. Kérdés- és válaszszövegek.** A felület kérdésszövegei (`apps/web/lib/story-messages.ts`) ugyanebbe a javítható körbe tartoznak; a válaszok tárolt értékei (enum-értékek) a `story` szerződés részei, és a [§9](#9-bővíthetőség) szabályai szerint bővülnek.

### 2.2. A tárolt `story` blokk

```ts
// packages/contracts/src/story.ts — JAVASLAT
export const STORY_CONTRACT_VERSION = '1.0.0';
const label = z.string().trim().min(1).max(160);
const addressForm = z.enum(['she_her', 'he_him', 'they_them']);

const relationshipsEmphasis = z.object({
  direction: z.literal('relationships'),
  subtype: z.enum(['romantic', 'friendship', 'family', 'mixed']),
  attraction: storyPreference(
    z.array(z.enum(['women', 'men', 'nonbinary_people'])).min(1).max(3),
  ),
  relationshipStatus: storyPreference(
    z.enum(['single', 'partnered', 'unsettled']),
  ),
  themes: z.array(z.enum([
    'trust', 'closeness_distance', 'new_people',
    'old_wounds', 'commitment', 'independence',
  ])).max(2),
}).strict();

const careerEmphasis = z.object({
  direction: z.literal('career'),
  subtype: z.enum(['employee', 'founder', 'transition']),
  field: label.nullable(),
  drive: z.enum(['advancement', 'mastery', 'field_change', 'balance']).nullable(),
  venture: storyPreference(z.string().trim().min(3).max(160)),
  buildingWith: storyPreference(z.enum(['alone', 'cofounder', 'family'])),
  funding: z.array(z.enum(['savings', 'revenue', 'loan_or_investor'])).max(3),
  jobAnchors: z.array(
    z.enum(['income', 'colleagues', 'growth', 'obligations']),
  ).max(4),
}).strict();

const creativeEmphasis = z.object({
  direction: z.literal('creative'),
  subtype: z.enum(['personal', 'sharing', 'livelihood']),
  field: z.enum([
    'music', 'visual_art', 'writing', 'architecture_design',
    'performing_arts', 'film_photo', 'craft', 'other',
  ]),
  fieldLabel: label.nullable(),
  experience: storyPreference(z.enum(['beginning', 'some_years', 'long_time'])),
  company: z.enum(['alone', 'with_others', 'with_mentor', 'varies']).nullable(),
}).strict();

const travelEmphasis = z.object({
  direction: z.literal('travel'),
  subtype: z.enum(['work', 'lifestyle', 'journey']),
  workKind: label.nullable(),
  destination: label.nullable(),
  companions: storyPreference(
    z.enum(['alone', 'partner', 'friends', 'family', 'varies']),
  ),
  homeBase: z.enum(['kept', 'given_up', 'open']).nullable(),
}).strict();

const politicsEmphasis = z.object({
  direction: z.literal('politics'),
  subtype: z.enum(['local', 'organization', 'staff', 'civic']),
  role: label.nullable(),
  stakes: z.enum(['local', 'internal', 'national_fictional']).nullable(),
  style: z.enum(['open', 'dealmaking', 'behind_scenes']).nullable(),
  inventedNames: z.array(label).max(3),
}).strict();

export const storyEmphasisSchema = z.discriminatedUnion('direction', [
  relationshipsEmphasis, careerEmphasis, creativeEmphasis,
  travelEmphasis, politicsEmphasis,
]);

const startingSituation = z.object({
  id: z.union([
    z.literal('custom'),
    z.string().regex(/^[a-z]{3}\.[a-z_]{3,40}$/),
  ]),
  note: z.string().trim().min(1).max(400).nullable(),
}).strict();

// Az életben tárolt, módosíthatatlan alak (aw_lives.input.story).
export const storyV1Schema = z.object({
  contractVersion: z.literal(STORY_CONTRACT_VERSION),
  catalogVersion: z.enum(STORY_CATALOG_VERSIONS),
  // Az első elem a fő hangsúly. 1.0.0-ban pontosan egy elem.
  emphases: z.array(storyEmphasisSchema).min(1).max(1),
  startingSituation,
  protagonistAddress: storyPreference(addressForm),
  // A megadott (kezdeti) szereplők megszólítása, szereplőazonosítóval.
  cast: z.array(
    z.object({ actorId: z.uuid(), address: storyPreference(addressForm) })
      .strict(),
  ).max(10),
  boundaries: z.array(label).max(10),
  title: label.nullable(),
}).strict();
export type StoryV1 = z.infer<typeof storyV1Schema>;
export const STORY_BLOCK_BYTES = 4096; // a teljes blokk felső korlátja
```

A blokk az élet bemenetének opcionális része:

```ts
// packages/contracts/src/life-v2.ts — MÓDOSÍTÁS
export const lifeInputV2Schema = z.object({
  /* … a mai mezők változatlanul … */
  goals: z.array(goalV2Schema).max(5),          // volt: .min(1).max(5)
  story: storyV1Schema.optional(),              // új; hiányozhat, null nem lehet
}).strict();
```

Értelmezés:

| `input.story` | Jelentés |
| --- | --- |
| hiányzik | Irány nélküli élet: a funkció előtt indult, vagy megbízható szerveroldali sablonból készült (scenario, nyilvános elágazás, hivatalos élet). A rendszer nem rendel hozzá irányt, és a v9 generációval folytatja. |
| jelen van | Irányt választó élet. A blokk az élet létrehozásakor rögzül, később nem módosul; a v10 generációval készül minden fejezete. |

### 2.3. A háromállapotú preferencia

```ts
// packages/contracts/src/story.ts — JAVASLAT
export const storyPreference = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('specified'), value }).strict(),
    z.object({ mode: z.literal('engine_decides') }).strict(),
    z.object({ mode: z.literal('unspecified') }).strict(),
  ]);
```

| `mode` | Mit jelent | Mit tehet a motor | Mit nem tehet |
| --- | --- | --- | --- |
| `specified` | A felhasználó kifejezett történetbeli preferenciája. | Követi. | Eltérni tőle. |
| `engine_decides` | A felhasználó kifejezetten a fikcióra bízta. | Egyszer megválasztja, folytonossági történeti tényként rögzíti, és tartja. | Fejezetenként mást állítani. |
| `unspecified` | A rendszernek nincs adata: a felhasználó nem ismerte, vagy nem kívánta megadni. | Úgy ír, hogy a részlet kimondatlan maradjon. | Kitalálni, tényként kimondani, bármiből (névből, szerepből, történetből) következtetni rá. |

A tárolt életben minden háromállapotú mező jelen van; a kihagyott kérdés tárolt alakja `{ mode: 'unspecified' }`. Így a „hiányzik” és a „nincs megadva” nem keveredik: a hiány kizárólag a teljes `story` blokkra értelmezett (régi élet).

A nem háromállapotú opcionális mezők (`nullable`, illetve üres tömb) jelentése: nincs megadva; a rendszer nem kezeli tényként. A motor a meglévő általános szabály szerint járhat el (ismeretlen tény csak rögzített állapotváltozással vagy történeti ténnyel jön létre).

### 2.4. Indítási kérés

```ts
// packages/contracts/src/story.ts — JAVASLAT
// A kliens által küldött alak: nincs szereplőazonosító, a megszólítás a
// szereplő sorában érkezik.
export const storySetupV1Schema = storyV1Schema.omit({ cast: true });

// packages/contracts/src/life-v2.ts — MÓDOSÍTÁS
const setupRelationship = actorSchema.omit({ id: true }).extend({
  address: storyPreference(addressForm).optional(),
});
export const lifeSetupV2Schema = z.object({
  /* … a mai mezők változatlanul … */
  relationships: z.array(setupRelationship).max(10),
  goal: goalV2Schema.omit({ id: true, priority: true }).nullable(), // volt: kötelező
  story: storySetupV1Schema.optional(),
}).strict().superRefine((setup, ctx) => {
  // 1. Cél nélkül csak irányt választó élet indítható.
  if (setup.goal === null && !setup.story)
    ctx.addIssue({ code: 'custom', path: ['goal'],
      message: 'A goal is required when no story direction is given.' });
  // 2. Megszólítás csak irányt választó életben adható meg.
  if (!setup.story && setup.relationships.some((r) => r.address !== undefined))
    ctx.addIssue({ code: 'custom', path: ['relationships'],
      message: 'Address needs a story direction.' });
});
```

A kérés szintjén (nem a tárolt indítási alak részeként) egy opcionális mező társul hozzá:

```ts
// life-v2.ts — MÓDOSÍTÁS
export const lifeCreateRequestV2Schema = lifeSetupV2Schema.extend({
  locale: enabledLocaleSchema,
  // Annak a piszkozatnak a revíziója, amelyből ez az indítás készült.
  // Csak ennek megadásakor kísérli meg a szerver a piszkozat kiürítését (§7.1).
  draftRevision: z.number().int().positive().optional(),
});
```

Példa (`POST /api/v2/lives` törzse; cél nélküli kapcsolati történet):

```json
{
  "locale": "en",
  "draftRevision": 14,
  "identity": { "mode": "alternate", "label": null, "ageBand": "25_34" },
  "location": { "country": "IE", "region": null, "housing": null },
  "employment": { "status": null, "employerLabel": null, "workDomain": null },
  "finance": { "currency": null, "monthlyIncome": null, "liquidFunds": null },
  "skills": [],
  "relationships": [
    { "label": "Sam", "relationship": "friend",
      "address": { "mode": "specified", "value": "they_them" } },
    { "label": "Mum", "relationship": "family" }
  ],
  "resources": { "energy": null, "availableHoursPerWeek": null },
  "goal": null,
  "stayInCountry": false,
  "context": null,
  "story": {
    "contractVersion": "1.0.0",
    "catalogVersion": "1.0.0",
    "emphases": [{
      "direction": "relationships",
      "subtype": "romantic",
      "attraction": { "mode": "engine_decides" },
      "relationshipStatus": { "mode": "specified", "value": "single" },
      "themes": ["trust"]
    }],
    "startingSituation": { "id": "rel.new_city", "note": null },
    "protagonistAddress": { "mode": "unspecified" },
    "boundaries": ["No workplace storyline"],
    "title": null
  }
}
```

Szerveroldali, a sémán túli ellenőrzés (`validateStorySetup`, `packages/core/src/story-direction.ts`, javaslat); hiba esetén `DomainError('STORY_DIRECTION_INVALID', …, 400)`:

1. A kezdőhelyzet `id` létezik a megadott katalógusverzióban, `selectable`, és alkalmazható az adott irányra és altípusra; vagy `custom`, és a `note` legalább 10 karakter.
2. `relationships` irány: `friendship` és `family` altípusnál az `attraction` és a `relationshipStatus` értéke `unspecified`.
3. `creative` irány: `field = 'other'` esetén a `fieldLabel` nem `null`.
4. `career` irány: `employee` altípusnál a `venture` és a `buildingWith` értéke `unspecified`, a `funding` és a `jobAnchors` üres; `founder` altípusnál a `jobAnchors` üres.
5. `travel` irány: a `workKind` csak `work` altípusnál lehet nem `null`.
6. A `catalogVersion` egyenlő az aktuális `STORY_CATALOG_VERSION` értékkel (új indítás csak az aktuális katalógusból történhet).
7. Az irány `selectable`, és a kapcsolója engedélyezett ([04 §4.2](049_story_directions_04_publication_ops_hu.md#42-kapcsolók)); különben `DomainError('STORY_DIRECTION_UNAVAILABLE', …, 409)`.
8. A `story` blokk JSON-mérete legfeljebb `STORY_BLOCK_BYTES`.
9. `travel` iránynál a `stayInCountry` értéke `false`.

A tárolt bemenet ellenőrzése (`validateLifeInputV2`) kiegészül: a `story.cast` minden `actorId` értéke szerepel az `initialState.actors` között, és egyszer fordul elő.

### 2.5. Piszkozat

A piszkozat laza: befejezetlen és később érvénytelenné váló válaszokat is tárolnia kell.

```ts
// packages/contracts/src/story.ts — JAVASLAT
export const storyDraftV1Schema = z.object({
  contractVersion: z.literal(STORY_CONTRACT_VERSION),
  catalogVersion: z.string().max(16),
  direction: z.string().max(40).nullable(),
  subtype: z.string().max(40).nullable(),
  // Irányfüggő válaszok kulcs szerint; az érték skalár, rövid tömb vagy
  // háromállapotú preferencia. A szigorú ellenőrzés az indításkor történik.
  answers: z.record(
    z.string().regex(/^[a-zA-Z]{1,40}$/),
    z.union([
      z.string().max(160), z.null(),
      z.array(z.string().max(160)).max(10),
      z.object({ mode: z.enum(['specified', 'engine_decides', 'unspecified']),
        value: z.union([z.string().max(160),
          z.array(z.string().max(40)).max(10)]).optional() }).strict(),
    ]),
  ),
  startingSituation: z.object({
    id: z.string().max(60).nullable(),
    note: z.string().max(400).nullable(),
  }).strict(),
  protagonistAddress: storyPreference(addressForm).optional(),
  boundaries: z.array(z.string().max(160)).max(10),
  title: z.string().max(160).nullable(),
  // A 8. lépés választása; a célmezők a draft.goal alatt maradnak.
  goalChoice: z.enum(['none', 'set']).nullable(),
}).strict()
  // A szerződéscsomag böngészőben is fut: TextEncoder, nem Buffer
  // (minta: fiction.ts, ledgerBytes).
  .refine((d) => new TextEncoder().encode(JSON.stringify(d)).length <= 8192);

// life-v2.ts — MÓDOSÍTÁS: a piszkozat séma kiegészül.
// A draft.goal a mai laza alak marad (nem lehet null): a „nincs cél” választást
// kizárólag a story.goalChoice hordozza. Így a story blokk nélküli piszkozat
// alakja pontosan a mai, és a blokk leválasztása nem igényel kitalált értéket.
export const lifeDraftV2Schema = /* a mai kiterjesztés */ .extend({
  story: storyDraftV1Schema.optional(),
  // a relationships elemei a megszólítást opcionálisan tartalmazhatják
});
```

Közös segédfüggvények (`packages/contracts/src/story.ts`, javaslat), amelyeket a kliens és a tesztek is használnak:

```ts
// A piszkozatból indítási alakot készít, vagy megmondja, mi hiányzik.
export function storySetupFromDraft(
  draft: LifeDraftV2,
  catalog: StoryCatalog,
): { ok: true; setup: LifeSetupV2 }
 | { ok: false; steps: StoryStepId[]; staleAnswers: string[] };

// Az első hiányos lépés az újranyitáshoz.
export function firstIncompleteStep(
  draft: LifeDraftV2, catalog: StoryCatalog,
): StoryStepId;
```

A `storySetupFromDraft` a `story.goalChoice` alapján dönt a célról: `'none'` esetén az indítási alakban `goal: null` (a piszkozat célmezői megmaradnak, de nem kerülnek a kérésbe), `'set'` esetén a `draft.goal` értékei.

`staleAnswers`: azok a kulcsok, amelyek értéke a katalógusban ismeretlen vagy már nem választható. A felület ezeket törli, és a megfelelő lépésre lép ([01 §6.3](049_story_directions_01_product_ux_hu.md#63-piszkozat-mentése-és-újranyitása)).

## 3. A cél opcionálissá tétele

### 3.1. Elv

A cél nélküli élet tárolt alakja: `input.goals = []` és `initialState.goals = []`. Ál-cél nem készül. Cél nélküli élet csak `story` blokkal együtt jöhet létre, ezért mindig a v10 generációval fut; a régi (legacy, context, narrative-v1, v8, v9) útvonalak cél nélküli bemenetet soha nem kapnak.

### 3.2. Érintett helyek

| # | Hely | Mai állapot | Változtatás |
| --- | --- | --- | --- |
| G1 | `packages/contracts/src/life-v2.ts:87` (`lifeStateV2Schema.goals`) | `.min(1).max(5)` | `.max(5)` |
| G2 | `packages/contracts/src/life-v2.ts:264` (`lifeInputV2Schema.goals`) | `.min(1).max(5)` | `.max(5)` |
| G3 | `packages/contracts/src/life-v2.ts:286` (`lifeSetupV2Schema.goal`) | kötelező objektum | `.nullable()`, a [§2.4](#24-indítási-kérés) `superRefine` szabályával |
| G4 | `packages/contracts/src/life-v2.ts:314-316` (`lifeDraftV2Schema.goal`) | laza objektum | **nem változik**; a „nincs cél” választás a `story.goalChoice` mezőben áll ([§2.5](#25-piszkozat)) |
| G5 | `packages/core/src/life-v2.ts:131-142` (`validateLifeInputV2`) | pontosan egy elsődleges cél | elsődleges célok száma = `goals.length > 0 ? 1 : 0`; üres céllista csak `story` blokkal; a cél–célállapot megfeleltetés változatlan |
| G6 | `packages/database/src/lives.ts:98,111` (`buildLifeInput`) | mindig egy cél | `setup.goal === null` esetén `goals: []` és `initialState.goals: []` |
| G7 | `lives.ts:491` (cím) | `goals.find(primary)!.description` | `lifeTitle(input)`, [§3.3](#33-a-történet-címe) |
| G8 | `packages/core/src/fiction.ts:216-236` (`fictionReferenceProjection`) | `goalIds` a célállapotból | változatlan; üres lista érvényes |
| G9 | `packages/core/src/fiction-series.ts:352-363` (`goalActivity`) | célonként egy sor | változatlan; üres lista érvényes |
| G10 | `packages/core/src/life-v2.ts:266-277` (`goal_progress_set`) | ismeretlen célra `LIFE_GOAL_MISSING` | változatlan; cél nélküli életben minden `goal_progress_set` javítható hiba |
| G11 | `packages/core/src/public-preview-editor.ts:26`, `packages/core/src/public-draft.ts:168,213,221` | `goals.find(primary)!` | belépéskor `assertPublishableStory(input)`, [04 §2.2](049_story_directions_04_publication_ops_hu.md#22-első-kiadás-típusos-tiltás) |
| G12 | `packages/core/src/public-fork.ts:374-386` (ellenőrzőpont-vetítés) | a sablonséma legalább egy célt kér | elérhetetlen cél nélküli életből, mert előnézet nem készülhet; védelmi `assertPublishableStory` hívás |
| G13 | `packages/core/src/official-life.ts:84`, `packages/database/src/official-life.ts:163` | a forrásélet céljait olvassa | üzemeltetői útvonal; védelmi ellenőrzés: forrásélet `story` blokk nélkül és legalább egy céllal |
| G14 | `apps/worker/src/life-processor.ts:256`, `packages/core/src/narrative-runtime.ts:88`, `narrative-requests.ts:112` | a célokat átadja | változatlan; a `fictionScope` szabálya ([03 §4.3](049_story_directions_03_engine_hu.md#43-érintett-kódhelyek)) kizárja, hogy `story` blokkos élet ide jusson |
| G15 | `apps/web/components/life-experience.tsx:906` (összegző sor) | a cél leírását mutatja | az új indító összegzője váltja ([01 §6.4](049_story_directions_01_product_ux_hu.md#64-összegző-képernyő)); a régi űrlap változatlan |
| G16 | `apps/web/lib/life-messages.ts:6,100` (üres lista szövege) | „… starts with a goal.” | új szöveg ([01 §7](049_story_directions_01_product_ux_hu.md#7-a-történetoldal-és-a-lista-változásai)) |
| G17 | `scripts/lib/narrative-evaluation-fixtures.ts:349` (`goals[0]!`) | mérőeszköz | az új irányprofilok saját fixture-ágat kapnak ([05 §6](049_story_directions_05_tests_acceptance_hu.md#6-későbbi-tartalmi-próbák-terve)) |

Nem változik: a scenario-sablon (`scenarioTemplateSchema.goals.min(1)`), az elágazási ellenőrzőpont, a személyes scenario-indítás és a nyilvános pillanatkép célmezői. Ezek zárt, külön verziózott szerződések; cél nélküli élet nem juthat el hozzájuk ([04 §2](049_story_directions_04_publication_ops_hu.md#2-publikálás)).

A célkategória és a célhaladás megjelenítése: a privát történetoldal ma sem mutat célállapotot vagy célhaladást (ellenőrizve: `life-experience.tsx`), ezért ott nincs teendő. A nyilvános felületek célmezőit cél nélküli élet nem éri el.

### 3.3. A történet címe

Az `aw_lives.title` oszlop `NOT NULL`, és az `aw_lives` sor módosíthatatlan. A cím az élet létrehozásakor rögzül.

```ts
// packages/core/src/story-direction.ts — JAVASLAT
export function lifeTitle(input: LifeInputV2): string {
  const named = input.story?.title;
  if (named) return named;
  const goal = input.goals.find((g) => g.priority === 'primary');
  if (goal) return goal.description;               // a mai viselkedés
  // Cél nélküli élet: irány és kezdőhelyzet megjelenítési címkéje az élet nyelvén.
  const emphasis = input.story!.emphases[0]!;
  const situation = input.story!.startingSituation;
  const second = situation.id === 'custom'
    ? storyLabels.subtypes[`${emphasis.direction}/${emphasis.subtype}`]![input.locale]
    : storyLabels.situations[situation.id]!.label[input.locale];
  return `${storyLabels.directions[emphasis.direction].label[input.locale]} · ${second}`;
}
```

Példák: „Relationships & love · A new city, new people”; saját kezdőhelyzetnél „Career & business · Building my own business”. A szabad szöveges megjegyzés nem kerül a címbe. Régi életeknél a függvény a mai eredményt adja.

## 4. Kompatibilitás

### 4.1. Mátrix

| Eset | Viselkedés |
| --- | --- |
| Régi élet (nincs `story`, van cél) olvasása | Változatlan. Az új sémák a régi adat szuperhalmazát fogadják. |
| Régi élet folytatása és elágaztatása | v9 policy, bájtra azonos kérések. A `story` kulcs hiányzik a kérésből (nem `null`). |
| Régi piszkozat (nincs `story`) | Az új séma elfogadja; a felület az 1. lépésen nyit ([01 §6.3](049_story_directions_01_product_ux_hu.md#63-piszkozat-mentése-és-újranyitása)). A szerver a piszkozatot nem írja át. |
| Kiadáskor sorban álló vagy futó job | A payload befagyasztott (v9 policy, `story` nélkül); az új worker ugyanúgy dolgozza fel. Az ellenőrzőpontok sémái nem változnak. |
| Régi kliens (nyitva maradt böngészőfül) az új API-val | A `story` nélküli, célt tartalmazó kérés érvényes marad: irány nélküli élet jön létre, v9 policyval. Kikapcsolt kapcsolónál ez az egyetlen út. |
| Új kliens, kikapcsolt kapcsoló | A felület a régi űrlapot mutatja; `story` blokkos kérésre `STORY_DIRECTION_UNAVAILABLE` (409). |
| Scenario-ból, nyilvános elágazásból, hivatalos életből indított új élet | `createPrepared` / `createPreparedFork` útvonal: nincs `story`, v9 policy. Változatlan. |
| Régi nyilvános pillanatképek, ellenőrzőpontok, sablonok | Érintetlenek; a szerződésük nem változik. |
| Régi export | A formátum bővül (`storyContractVersion` fejmező); a régi sorok tartalma változatlan. |

### 4.2. Bájtazonosság

A régi életek kérései akkor maradnak bájtra azonosak, ha:

1. a `story` mező `.optional()`, és hiányzó kulcsként szerializálódik;
2. a `fictionPlannerRequest` a `storyDirection` kulcsot csak `2.9.0` minőségi policy esetén adja hozzá;
3. a v1–v9 promptszövegek érintetlenek.

Ezt a meglévő `tests/fiction-v8-golden.test.ts` és `tests/fiction-v9-request-bytes.test.ts` változtatás nélkül igazolja; a megvalósítás ezeket a teszteket nem módosíthatja ([05 §2.3](049_story_directions_05_tests_acceptance_hu.md#23-motor)).

### 4.3. Visszafelé nem kompatibilis irány: az új adat és a régi kód

A csomag szerződéseit még nem ismerő (a kiadás előtti) kód az új adattal így viselkedne (forrásból levont következtetés):

- A `story` blokkos életek **olvashatók** (a részletező lekérdezés nem validálja a bemenetet).
- Folytatásuk megáll: a cél nélküli élet állapota a régi `lifeStateV2Schema.parse` hívásán (`lives.ts:565`), a v10 fejezetet tartalmazó élet a régi `fictionArtifactSchema.parse` hívásán (`fiction-memory.ts:322`) bukik el. Adat nem sérül, fejezetfoglalás nem keletkezik.
- A `story` kulcsot tartalmazó piszkozatot a régi kliens nem tudja menteni (szigorú séma).
- Sorban álló v10 jobot a régi worker `NARRATIVE_CONTEXT_INVALID` hibával zárna le (`life-jobs.ts:122-146`), amely után az újrapróbálás nem elérhető (`life-job-state.ts:113-127`).

Ebből két tervezési következmény adódik, a részletek a [04 §6](049_story_directions_04_publication_ops_hu.md#6-visszaállítás) alatt:

1. Az első bekapcsolás után a kiadás előtti image nem visszaállítási cél (kompatibilitási padló). A visszaállítás eszköze a kapcsoló, illetve olyan image, amely ismeri ezeket a szerződéseket.
2. Ha a padló alá kellene menni, az adatot megőrző elkülönítés szükséges; törlés nem megengedett.

A piszkozat alakja ezt támogatja: a `story` blokk leválasztása után a piszkozat pontosan a mai alak ([§2.5](#25-piszkozat)), ezért a leválasztás és a visszaillesztés veszteségmentes.

## 5. API

| Útvonal | Változás |
| --- | --- |
| `GET /api/v2/story-directions` | **új**; válasz: `{ enabled: boolean, catalogVersion: '1.0.0', directions: [{ id, enabled }] }`. A hívó felhasználóra számított érték (kapcsoló vagy kohorsz). Hitelesített, nem generálási útvonal. |
| `GET /api/v2/draft` | A válasz alakja változatlan; a `payload` tartalmazhat `story` blokkot. |
| `PATCH /api/v2/draft` | A törzs sémája bővül ([§2.5](#25-piszkozat)). Új formátumú piszkozat első mentése csak engedélyezett fióknál történhet. Kikapcsolás után a már mentett új formátumú piszkozat közös mezői tovább szerkeszthetők revízióellenőrzéssel. Az irányválaszokat és a megszólításokat a szerver a tárolt piszkozatból őrzi meg. |
| `POST /api/v2/lives` | A törzs sémája bővül ([§2.4](#24-indítási-kérés)), opcionális `draftRevision` mezővel. A válasz új mezője: `draftCleared: boolean` ([§7.1](#71-a-piszkozat-kiürítése-indítás-után)). A dekorátorok (`@ClosedBetaGeneration()`, `@ChapterBilledGeneration()`) és az idempotencia változatlan. Új hibák: `STORY_DIRECTION_INVALID` (400), `STORY_DIRECTION_UNAVAILABLE` (409). |
| `GET /api/v2/branches/:id` | A válasz alakja változatlan; a `branch.input` már ma is része a válasznak, ebből olvasható a `story`. |
| `GET/POST /api/v2/branches/:id/public-preview`, `POST …/public-preview/check` | Új hiba cél nélküli vagy politikai irányú életnél: `PUBLIC_PREVIEW_STORY_UNSUPPORTED` (409). |
| `POST …/continue`, `…/choice`, `…/fork`, `/jobs/:id/retry` | A kérés és a válasz változatlan. |

Új hibaüzenetek (`packages/contracts/src/error-messages.ts`; EN / HU):

| Kód | EN | HU |
| --- | --- | --- |
| `STORY_DIRECTION_INVALID` | Some answers no longer fit the chosen story. Check the highlighted steps. | Néhány válasz már nem illik a választott történethez. Nézd át a megjelölt lépéseket. |
| `STORY_DIRECTION_UNAVAILABLE` | This kind of story is not available right now. Your draft is saved. | Ez a történettípus most nem érhető el. A piszkozatod megmaradt. |
| `PUBLIC_PREVIEW_STORY_UNSUPPORTED` | A story copy cannot be prepared for this kind of story yet. Your story stays private and unchanged. | Ehhez a történettípushoz még nem készíthető másolat. A történeted privát és változatlan marad. |

A `PUBLIC_PREVIEW_UNAVAILABLE` kód foglalt (befejezetlen időszak), ezért kap a tiltás saját kódot.

A géppel exportált szerződések (`docs/contracts/v2/*.schema.json`) a `pnpm schemas` futtatásával frissülnek; a CI `git diff --exit-code -- docs/contracts` lépése ezt megköveteli. Új exportok: `docs/contracts/v2/story.schema.json`, `storySetup.schema.json`, `storyDraft.schema.json` (bejegyzés a `packages/contracts/src/export-schemas.ts` fájlba).

## 6. Adatbázis-migráció

**Nem szükséges.** Indoklás:

| Kérdés | Válasz | Forrás |
| --- | --- | --- |
| Hol tárolódik az irány? | `aw_lives.input` (`jsonb`), a meglévő oszlopban. | `003_period_lives.sql:2-7` |
| Hol tárolódik a piszkozat iránya? | `aw_drafts.payload` (`jsonb`). | `003_period_lives.sql:62-66` |
| Kell-e védelem a módosítás ellen? | Már van: `aw_lives_immutable` trigger. | `003_period_lives.sql:73` |
| Engedi-e a séma a cél nélküli életet? | Igen: a cél a `jsonb` része; az `aw_lives.title` `NOT NULL`, de a [§3.3](#33-a-történet-címe) mindig ad értéket. | `003_period_lives.sql:4` |
| Kell-e új index vagy megszorítás? | Nem. Az irány szerinti összesítés ritka üzemeltetői lekérdezés ([04 §5](049_story_directions_04_publication_ops_hu.md#5-monitorozás)). | — |
| Érinti-e a visszaállítási és sémaőröket? | Nem: a táblák, oszlopok és a `schema-040` hash-tábla változatlan. | `tests/schema040-fixture-contract.test.ts`, `tests/privacy-recovery-schema.test.ts` (nem módosulnak) |

Következmény: nincs futtatási sorrend, nincs séma-visszaállítás. A kód és az adat kompatibilitását a [§4](#4-kompatibilitás) és a [04 §6](049_story_directions_04_publication_ops_hu.md#6-visszaállítás) kezeli.

Ha a megvalósítás során mégis adatbázis-változás látszana szükségesnek, az a terv hatókörén kívüli eltérés: meg kell állni, és a kérdést a tulajdonos elé kell vinni (AGENTS.md 5. pont).

## 7. Az élet létrehozása (`lives.ts`)

Javasolt változások a `LifeRepository` osztályban:

```ts
// buildLifeInput(setup, startDate) — MÓDOSÍTÁS (vázlat)
const actors = setup.relationships.map(({ address: _address, ...actor }) => ({
  ...actor, id: randomUUID(),
}));
const goalId = setup.goal ? randomUUID() : null;
const story = setup.story
  ? {
      ...setup.story,
      cast: setup.relationships.flatMap((r, i) =>
        r.address ? [{ actorId: actors[i]!.id, address: r.address }] : []),
    }
  : undefined;
return validateLifeInputV2({
  /* … a mai mezők … */
  goals: setup.goal ? [{ ...setup.goal, id: goalId, priority: 'primary' }] : [],
  initialState: {
    /* … */
    actors,
    goals: goalId ? [{ goalId, status: 'active', note: null }] : [],
  },
  ...(story ? { story } : {}),
});
```

- `create()`: a kérés szétválasztása (`draftRevision` és az indítási alak); a `lifeSetupV2Schema.parse` után `validateStorySetup(setup, this.narrative, userId)`; sikeres létrehozás után a piszkozat feltételes kiürítése ([§7.1](#71-a-piszkozat-kiürítése-indítás-után)).
- `persistPrepared()`: a cím `lifeTitle(input)`.
- `createPrepared()`, `createPreparedFork()`: változatlan; a sablonból épített bemenetben nincs `story`. Védelmi ellenőrzés: ha a megbízható bemenet mégis `story` blokkot tartalmaz, `STORY_DIRECTION_INVALID`.
- Az idempotencia mechanizmusa változatlan: a `once()` a teljes kérés (az indítási alak és a `draftRevision`) hashét tárolja, tartalmat nem; az ismételt kérés ugyanazt a választ adja.

A sorba állítás (`queue()`) változásai: [03 §4.3](049_story_directions_03_engine_hu.md#43-érintett-kódhelyek).

### 7.1. A piszkozat kiürítése indítás után

Cél: az érzékeny válaszok ne maradjanak meg az életen kívül egy második helyen. A művelet nem veszélyeztethet más, újabb piszkozatot, ezért nem felhasználó szerinti törlés, hanem **feltételes kiürítés**.

Miért nem törlés:

- A piszkozat felhasználónként egy sor (`aw_drafts.user_id` elsődleges kulcs). Egy másik böngészőlap közben újabb tartalmat menthet ugyanebbe a sorba.
- A sor törlése a revíziószámlálót is visszaállítaná. Egy régi, elavult lap ezután a régi revíziószámával érvényesen menthetne, és felülírná az újabb piszkozatot (ABA-hiba). A sor megtartása és a revízió növelése ezt kizárja.

Feltételek (mindegyik kell):

| # | Feltétel | Mit véd |
| --- | --- | --- |
| 1 | a kérés tartalmaz `draftRevision` értéket, és az élet `story` blokkal jött létre | régi kliens és irány nélküli indítás viselkedése változatlan (a piszkozat megmarad) |
| 2 | a tárolt piszkozat revíziója egyenlő a `draftRevision` értékkel | egy másik lapon közben mentett újabb piszkozat érintetlen marad |
| 3 | a tárolt piszkozatból képzett indítási alak azonos a létrehozott élet indítási alakjával: `hash(storySetupFromDraft(tárolt).setup) === hash(setup)` | hibás kliens vagy téves revíziószám nem ürít ki olyan piszkozatot, amelyből nem ez az élet készült |

```ts
// packages/database/src/lives.ts — JAVASLAT (a create() tranzakciójában,
// a persistPrepared után; a felhasználói sor zárja a saveDraft hívásokkal
// szemben sorba állítja: lives.ts:225-247)
let draftCleared = false;
if (setup.story && draftRevision !== undefined) {
  const [draft] = await tx.query<{ revision: number; payload: unknown }>(
    'SELECT revision,payload FROM aw_drafts WHERE user_id=$1 FOR UPDATE',
    [userId],
  );
  if (draft && draft.revision === draftRevision && sameSetup(draft.payload, setup)) {
    const rows = await tx.query(
      "UPDATE aw_drafts SET revision=revision+1,payload='null'::jsonb,updated_at=now() WHERE user_id=$1 AND revision=$2 RETURNING revision",
      [userId, draftRevision],
    );
    draftCleared = rows.length === 1;
  }
}
return { ...queued, draftCleared };
```

Viselkedés:

- A kiürített sor megmarad: `payload` JSON `null`, a revízió eggyel nő. A `GET /api/v2/draft` válasza `{ revision, payload: null }`, amelyet a kliens ma is „nincs piszkozat” állapotként kezel (`life-experience.tsx:289`). Az oszlop `NOT NULL` megkötését a JSON `null` nem sérti; séma nem változik.
- A `sameSetup` a tárolt piszkozatot a közös `storySetupFromDraft` függvénnyel alakítja indítási alakká, és a meglévő `hash()` függvénnyel hasonlítja össze a létrehozott élet indítási alakjával; nem alakítható (hiányos) piszkozat nem egyezik.
- Ha bármelyik feltétel nem teljesül, az élet ettől függetlenül létrejön, a piszkozat érintetlen marad, a válaszban `draftCleared: false`. Ez nem hiba.
- A kliens a böngészőbeli gyorsítótárat csak `draftCleared: true` esetén törli. Ellenkező esetben a következő megnyitáskor a szerveren lévő (újabb) piszkozatot tölti be.
- Elavult lap későbbi mentése a megnövelt revízió miatt `LIFE_REVISION_CONFLICT` hibát kap (a mai ütközéskezelés), csendes felülírás nem történhet.
- Az idempotens ismétlés (azonos kulcs) a tárolt választ adja vissza; második kiürítés nincs.
- A művelet az élet létrehozásával egy tranzakcióban fut: ha a létrehozás visszagördül, a piszkozat is változatlan marad.

## 8. Adatkezelés

### 8.1. Milyen új adat keletkezik

| Adat | Érzékenység | Kötelező? |
| --- | --- | --- |
| irány, altípus, kezdőhelyzet | alacsony | igen |
| irányfüggő válaszok (terület, vállalkozás leírása, úti cél stb.) | alacsony–közepes; szabad szöveg tartalmazhat személyes adatot | nem |
| a főszereplő megszólítása | érzékeny, ha a történet a felhasználóról szól | nem |
| a megadott szereplők megszólítása | érzékeny lehet (harmadik személy) | nem |
| vonzódás, a szerelmi élet állapota | `self` módban különleges adatnak minősülhet | nem |
| kihagyandó tételek, megjegyzés, a történet neve | szabad szöveg | nem |

Politikai meggyőződésre, vallásra, egészségre a kérdőív nem kérdez.

### 8.2. Az adatok legkisebb köre és útja

| Hely | Tartalom | Megőrzés és törlés |
| --- | --- | --- |
| `aw_drafts.payload.story` | befejezetlen válaszok | sikeres indításkor a piszkozat tartalma kiürül, ha revíziója és tartalma egyezik az indításéval ([§7.1](#71-a-piszkozat-kiürítése-indítás-után)); fióktörléskor kaszkádol |
| `aw_lives.input.story` | a rögzített irány és válaszok | az élet törlésével (`DELETE /api/v2/lives/:id`) vagy a fiók törlésével szűnik meg |
| `aw_jobs.payload.input.story` | a job befagyasztott bemenetének része | az ág törlésével kaszkádol (`003_period_lives.sql:53`) |
| AI-szolgáltató | a generálási kérés része | a tájékoztatóban leírt szolgáltatói megőrzés |
| mentések | az adatbázis része | a meglévő megőrzési rend szerint |
| böngésző `sessionStorage` | a piszkozat és a lépés | a piszkozat sikeres kiürítésekor és kijelentkezéskor törlődik; a lap bezárásával megszűnik |

Ahová a válaszok **nem** kerülnek:

- `aw_metrics`, `aw_interactions`, `aw_activity_sessions`: csak eseménytípust tárolnak; a `trackLife` hívások nem kapnak új mezőt.
- Alkalmazásnapló: a prompt és a bemenet ma sem naplózott; új naplósor nem tartalmazhat `story` tartalmat (teszt: [05 §3.5](049_story_directions_05_tests_acceptance_hu.md#35-adatkezelés)).
- `ff_idempotency`: csak hash.
- Profil (`ff_profile_versions`), fiókadatok: a válaszok nem másolódnak át, és nem lesznek alapértékek a következő történetnél.
- Nyilvános szerződések (pillanatkép, tartalomcsomag, sablon, ellenőrzőpont, felfedezés): zárt engedélylisták, amelyek nem terjesztik ki a privát adatszerkezeteket; a `story` blokk egyikbe sem kerül be.
- Shared kontextus: a tagok interakciós profilja nem a `story` blokkból épül (`shared-contexts.ts:284`).
- Visszajelzés, hibajelentés: nem tartalmazza.

### 8.3. A fikció és a valós személy elkülönítése

1. A kérdések a szereplőről szólnak, a felhasználóról nem ([01 §5](049_story_directions_01_product_ux_hu.md#5-érzékeny-kérdések-megszólítás-és-vonzódás)).
2. A válaszok csak az adott élethez kötődnek. Nincs olyan kód, amely a `story` blokkból a felhasználóra vonatkozó attribútumot számít, tárol vagy jelenít meg; a terv ilyet nem vezet be, és teszt tiltja ([05 §3.5](049_story_directions_05_tests_acceptance_hu.md#35-adatkezelés)).
3. A motor által a fikcióban kialakított részlet (`engine_decides`) az élet történeti ténye (`narrative_artifact.storyFacts`), nem profiladat.
4. A megadott szereplőkről a motor továbbra sem találhat ki tartós magántényt; a v9 szabálya (csak kapcsolati állapot) változatlan, a v10 a megszólításra is kiterjeszti ([03 §5.4](049_story_directions_03_engine_hu.md#54-megszólítás-és-vonzódás)).
5. Üzemeltetői összesítés csak irány és altípus szerint készül, a háromállapotú mezők és a szabad szövegek kizárásával ([04 §5](049_story_directions_04_publication_ops_hu.md#5-monitorozás)).

### 8.4. Tájékoztató és hozzájárulás

A mai tájékoztató állításai (`privacy.introduction`, `terms.input1`) igazak maradnak: a rendszer nem kér pontos címet, munkáltatót, diagnózist vagy mások valódi nevét. Frissíteni kell:

- `privacy.introduction` / „Mit gyűjtünk” felsorolás: a történet iránya és az ahhoz adott, opcionális válaszok, köztük a szereplő megszólítására és vonzódására vonatkozó, opcionális történetbeli preferenciák.
- `privacy.aiDescription`: a generáláshoz ezek is a szolgáltatóhoz kerülnek.

Nyitott döntés ([00, N1](049_story_directions_00_overview_hu.md#7-nyitott-tulajdonosi-döntések)): kell-e külön kifejezett hozzájárulás és új elfogadási verzió. A szerkezet mindkét választ kiszolgálja:

- **Ajánlott (hozzájárulási sor nélkül):** a kérdésnél megjelenő tájékoztatás és a tájékoztató frissítése.
- **Ha külön hozzájárulás kell:** új `consent_type` érték (`story_sensitive_preferences`) az `ff_consents` táblában (a tábla szabad szöveges típust tárol, migráció nem kell: `001_foundation.sql:120-124`); a szerver `specified` vagy `engine_decides` értéket csak ilyen sor megléte esetén fogad el, különben `PRIVACY_ACKNOWLEDGEMENT_REQUIRED`. Ez a változat a TI06 csomag opcionális része.

### 8.5. Export és törlés

- Export (`GET /api/v1/me/export`): az `aw_drafts` és `aw_lives` sorok teljes egészében szerepelnek, így a `story` blokk is. A fejléc új mezőt kap: `storyContractVersion: '1.0.0'` (`repository.ts:593-599`).
- Élet törlése: a meglévő kaszkád a `story` blokkot és a jobok másolatait is törli. Új tábla nincs, ezért a törlési bizonyítékok (`scripts/lib/life-deletion-proof.ts`) nem változnak.
- Fiók törlése: változatlan.
- A privacy- és biztonsági katalógus (`scripts/lib/privacy-security-catalog.ts`, `tests/privacy-security-catalog.test.ts`) táblaszintű; új tábla és oszlop híján nem változik. A katalógus emberi olvasású dokumentumában (`docs/PRIVACY_SECURITY_CATALOG_HU.md`) az `aw_lives.input` és `aw_drafts.payload` leírása kiegészül a `story` blokk említésével.

## 9. Bővíthetőség

| Bővítés | Teendő | Amit nem kell újraépíteni |
| --- | --- | --- |
| Új kezdőhelyzet | új katalógusverzió (MINOR) a helyzettel és a motorkeretével; megjelenítési szövegek két nyelven | séma, felület, motor |
| Új kérdés egy irányhoz | új mező az irány `emphasis` sémájában (opcionális, alapértékkel), kérdésleírás a felületi katalógusban, szabály a projekcióban | az indító folyamat lépései |
| Új altípus | katalógus, az irány `subtype` enumja | az indító folyamat |
| Új irány | új `emphasis` ág a diszkriminált unióban, katalógusbejegyzés, motorkeret, szövegek, tesztek | az indító folyamat, a tárolás, a motor általános szabályai |
| Több egyidejű hangsúly | `emphases.max(1)` emelése; a katalógus `compatibleWith` listái; a projekció több elemet ad át; a felületen második választás | a tárolt alak (már tömb), a régi életek (egy elemű tömb érvényes marad) |
| Irány megszüntetése | `selectable: false` az új katalógusverzióban | a korábban indított életek változatlanul futnak |
| Megjelenített szöveg javítása | a `story-labels.ts` módosítása; katalógusverzió nem változik | minden más |
| Új kötelező korlát egy irányhoz | új katalógusverzió a `hardLimits` tétellel; a promptok nem változnak | a promptok és a hűségellenőrző szövege |

A többhangsúlyos bővítés szabályai (összeférhetőség, a fő hangsúly elsőbbsége) a bővítés saját tervének tárgyai; ebben a csomagban csak a tárolás és a katalógusmező készül el.
