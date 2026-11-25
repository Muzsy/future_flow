'use client';

import { useId, useState } from 'react';
import {
  quickStoryAnswers,
  storyCatalogs,
  storyLabels,
  type Locale,
  type StoryDirectionId,
} from '@future-flow/contracts';
import {
  generatedPoliticalStartAvailable,
  isUsedPoliticalIssue,
  versionForDirection,
  type StoryAvailability,
  type StoryDraft,
} from './story-direction-fields';

type Draft = StoryDraft['story'];
const directions = storyLabels.directions;
const subtypes = new Map(Object.entries(storyLabels.subtypes));
const situations = new Map(Object.entries(storyLabels.situations));
const featured = new Set([
  'friendship:rel.new_circle',
  'employee:car.first_real_role',
  'sharing:cre.first_showing',
  'journey:trv.long_route',
  'local:pol.transit_renewal',
]);
const creativeLabels = new Map([
  ['music', { hu: 'Zene', en: 'Music' }],
  ['writing', { hu: 'Írás', en: 'Writing' }],
  ['visual_art', { hu: 'Képzőművészet', en: 'Visual art' }],
  [
    'architecture_design',
    { hu: 'Építészet és design', en: 'Architecture and design' },
  ],
  ['film_photo', { hu: 'Film és fotó', en: 'Film and photography' }],
]);
const customSubtypes: Record<StoryDirectionId, string> = {
  relationships: 'mixed',
  career: 'employee',
  creative: 'personal',
  travel: 'journey',
  politics: 'local',
};

export function quickStoryGroups(availability: StoryAvailability) {
  return availability.directions
    .filter(({ id, enabled }) => enabled && id in directions)
    .flatMap(({ id: direction }) => {
      const catalogVersion = versionForDirection(direction, availability);
      const catalog = storyCatalogs[catalogVersion].directions[direction];
      return Object.keys(catalog.subtypes).map((subtype) => {
        const focus = { direction, subtype, catalogVersion };
        const cards = Object.entries(catalog.situations)
          .filter(
            ([id, situation]) =>
              situation.selectable &&
              (situation.subtypes as readonly string[]).includes(subtype) &&
              !isUsedPoliticalIssue(direction, id, situation, availability),
          )
          .map(([id]) => id);
        if (
          direction === 'politics' &&
          generatedPoliticalStartAvailable(focus, availability)
        )
          cards.push('generated');
        return { ...focus, key: direction + ':' + subtype, cards };
      });
    });
}

export function selectQuickStory(
  previous: Draft,
  focus: Pick<Draft, 'direction' | 'subtype' | 'catalogVersion'>,
  id: string,
): Draft {
  if (
    previous.direction === focus.direction &&
    previous.subtype === focus.subtype &&
    previous.catalogVersion === focus.catalogVersion &&
    previous.startingSituation.id === id
  )
    return previous;
  return {
    ...previous,
    direction: focus.direction,
    subtype: focus.subtype,
    catalogVersion: focus.catalogVersion,
    answers: quickStoryAnswers(focus.direction, focus.subtype, id),
    ownSituationNote:
      previous.startingSituation.id === 'custom'
        ? previous.startingSituation.note
        : previous.ownSituationNote,
    startingSituation: {
      id,
      note:
        id === 'custom'
          ? previous.startingSituation.id === 'custom'
            ? previous.startingSituation.note
            : (previous.ownSituationNote ?? null)
          : null,
    },
  };
}

export function selectOwnSituation(
  story: Draft,
  groups: ReturnType<typeof quickStoryGroups>,
  direction: string | null,
): Draft {
  const group =
    groups.find(
      (candidate) =>
        candidate.direction === direction &&
        candidate.subtype === story.subtype,
    ) ??
    groups.find(
      (candidate) =>
        candidate.direction === direction &&
        candidate.subtype === customSubtypes[candidate.direction],
    );
  return selectQuickStory(
    story,
    group ?? {
      catalogVersion: story.catalogVersion,
      direction: null,
      subtype: null,
    },
    'custom',
  );
}

