import { z } from 'zod';
import {
  lifeStoryCreateRequestV2Schema,
  lifeStoryDraftRequestV2Schema,
} from './life-v2';

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
  const result = lifeStoryCreateRequestV2Schema.safeParse({
    ...common,
    goal: story.goalChoice === 'none' ? null : common.goal,
    story: {
      contractVersion: story.contractVersion,
      catalogVersion: story.catalogVersion,
      emphases: [
        {
          ...emphasis,
          ...story.answers,
          direction: story.direction,
          subtype: story.subtype,
        },
      ],
      startingSituation: story.startingSituation,
      protagonistAddress: story.protagonistAddress ?? unspecified,
      boundaries: story.boundaries,
      title: story.title,
    },
  });
  return result.success ? result.data : null;
}
