import { z } from 'zod';
import {
  lifeStoryCreateRequestV2Schema,
  lifeStoryDraftRequestV2Schema,
} from './life-v2';

const quickCreativeFields = new Map([
  ['cre.returning', 'music'],
  ['cre.private_work', 'writing'],
  ['cre.first_showing', 'visual_art'],
  ['cre.shared_studio', 'visual_art'],
  ['cre.commission_vs_own', 'architecture_design'],
  ['cre.day_job', 'film_photo'],
  ['cre.big_project', 'writing'],
]);
type DraftStory = z.infer<typeof lifeStoryDraftRequestV2Schema>['story'];
export function quickStoryAnswers(
  direction: DraftStory['direction'],
  subtype: DraftStory['subtype'],
  situation: string,
): DraftStory['answers'] {
  const delegate = { mode: 'engine_decides' } as const;
  if (direction === 'creative')
    return {
      field: quickCreativeFields.get(situation) ?? 'writing',
      experience: delegate,
    };
  if (direction === 'travel') return { companions: delegate };
  if (direction === 'career' && subtype === 'founder')
    return { venture: delegate, buildingWith: delegate };
  if (direction === 'relationships' && subtype === 'romantic')
    return { attraction: delegate, relationshipStatus: delegate };
  return {};
}

export function storySetupFromDraft(
  draft: z.infer<typeof lifeStoryDraftRequestV2Schema>,
) {
  const { story, ...common } = draft;
  if (!story.goalChoice) return null;
  const unspecified = { mode: 'unspecified' } as const;
  const defaults = {
    relationships: {
      attraction: unspecified,
      relationshipStatus: unspecified,
      themes: [],
    },
    career: {
      field: null,
      drive: null,
      venture: unspecified,
      buildingWith: unspecified,
      funding: [],
      jobAnchors: [],
    },
    creative: { fieldLabel: null, experience: unspecified, company: null },
    travel: {
      workKind: null,
      destination: null,
      companions: unspecified,
      homeBase: null,
    },
    politics: { role: null, stakes: null, style: null, inventedNames: [] },
  };
  if (!story.direction || !Object.hasOwn(defaults, story.direction))
    return null;
  const emphasis = defaults[story.direction as keyof typeof defaults];
  const quickStart = story.quickStart === true;
  const premiseLed = quickStart && story.startingSituation.id === 'custom';
  const answers = quickStart
    ? quickStoryAnswers(
        story.direction,
        story.subtype,
        story.startingSituation.id ?? '',
      )
    : story.answers;
  const result = lifeStoryCreateRequestV2Schema.safeParse({
    ...common,
    ...(quickStart && {
      identity: { mode: 'alternate', label: null, ageBand: '25_34' },
      location: { country: null, region: null, housing: null },
      employment: { status: null, employerLabel: null, workDomain: null },
      finance: { currency: null, monthlyIncome: null, liquidFunds: null },
      skills: [],
      relationships: [],
      resources: { energy: null, availableHoursPerWeek: null },
      stayInCountry: false,
    }),
    goal: quickStart || story.goalChoice === 'none' ? null : common.goal,
    story: {
      contractVersion: story.contractVersion,
      catalogVersion: story.catalogVersion,
      emphases: [
        {
          ...emphasis,
          ...answers,
          direction: story.direction,
          subtype: story.subtype,
        },
      ],
      startingSituation:
        quickStart && !premiseLed
          ? { ...story.startingSituation, note: null }
          : story.startingSituation,
      ...(premiseLed && { premiseLed: true }),
      protagonistAddress: quickStart
        ? unspecified
        : (story.protagonistAddress ?? unspecified),
      boundaries: story.boundaries,
      title: quickStart ? null : story.title,
    },
  });
  return result.success ? result.data : null;
}
