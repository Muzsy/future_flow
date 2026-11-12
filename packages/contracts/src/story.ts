import { z } from 'zod';

import { STORY_CATALOG_VERSIONS } from './story-catalog';

export const storyPreference = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('specified'), value }).strict(),
    z.object({ mode: z.literal('engine_decides') }).strict(),
    z.object({ mode: z.literal('unspecified') }).strict(),
  ]);

export const STORY_CONTRACT_VERSION = '1.0.0';
const label = z.string().trim().min(1).max(160);
const addressForm = z.enum(['she_her', 'he_him', 'they_them']);
export const storyAddressSchema = storyPreference(addressForm);

const relationshipsEmphasis = z
  .object({
    direction: z.literal('relationships'),
    subtype: z.enum(['romantic', 'friendship', 'family', 'mixed']),
    attraction: storyPreference(
      z
        .array(z.enum(['women', 'men', 'nonbinary_people']))
        .min(1)
        .max(3),
    ),
    relationshipStatus: storyPreference(
      z.enum(['single', 'partnered', 'unsettled']),
    ),
    themes: z
      .array(
        z.enum([
          'trust',
          'closeness_distance',
          'new_people',
          'old_wounds',
          'commitment',
          'independence',
        ]),
      )
      .max(2),
  })
  .strict();

const careerEmphasis = z
  .object({
    direction: z.literal('career'),
    subtype: z.enum(['employee', 'founder', 'transition']),
    field: label.nullable(),
    drive: z
      .enum(['advancement', 'mastery', 'field_change', 'balance'])
      .nullable(),
    venture: storyPreference(z.string().trim().min(3).max(160)),
    buildingWith: storyPreference(z.enum(['alone', 'cofounder', 'family'])),
    funding: z.array(z.enum(['savings', 'revenue', 'loan_or_investor'])).max(3),
    jobAnchors: z
      .array(z.enum(['income', 'colleagues', 'growth', 'obligations']))
      .max(4),
  })
  .strict();

const creativeEmphasis = z
  .object({
    direction: z.literal('creative'),
    subtype: z.enum(['personal', 'sharing', 'livelihood']),
    field: z.enum([
      'music',
      'visual_art',
      'writing',
      'architecture_design',
      'performing_arts',
      'film_photo',
      'craft',
      'other',
    ]),
    fieldLabel: label.nullable(),
    experience: storyPreference(
      z.enum(['beginning', 'some_years', 'long_time']),
    ),
    company: z
      .enum(['alone', 'with_others', 'with_mentor', 'varies'])
      .nullable(),
  })
  .strict();

const travelEmphasis = z
  .object({
    direction: z.literal('travel'),
    subtype: z.enum(['work', 'lifestyle', 'journey']),
    workKind: label.nullable(),
    destination: label.nullable(),
    companions: storyPreference(
      z.enum(['alone', 'partner', 'friends', 'family', 'varies']),
    ),
    homeBase: z.enum(['kept', 'given_up', 'open']).nullable(),
  })
  .strict();

const politicsEmphasis = z
  .object({
    direction: z.literal('politics'),
    subtype: z.enum(['local', 'organization', 'staff', 'civic']),
    role: label.nullable(),
    stakes: z.enum(['local', 'internal', 'national_fictional']).nullable(),
    style: z.enum(['open', 'dealmaking', 'behind_scenes']).nullable(),
    inventedNames: z.array(label).max(3),
  })
  .strict();

export const storyEmphasisSchema = z.discriminatedUnion('direction', [
  relationshipsEmphasis,
  careerEmphasis,
  creativeEmphasis,
  travelEmphasis,
  politicsEmphasis,
]);

const startingSituation = z
  .object({
    id: z.union([
      z.literal('custom'),
      z.string().regex(/^[a-z]{3}\.[a-z_]{3,40}$/),
    ]),
    note: z.string().trim().min(1).max(400).nullable(),
  })
  .strict();

export const storyV1Schema = z
  .object({
    contractVersion: z.literal(STORY_CONTRACT_VERSION),
    catalogVersion: z.enum(STORY_CATALOG_VERSIONS),
    // Az első elem a fő hangsúly. 1.0.0-ban pontosan egy elem.
    emphases: z.array(storyEmphasisSchema).min(1).max(1),
    startingSituation,
    protagonistAddress: storyAddressSchema,
    // A megadott (kezdeti) szereplők megszólítása, szereplőazonosítóval.
    cast: z
      .array(
        z.object({ actorId: z.uuid(), address: storyAddressSchema }).strict(),
      )
      .max(10),
    boundaries: z.array(label).max(10),
    title: label.nullable(),
  })
  .strict();
export type StoryV1 = z.infer<typeof storyV1Schema>;
export const STORY_BLOCK_BYTES = 4096; // a teljes blokk felső korlátja

export const storySetupV1Schema = storyV1Schema.omit({ cast: true });

export const storyDraftV1Schema = z
  .object({
    contractVersion: z.literal(STORY_CONTRACT_VERSION),
    catalogVersion: z.string().max(16),
    direction: z.string().max(40).nullable(),
    subtype: z.string().max(40).nullable(),
    // Irányfüggő válaszok kulcs szerint; az érték skalár, rövid tömb vagy
    // háromállapotú preferencia. A szigorú ellenőrzés az indításkor történik.
    answers: z.record(
      z.string().regex(/^[a-zA-Z]{1,40}$/),
      z.union([
        z.string().max(160),
        z.null(),
        z.array(z.string().max(160)).max(10),
        z
          .object({
            mode: z.enum(['specified', 'engine_decides', 'unspecified']),
            value: z
              .union([z.string().max(160), z.array(z.string().max(40)).max(10)])
              .optional(),
          })
          .strict(),
      ]),
    ),
    startingSituation: z
      .object({
        id: z.string().max(60).nullable(),
        note: z.string().max(400).nullable(),
      })
      .strict(),
    protagonistAddress: storyAddressSchema.optional(),
    boundaries: z.array(z.string().max(160)).max(10),
    title: z.string().max(160).nullable(),
    // A 8. lépés választása; a célmezők a draft.goal alatt maradnak.
    goalChoice: z.enum(['none', 'set']).nullable(),
  })
  .strict()
  // A szerződéscsomag böngészőben is fut: TextEncoder, nem Buffer
  // (minta: fiction.ts, ledgerBytes).
  .refine((d) => new TextEncoder().encode(JSON.stringify(d)).length <= 8192);
