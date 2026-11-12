'use client';

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
        (typeof answer.value !== 'string' ||
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
  return (
    <label>
      {locale === 'hu'
        ? 'Megszólítás a történetben'
        : 'Form of address in the story'}
      <select
        value={
          value?.mode === 'specified'
            ? value.value
            : (value?.mode ?? 'unspecified')
        }
        onChange={(event) => {
          const selected = event.target.value;
          const address = addressOptions.find((option) => option === selected);
          onChange(
            address
              ? { mode: 'specified', value: address }
              : selected === 'engine_decides'
                ? { mode: 'engine_decides' }
                : unspecified,
          );
        }}
      >
        <option value="unspecified">
          {locale === 'hu' ? 'Nem adom meg' : 'Not given'}
        </option>
        <option value="engine_decides">
          {locale === 'hu' ? 'A történetre bízom' : 'Let the story decide'}
        </option>
        {addressOptions.map((value) => (
          <option value={value} key={value}>
            {addressLabels[value]}
          </option>
        ))}
      </select>
    </label>
  );
}

type Field = {
  key: string;
  label: [string, string];
  choices?: readonly string[];
  preference?: boolean;
  multiple?: boolean;
  only?: readonly string[];
};
const fields: Record<StoryDirectionId, Field[]> = {
  relationships: [
    {
      key: 'attraction',
      label: [
        'Who may the main character be drawn to?',
        'Kihez vonzódhat a főszereplő?',
      ],
      choices: ['women', 'men', 'nonbinary_people'],
      preference: true,
      multiple: true,
      only: ['romantic', 'mixed'],
    },
    {
      key: 'relationshipStatus',
      label: [
        'Relationship status at the start',
        'Kapcsolati helyzet az elején',
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
  ],
};

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
      <div className="story-start-options">
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
      <div className="story-start-options">
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
      <label>
        {hu ? 'Altípus' : 'Story focus'}
        <select
          value={story.subtype ?? ''}
          onChange={(event) => {
            const subtype = event.target.value || null;
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
                  (
                    current?.subtypes as readonly string[] | undefined
                  )?.includes(subtype))
                  ? story.startingSituation
                  : { id: null, note: null },
            });
          }}
        >
          <option value="">{hu ? 'Válassz altípust' : 'Choose a focus'}</option>
          {Object.keys(direction.subtypes).map((key) => (
            <option key={key} value={key}>
              {
                Object.entries(storyLabels.subtypes).find(
                  ([id]) => id === enabled.id + '/' + key,
                )?.[1][locale]
              }
            </option>
          ))}
        </select>
      </label>
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
      {field.preference && (
        <label>
          {hu ? 'Válasz módja' : 'Answer preference'}
          <select
            value={preference?.mode ?? 'unspecified'}
            onChange={(event) => {
              const mode = event.target.value as
                'unspecified' | 'engine_decides' | 'specified';
              onChange({ mode });
            }}
          >
            <option value="unspecified">
              {hu ? 'Nem adom meg' : 'Not given'}
            </option>
            <option value="engine_decides">
              {hu ? 'A történetre bízom' : 'Let the story decide'}
            </option>
            <option value="specified">{hu ? 'Megadom' : 'Specify'}</option>
          </select>
        </label>
      )}
      {(!field.preference || preference?.mode === 'specified') &&
        (field.choices && field.multiple ? (
          field.choices.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            const checked = selected.includes(option);
            return (
              <label className="checkbox" key={option}>
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
                {option.replaceAll('_', ' ')}
              </label>
            );
          })
        ) : field.choices ? (
          <select
            aria-label={inputLabel}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => write(event.target.value || null)}
          >
            <option value="">{hu ? 'Válassz' : 'Choose'}</option>
            {field.choices.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
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