export function QuickStoryStart({
  story,
  availability,
  locale,
  context,
  hasSavedDetails,
  busy,
  canStart,
  onStory,
  onContext,
  onStart,
  onDetailed,
}: {
  story: Draft;
  availability: StoryAvailability;
  locale: Locale;
  context: string | null;
  hasSavedDetails: boolean;
  busy: boolean;
  canStart: boolean;
  onStory: (story: Draft) => void;
  onContext: (context: string | null) => void;
  onStart: () => void;
  onDetailed: () => void;
}) {
  const [filter, setFilter] = useState('featured');
  const [expandedCatalog, setExpandedCatalog] = useState(false);
  const [browsingPresets, setBrowsingPresets] = useState(false);
  const [boundaries, setBoundaries] = useState(story.boundaries.join('\n'));
  const [showDetails, setShowDetails] = useState(
    !!context || story.boundaries.length > 0,
  );
  const boundaryLines = boundaries
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const invalidBoundaries =
    boundaryLines.length > 10 ||
    boundaryLines.some((line) => line.length > 160);
  const radio = useId();
  const hu = locale === 'hu';
  const groups = quickStoryGroups(availability);
  const custom = story.startingSituation.id === 'custom';
  const editingOwnSituation = custom && !browsingPresets;
  const selectedGroup = groups.find(
    ({ direction, subtype }) =>
      direction === story.direction && subtype === story.subtype,
  );
  const selectedId = story.startingSituation.id;
  const displayed = groups.filter(
    ({ direction }) => filter === 'featured' || direction === filter,
  );
  const allCards = displayed.flatMap((group) =>
    group.cards.map((id, index) => ({ group, id, index })),
  );
  const featuredCards = availability.directions.flatMap(({ id: direction }) => {
    const candidates = allCards.filter(
      ({ group }) => group.direction === direction,
    );
    const recommended =
      candidates.find(({ group, id }) =>
        featured.has(group.subtype + ':' + id),
      ) ?? candidates[0];
    return recommended ? [recommended] : [];
  });
  const isSelected = ({ group, id }: (typeof allCards)[number]) =>
    group.key === selectedGroup?.key && id === selectedId;
  const visibleCards =
    filter === 'featured'
      ? allCards.filter(
          (card) => featuredCards.includes(card) || isSelected(card),
        )
      : allCards.filter(
          (card) => expandedCatalog || card.index === 0 || isSelected(card),
        );
  const selectedVisible = visibleCards.some(isSelected);
  const selectedLabel =
    selectedVisible && selectedGroup && selectedId
      ? [
          directions[selectedGroup.direction].label[locale],
          situations.get(selectedId)?.label[locale],
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  const showMore =
    filter !== 'featured' && displayed.some(({ cards }) => cards.length > 1);
  const reason = invalidBoundaries
    ? hu
      ? 'Legfeljebb 10 megkötés adható meg, egyenként legfeljebb 160 karakterrel.'
      : 'Use at most 10 boundaries of 160 characters each.'
    : editingOwnSituation
      ? !selectedGroup
        ? hu
          ? 'Válassz témát a saját helyzetedhez.'
          : 'Choose a theme for your situation.'
        : (story.startingSituation.note?.trim().length ?? 0) < 10
          ? hu
            ? 'Írd le a helyzetet legalább 10 karakterben.'
            : 'Describe the situation in at least 10 characters.'
          : null
      : !selectedVisible
        ? hu
          ? 'Válassz egy látható kezdőhelyzetet.'
          : 'Choose a starting situation from this list.'
        : null;
  return (
    <section className="panel story-start quick-story-start">
      <h1>
        {hu
          ? 'Melyik történetbe csöppennél?'
          : 'Which story would you step into?'}
      </h1>
      <label className="field quick-story-filter">
        <span>{hu ? 'Téma' : 'Theme'}</span>
        <select
          value={
            editingOwnSituation ? (selectedGroup?.direction ?? '') : filter
          }
          disabled={busy}
          onChange={(event) => {
            if (editingOwnSituation) {
              onStory(selectOwnSituation(story, groups, event.target.value));
            } else {
              setFilter(event.target.value);
              setExpandedCatalog(false);
            }
          }}
        >
          {editingOwnSituation ? (
            <option value="" disabled>
              {hu ? 'Válassz témát' : 'Choose a theme'}
            </option>
          ) : (
            <option value="featured">
              {hu ? 'Ajánlott történetek' : 'Featured stories'}
            </option>
          )}
          {availability.directions
            .filter(({ enabled, id }) => enabled && id in directions)
            .map(({ id }) => (
              <option key={id} value={id}>
                {directions[id].label[locale]}
              </option>
            ))}
        </select>
      </label>
      {!editingOwnSituation && (
        <>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              onStory(
                selectOwnSituation(
                  story,
                  groups,
                  filter === 'featured'
                    ? (selectedGroup?.direction ?? null)
                    : filter,
                ),
              );
              setBrowsingPresets(false);
            }}
          >
            {hu ? 'Saját helyzetet írok' : 'Write my own situation'}
          </button>
          <fieldset className="quick-story-options" disabled={busy}>
            <legend>{hu ? 'Kezdőhelyzet' : 'Starting situation'}</legend>
            <div className="story-start-options story-catalog-grid">
              {visibleCards.map(({ group, id }) => {
                const label = situations.get(id);
                const selected = isSelected({ group, id, index: 0 });
                const field = creativeLabels.get(
                  String(
                    quickStoryAnswers(group.direction, group.subtype, id).field,
                  ),
                );
                const focusLabel = subtypes.get(
                  group.direction + '/' + group.subtype,
                )?.[locale];
                const repeated =
                  allCards.filter((card) => card.id === id).length > 1;
                const cardLabel = radio + '-' + group.key + '-' + id;
                return (
                  <label
                    className="story-start-option"
                    key={group.key + ':' + id}
                  >
                    <input
                      type="radio"
                      name={radio}
                      checked={selected}
                      aria-labelledby={cardLabel}
                      aria-describedby={cardLabel + '-description'}
                      onChange={() =>
                        onStory(selectQuickStory(story, group, id))
                      }
                    />
                    <span>
                      <strong id={cardLabel}>
                        {label?.label[locale]}
                        {repeated && focusLabel ? ' · ' + focusLabel : ''}
                      </strong>
                      {((!repeated && focusLabel) || field) && (
                        <small className="quick-story-meta">
                          {[!repeated && focusLabel, field?.[locale]]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                      <span
                        id={cardLabel + '-description'}
                        className="story-option-description"
                      >
                        {label?.description[locale]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {showMore && (
            <button
              className="text-button"
              type="button"
              aria-expanded={expandedCatalog}
              onClick={() => setExpandedCatalog(!expandedCatalog)}
            >
              {expandedCatalog
                ? hu
                  ? 'Kevesebb kezdőhelyzet'
                  : 'Show fewer situations'
                : hu
                  ? 'Minden kezdőhelyzet ebben a témában'
                  : 'Show all situations in this theme'}
            </button>
          )}
        </>
      )}
      {editingOwnSituation && (
        <div className="story-start-form form-grid">
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setFilter(selectedGroup?.direction ?? 'featured');
              setExpandedCatalog(false);
              setBrowsingPresets(true);
            }}
          >
            {hu
              ? 'Vissza a kész kezdőhelyzetekhez'
              : 'Back to ready-made situations'}
          </button>
          <label className="field">
            <span>
              {hu
                ? 'Honnan induljon? (10–400 karakter)'
                : 'Where should it begin? (10–400 characters)'}
            </span>
            <textarea
              maxLength={400}
              value={story.startingSituation.note ?? ''}
              onChange={(event) =>
                onStory({
                  ...story,
                  startingSituation: {
                    id: 'custom',
                    note: event.target.value || null,
                  },
                })
              }
            />
          </label>
        </div>
      )}
      <details
        className="quick-story-details"
        open={showDetails}
        onToggle={(event) => setShowDetails(event.currentTarget.open)}
      >
        <summary>{hu ? 'Hozzátennél valamit?' : 'Anything to add?'}</summary>
        <label className="field">
          <span>
            {hu
              ? 'Mit vegyen figyelembe a történet?'
              : 'What should the story take into account?'}
          </span>
          <textarea
            maxLength={1000}
            value={context ?? ''}
            onChange={(event) => onContext(event.target.value || null)}
          />
        </label>
        <label className="field">
          <span>
            {hu
              ? 'Mit hagyjon ki a történet? (soronként egy)'
              : 'What should the story leave out? (one per line)'}
          </span>
          <textarea
            aria-invalid={invalidBoundaries}
            value={boundaries}
            onChange={(event) => {
              setBoundaries(event.target.value);
              const lines = event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
              if (
                lines.length <= 10 &&
                lines.every((line) => line.length <= 160)
              )
                onStory({ ...story, boundaries: lines });
            }}
          />
        </label>
      </details>
      <div className="quick-story-action">
        {hasSavedDetails && (
          <p className="subtle">
            {hu
              ? 'A gyors indító az itt látható beállításokat használja. Sikeres indításkor a mentett részletes piszkozat is törlődik.'
              : 'Quick start uses the details shown here. Starting the chapter also clears the saved detailed draft.'}
          </p>
        )}
        {selectedLabel && <p>{selectedLabel}</p>}
        {reason && (
          <p className="subtle" role="status">
            {reason}
          </p>
        )}
        <button
          className="primary"
          type="button"
          disabled={
            !canStart || busy || !!reason || (custom && browsingPresets)
          }
          onClick={onStart}
        >
          {busy
            ? hu
              ? 'Indítás…'
              : 'Starting…'
            : hu
              ? 'Első fejezet indítása'
              : 'Start the first chapter'}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onDetailed}
        >
          {hu ? 'Részletes indító' : 'Detailed setup'}
        </button>
      </div>
    </section>
  );
}
