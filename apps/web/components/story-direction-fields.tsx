'use client';

import { useId, type ReactNode } from 'react';

import {
  storyCatalogs,
  storyLabels,
  type Locale,
  type StoryDirectionId,
  type lifeStoryDraftRequestV2Schema,
} from '@future-flow/contracts';

export type StoryDraft = ReturnType<typeof lifeStoryDraftRequestV2Schema.parse>;
export type StoryAvailability = {
  enabled: boolean;
  catalogVersion: keyof typeof storyCatalogs;
  directions: { id: StoryDirectionId; enabled: boolean }[];
};

type Draft = StoryDraft['story'];
const unspecified = { mode: 'unspecified' } as const;
const fictionalAnswerNotice = {
  en: 'These optional answers describe the character in this story. They are never treated as facts about you or anyone else.',
  hu: 'Ezek a válaszok nem kötelezőek, és a történet szereplőjére vonatkoznak. Nem kezeljük őket rólad vagy másról szóló tényként.',
};

export function blankStory(
  catalogVersion: StoryAvailability['catalogVersion'],
): Draft {
  return {
    contractVersion: '1.0.0',
    catalogVersion,
    direction: null,
    subtype: null,
    answers: {},
    startingSituation: { id: null, note: null },
    boundaries: [],
    title: null,
    goalChoice: 'none',
  };
}

export function directionStep(
  story: Draft,
  availability: StoryAvailability,
): -3 | -2 | -1 | 0 {
  const enabled = availability.directions.find(
    ({ id }) => id === story.direction && id in storyLabels.directions,
  );
  if (!enabled?.enabled || story.catalogVersion !== availability.catalogVersion)
    return -3;
  const direction =
    storyCatalogs[availability.catalogVersion].directions[enabled.id];
  if (!story.subtype || !Object.hasOwn(direction.subtypes, story.subtype))
    return -2;
  if (
    enabled.id === 'creative' &&
    (!story.answers.field ||
      (story.answers.field === 'other' && !story.answers.fieldLabel))
  )
    return -2;
  if (
    Object.entries(story.answers).some(
      ([key, answer]) =>
        answer &&
        typeof answer === 'object' &&
        !Array.isArray(answer) &&
        answer.mode === 'specified' &&
        (Array.isArray(answer.value)
          ? answer.value.length === 0
          : typeof answer.value !== 'string' ||
            answer.value.trim().length < (key === 'venture' ? 3 : 1)),
    )
  )
    return -2;
  const { id, note } = story.startingSituation;
  if (id === 'custom') return (note?.trim().length ?? 0) >= 10 ? 0 : -1;
  const match = Object.entries(direction.situations).find(
    ([key]) => key === id,
  )?.[1];
  return match?.selectable &&
    (match.subtypes as readonly string[]).includes(story.subtype)
    ? 0
    : -1;
}

export function StoryRadioCards<T extends string>({
  label,
  showLabel = true,
  options,
  value,
  onChange,
}: {
  label: string;
  showLabel?: boolean;
  options: readonly (readonly [T, ReactNode])[];
  value: string | null | undefined;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div className="story-card-group" role="radiogroup" aria-label={label}>
      {showLabel && <strong className="story-card-label">{label}</strong>}
      {options.map(([id, text]) => (
        <label className="story-start-option" key={id}>
          <input
            type="radio"
            name={name}
            value={id}
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}

const addressOptions = ['she_her', 'he_him', 'they_them'] as const;
const addressLabels = {
  she_her: 'she/her',
  he_him: 'he/him',
  they_them: 'they/them',
};
type Address = NonNullable<Draft['protagonistAddress']>;

export function AddressField({
  value,
  onChange,
  locale,
}: {
  value: Address | undefined;
  onChange: (value: Address) => void;
  locale: Locale;
}) {
  const hu = locale === 'hu';
  const label = hu
    ? 'Megszólítás a történetben'
    : 'Form of address in the story';
  return (
    <fieldset>
      <legend>{label}</legend>
      <small>{fictionalAnswerNotice[locale]}</small>
      <StoryRadioCards
        label={label}
        showLabel={false}
        value={
          value?.mode === 'specified'
            ? value.value
            : (value?.mode ?? 'unspecified')
        }
        options={[
          ['unspecified', hu ? 'Nem adom meg' : 'Not given'],
          [
            'engine_decides',
            hu ? 'A történetre bízom' : 'Let the story decide',
          ],
          ...addressOptions.map((id) => [id, addressLabels[id]] as const),
        ]}
        onChange={(selected) =>
          onChange(
            selected === 'unspecified'
              ? unspecified
              : selected === 'engine_decides'
                ? { mode: 'engine_decides' }
                : { mode: 'specified', value: selected },
          )
        }
      />
    </fieldset>
  );
}

type Field = {
  key: string;
  label: [string, string];
  choices?: readonly string[];
  preference?: boolean;
  multiple?: boolean;
  textList?: boolean;
  only?: readonly string[];
};
const fields: Record<StoryDirectionId, Field[]> = {
  relationships: [
    {
      key: 'attraction',
      label: [
        'In this story, who may the main character be drawn to?',
        'Kihez vonzódhat a főszereplő ebben a történetben?',
      ],
      choices: ['women', 'men', 'nonbinary_people'],
      preference: true,
      multiple: true,
      only: ['romantic', 'mixed'],
    },
    {
      key: 'relationshipStatus',
      label: [
        'Where does the main character’s love life stand at the start?',
        'Hol tart a főszereplő szerelmi élete a történet elején?',
      ],
      choices: ['single', 'partnered', 'unsettled'],
      preference: true,
      only: ['romantic', 'mixed'],
    },
    {
      key: 'themes',
      label: [
        'Recurring themes (up to two)',
        'Visszatérő témák (legfeljebb kettő)',
      ],
      choices: [
        'trust',
        'closeness_distance',
        'new_people',
        'old_wounds',
        'commitment',
        'independence',
      ],
      multiple: true,
    },
  ],
  career: [
    { key: 'field', label: ['Field of work', 'Munkaterület'] },
    {
      key: 'drive',
      label: ['What matters now?', 'Mi a fontos most?'],
      choices: ['advancement', 'mastery', 'field_change', 'balance'],
      only: ['employee'],
    },
    {
      key: 'venture',
      label: ['What does the business do?', 'Mivel foglalkozik a vállalkozás?'],
      preference: true,
      only: ['founder', 'transition'],
    },
    {
      key: 'buildingWith',
      label: ['Who builds it with you?', 'Kivel építed?'],
      choices: ['alone', 'cofounder', 'family'],
      preference: true,
      only: ['founder', 'transition'],
    },
    {
      key: 'funding',
      label: ['Funding', 'Finanszírozás'],
      choices: ['savings', 'revenue', 'loan_or_investor'],
      multiple: true,
      only: ['founder', 'transition'],
    },
    {
      key: 'jobAnchors',
      label: ['What keeps you in the job?', 'Mi tart még az állásodban?'],
      choices: ['income', 'colleagues', 'growth', 'obligations'],
      multiple: true,
      only: ['transition'],
    },
  ],
  creative: [
    {
      key: 'field',
      label: ['What do you make?', 'Mit alkotsz?'],
      choices: [
        'music',
        'visual_art',
        'writing',
        'architecture_design',
        'performing_arts',
        'film_photo',
        'craft',
        'other',
      ],
    },
    { key: 'fieldLabel', label: ['Tell us more precisely', 'Pontosítsd'] },
    {
      key: 'experience',
      label: ['Creative experience', 'Alkotói tapasztalat'],
      choices: ['beginning', 'some_years', 'long_time'],
      preference: true,
    },
    {
      key: 'company',
      label: ['Who do you create with?', 'Kivel alkotsz?'],
      choices: ['alone', 'with_others', 'with_mentor', 'varies'],
    },
  ],
  travel: [
    {
      key: 'workKind',
      label: ['What work takes you on the road?', 'Milyen munka visz útra?'],
      only: ['work'],
    },
    {
      key: 'destination',
      label: ['Where to?', 'Hová?'],
      only: ['lifestyle', 'journey'],
    },
    {
      key: 'companions',
      label: ['Who do you travel with?', 'Kivel utazol?'],
      choices: ['alone', 'partner', 'friends', 'family', 'varies'],
      preference: true,
    },
    {
      key: 'homeBase',
      label: ['What waits at home?', 'Mi vár otthon?'],
      choices: ['kept', 'given_up', 'open'],
      only: ['lifestyle', 'journey'],
    },
  ],
  politics: [
    {
      key: 'role',
      label: [
        'Role in the fictional institution',
        'Szerep a fiktív intézményben',
      ],
    },
    {
      key: 'stakes',
      label: ['Scope of the story', 'A történet léptéke'],
      choices: ['local', 'internal', 'national_fictional'],
    },
    {
      key: 'style',
      label: ['How does the character act?', 'Hogyan cselekszik a szereplő?'],
      choices: ['open', 'dealmaking', 'behind_scenes'],
    },
    {
      key: 'inventedNames',
      textList: true,
      label: [
        'Invented names (optional, up to three)',
        'Kitalált nevek (opcionális, legfeljebb három)',
      ],
    },
  ],
};

const optionLabels: Record<string, readonly [string, string]> = {
  women: ['Women', 'Nők'],
  men: ['Men', 'Férfiak'],
  nonbinary_people: ['Non-binary people', 'Nem bináris emberek'],
  single: ['Single', 'Egyedül'],
  partnered: ['In a relationship', 'Kapcsolatban'],
  unsettled: ['Unsettled', 'Rendezetlen'],
  trust: ['Trust', 'Bizalom'],
  closeness_distance: ['Closeness and distance', 'Közelség és távolság'],
  new_people: ['New people', 'Új ismeretségek'],
  old_wounds: ['Old wounds', 'Régi sérelmek'],
  commitment: ['Commitment', 'Elköteleződés'],
  independence: ['Independence', 'Önállóság'],
  advancement: ['Advancement', 'Előrelépés'],
  mastery: ['Mastery', 'Szakmai elmélyülés'],
  field_change: ['A change of field', 'Területváltás'],
  balance: ['Balance', 'Egyensúly'],
  alone: ['Alone', 'Egyedül'],
  cofounder: ['With a co-founder', 'Társsal'],
  family: ['With family', 'Családdal'],
  savings: ['Savings', 'Megtakarítás'],
  revenue: ['Revenue', 'Bevétel'],
  loan_or_investor: ['A loan or an investor', 'Hitel vagy befektető'],
  income: ['Steady income', 'Biztos jövedelem'],
  colleagues: ['Colleagues', 'Kollégák'],
  growth: ['Professional growth', 'Szakmai fejlődés'],
  obligations: ['Obligations', 'Kötelezettségek'],
  music: ['Music', 'Zene'],
  visual_art: ['Visual art', 'Képzőművészet'],
  writing: ['Writing', 'Írás'],
  architecture_design: ['Architecture and design', 'Építészet és tervezés'],
  performing_arts: ['Performing arts', 'Előadó-művészet'],
  film_photo: ['Film and photography', 'Film és fotó'],
  craft: ['Craft', 'Kézművesség'],
  other: ['Something else', 'Más'],
  beginning: ['Just beginning', 'Most kezdi'],
  some_years: ['Some years', 'Néhány éve'],
  long_time: ['A long time', 'Régóta'],
  with_others: ['With others', 'Társakkal'],
  with_mentor: ['With a mentor', 'Mester mellett'],
  varies: ['It varies', 'Változó'],
  partner: ['With a partner', 'Párommal'],
  friends: ['With friends', 'Barátokkal'],
  kept: ['A home and a job are kept', 'Megvan a lakás és a munka'],
  given_up: ['I gave everything up', 'Mindent felszámoltam'],
  local: ['Local matters', 'Helyi ügyek'],
  internal: ['Offices inside an organisation', 'Szervezeten belüli tisztségek'],
  national_fictional: [
    'An invented matter of national weight',
    'Kitalált, országos jelentőségű ügy',
  ],
  dealmaking: ['Through deals and alliances', 'Alkukkal és szövetségekkel'],
  behind_scenes: ['From the background', 'A háttérből'],
};
function directionAnswerLabel(key: string, value: string, locale: Locale) {
  if (value === 'open')
    return key === 'homeBase'
      ? locale === 'hu'
        ? 'Nyitva hagytam'
        : 'I left it open'
      : locale === 'hu'
        ? 'Nyílt lapokkal'
        : 'In the open';
  return optionLabels[value]?.[locale === 'hu' ? 1 : 0] ?? value;
}

export function StoryDirectionFields({
  step,
  story,
  availability,
  locale,
  onChange,
}: {
  step: number;
  story: Draft;
  availability: StoryAvailability;
  locale: Locale;
  onChange: (story: Draft) => void;
}) {
  const hu = locale === 'hu';
  const enabled = availability.directions.find(
    ({ id, enabled }) => enabled && id === story.direction,
  );
  const direction =
    enabled &&
    storyCatalogs[availability.catalogVersion].directions[enabled.id];
  const change = (patch: Partial<Draft>) => onChange({ ...story, ...patch });
  if (step === -3)
    return (
      <div className="story-start-options story-catalog-grid">
        {availability.directions
          .filter(({ enabled }) => enabled)
          .map(({ id }) => (
            <label className="story-start-option" key={id}>
              <input
                type="radio"
                name="story-direction"
                checked={story.direction === id}
                onChange={() => {
                  if (
                    (story.subtype || story.startingSituation.id) &&
                    !window.confirm(
                      hu
                        ? 'Az irányváltás törli az altípust és a kezdőhelyzetet. Folytatod?'
                        : 'Changing direction clears your subtype and starting situation. Continue?',
                    )
                  )
                    return;
                  change({
                    direction: id,
                    catalogVersion: availability.catalogVersion,
                    subtype: null,
                    answers: {},
                    startingSituation: { id: null, note: null },
                  });
                }}
              />
              <span>
                <strong>{storyLabels.directions[id].label[locale]}</strong>
                <br />
                {storyLabels.directions[id].summary[locale]}
              </span>
            </label>
          ))}
      </div>
    );
  if (!direction || !enabled) return null;
  const choices = Object.entries(direction.situations).filter(
    ([, value]) =>
      value.selectable &&
      (value.subtypes as readonly string[]).includes(story.subtype ?? ''),
  );
  if (step === -1)
    return (
      <div className="story-start-options story-catalog-grid">
        {[...choices.map(([id]) => id), 'custom'].map((id) => (
          <label className="story-start-option" key={id}>
            <input
              type="radio"
              name="story-situation"
              checked={story.startingSituation.id === id}
              onChange={() =>
                change({
                  startingSituation: { id, note: story.startingSituation.note },
                })
              }
            />
            <span>
              <strong>
                {id === 'custom'
                  ? hu
                    ? 'Saját helyzet'
                    : 'My own situation'
                  : Object.entries(storyLabels.situations).find(
                      ([key]) => key === id,
                    )?.[1].label[locale]}
              </strong>
              {id !== 'custom' && (
                <span className="story-option-description">
                  {
                    Object.entries(storyLabels.situations).find(
                      ([key]) => key === id,
                    )?.[1].description[locale]
                  }
                </span>
              )}
            </span>
          </label>
        ))}
        <label>
          {hu ? 'Kiegészítés' : 'Describe or add to the situation'}
          <textarea
            maxLength={400}
            value={story.startingSituation.note ?? ''}
            onChange={(event) =>
              change({
                startingSituation: {
                  ...story.startingSituation,
                  note: event.target.value || null,
                },
              })
            }
          />
        </label>
      </div>
    );

  const visible = fields[enabled.id].filter(
    ({ only }) => !only || only.includes(story.subtype ?? ''),
  );
  return (
    <div className="story-start-options">
      {enabled.id === 'politics' && (
        <p>
          {hu
            ? 'Ez a privát történet kitalált szereplőkről és intézményekről szól.'
            : 'This private story is about fictional people and institutions.'}
        </p>
      )}
      <StoryRadioCards
        label={hu ? 'Altípus' : 'Story focus'}
        value={story.subtype}
        options={Object.keys(direction.subtypes).map(
          (key) =>
            [
              key,
              Object.entries(storyLabels.subtypes).find(
                ([id]) => id === enabled.id + '/' + key,
              )?.[1][locale],
            ] as const,
        )}
        onChange={(subtype) => {
          const active = fields[enabled.id].filter(
            ({ only }) => !only || only.includes(subtype ?? ''),
          );
          const answers = Object.fromEntries(
            Object.entries(story.answers).filter(([key]) =>
              active.some((field) => field.key === key),
            ),
          );
          const current = Object.entries(direction.situations).find(
            ([id]) => id === story.startingSituation.id,
          )?.[1];
          change({
            subtype,
            answers,
            startingSituation:
              story.startingSituation.id === 'custom' ||
              (subtype &&
                (current?.subtypes as readonly string[] | undefined)?.includes(
                  subtype,
                ))
                ? story.startingSituation
                : { id: null, note: null },
          });
        }}
      />
      {story.subtype &&
        visible.map((field) => (
          <DirectionAnswer
            key={field.key}
            field={field}
            story={story}
            locale={locale}
            onChange={(value) =>
              change({ answers: { ...story.answers, [field.key]: value } })
            }
          />
        ))}
    </div>
  );
}

function DirectionAnswer({
  field,
  story,
  locale,
  onChange,
}: {
  field: Field;
  story: Draft;
  locale: Locale;
  onChange: (value: Draft['answers'][string]) => void;
}) {
  const hu = locale === 'hu';
  const raw = story.answers[field.key];
  const preference =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined;
  const value = field.preference ? preference?.value : raw;
  const label = field.label[hu ? 1 : 0];
  const inputLabel = field.preference ? (hu ? 'Érték' : 'Value') : label;
  const write = (value: string | string[] | null) => {
    if (field.preference)
      onChange(
        value === null ? { mode: 'specified' } : { mode: 'specified', value },
      );
    else onChange(value);
  };
  return (
    <fieldset>
      <legend>{label}</legend>
      {field.key === 'attraction' && (
        <small>{fictionalAnswerNotice[locale]}</small>
      )}
      {field.preference && (
        <StoryRadioCards
          label={hu ? 'Válasz módja' : 'Answer preference'}
          value={preference?.mode ?? 'unspecified'}
          options={
            [
              ['unspecified', hu ? 'Nem adom meg' : 'Not given'],
              [
                'engine_decides',
                hu ? 'A történetre bízom' : 'Let the story decide',
              ],
              ['specified', hu ? 'Megadom' : 'Specify'],
            ] as const
          }
          onChange={(mode) => onChange({ mode })}
        />
      )}
      {(!field.preference || preference?.mode === 'specified') &&
        (field.textList ? (
          [0, 1, 2]
            .slice(
              0,
              Math.min(3, (Array.isArray(value) ? value.length : 0) + 1),
            )
            .map((index) => (
              <input
                key={index}
                aria-label={label + ' ' + (index + 1)}
                maxLength={160}
                value={Array.isArray(value) ? (value[index] ?? '') : ''}
                onChange={(event) => {
                  const items = Array.isArray(value) ? [...value] : [];
                  items[index] = event.target.value;
                  write(items.filter((item) => item.trim()));
                }}
              />
            ))
        ) : field.choices && field.multiple ? (
          field.choices.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            const checked = selected.includes(option);
            return (
              <label className="story-start-option" key={option}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    field.key === 'themes' && selected.length >= 2 && !checked
                  }
                  onChange={() =>
                    write(
                      checked
                        ? selected.filter((entry) => entry !== option)
                        : [...selected, option],
                    )
                  }
                />
                <span>{directionAnswerLabel(field.key, option, locale)}</span>
              </label>
            );
          })
        ) : field.choices ? (
          <StoryRadioCards
            label={inputLabel}
            value={typeof value === 'string' ? value : ''}
            options={[
              ...(!field.preference && field.key !== 'field'
                ? [['', hu ? 'Nem adom meg' : 'Not given'] as const]
                : []),
              ...field.choices.map(
                (option) =>
                  [
                    option,
                    directionAnswerLabel(field.key, option, locale),
                  ] as const,
              ),
            ]}
            onChange={(option) => write(option || null)}
          />
        ) : (
          <input
            aria-label={inputLabel}
            maxLength={160}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => write(event.target.value || null)}
          />
        ))}
    </fieldset>
  );
}
