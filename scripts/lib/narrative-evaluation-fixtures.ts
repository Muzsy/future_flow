import { simulatePeriodV2 } from '@future-flow/core';
import {
  narrativeInput,
  narrativeProfiles,
  narrativeFixtureId,
} from '../../tests/narrative-fixtures';
import { narrativePlanFixture } from '../../tests/narrative-plan-fixtures';

// Authored synthetic scene material, identical for both writers. The original
// contract-only fixture intentionally left the actual observation unspecified;
// it cannot measure scene craft without asking the writer to invent canon.
const material: Record<
  (typeof narrativeProfiles)[number]['id'],
  { action: string; resistance: string; response: string; result: string }
> = {
  'bounded-career': {
    action:
      'During a weekday-only trial inside current duties, the protagonist traces a three-step administrative handoff in a temporary working list.',
    resistance:
      'The second step has no named owner, so the third step cannot start even though the order of work is clear.',
    response:
      'The protagonist flags the missing owner rather than taking over the underlying task, and closes the trial at the agreed boundary.',
    result:
      'The list exposes one actionable ownership gap but does not resolve the handoff. A smaller follow-up could focus on that gap; a different method would leave it open.',
  },
  'career-transition': {
    action:
      'The protagonist completes a reversible practice exercise for a different field alongside current administrative employment.',
    resistance:
      'The first attempt reaches an unfamiliar step and cannot produce the required final check.',
    response:
      'The protagonist retries that step with the exercise guidance and identifies the missing check without claiming professional competence.',
    result:
      'One specific gap is visible; job suitability and any employment offer remain unknown. The next experiment can isolate that step or test another method.',
  },
  'creative-portfolio': {
    action:
      'The protagonist makes three rough illustration thumbnails as a temporary composition test for the portfolio.',
    resistance:
      'At a smaller viewing size, the middle thumbnail loses its focal point and the intended sequence becomes unclear.',
    response:
      'The protagonist redraws its outline and compares the three again instead of polishing all of them.',
    result:
      'The revised outline clarifies one transition but is not a finished portfolio or outside approval. The next trial can refine that transition or try another composition method.',
  },
  'learning-exam': {
    action:
      'The protagonist attempts a five-task practice exercise within the existing weekly study boundary.',
    resistance:
      'The final check exposes a skipped intermediate step in one answer.',
    response:
      'The protagonist returns to that answer, performs the missing step and compares it with the earlier attempt.',
    result:
      'The error can be explained, but one corrected practice answer proves neither assessment readiness nor a credential. The next trial can isolate the step or change the practice method.',
  },
  moving: {
    action:
      'The protagonist tests a possible travel route while exploring a housing change, without making a payment or agreement.',
    resistance:
      'A missed connection leaves a longer final walk than the planned route allowed.',
    response:
      'The protagonist completes the route test and records the transfer as the part needing another look.',
    result:
      'One practical route weakness is established, not a housing decision or an affordability conclusion. The next bounded test can examine that transfer or use another route method.',
  },
  'community-project': {
    action:
      'The protagonist runs a solo timed rehearsal of a short neighbourhood creative activity before requesting participation.',
    resistance:
      'The setup consumes enough of the rehearsal that the final activity cannot be completed within the intended session.',
    response:
      'The protagonist removes one setup step and repeats the transition to the final activity.',
    result:
      'The transition becomes shorter, but participation and participant feedback remain unestablished. The next trial can refine that transition or explore another activity format.',
  },
  'fictional-friend': {
    action:
      'The protagonist drafts a low-pressure invitation to the supplied fictional companion using two times that fit the protagonist’s own recorded availability.',
    resistance:
      'The first draft offers a broad ongoing commitment instead of one manageable meeting.',
    response:
      'The protagonist replaces it with a single invitation and sends it without assuming a reply or attendance.',
    result:
      'A concrete invitation now awaits an answer; the companion’s availability, consent and private circumstances remain unknown. A smaller follow-up must preserve that uncertainty, as must a different invitation method.',
  },
  'limited-energy': {
    action:
      'The protagonist tries a modest paper prototype in a deliberately short session within the existing time and energy boundaries.',
    resistance: 'The second join does not hold, leaving one side unfinished.',
    response:
      'The protagonist tests the first working edge once more and stops at the planned session boundary rather than extending the session.',
    result:
      'One edge works and one join remains unresolved; no purchase, financial fact or large completed outcome is implied. The next small trial can isolate that join or try another construction method.',
  },
};
export function fixedNarrativeFixture(fixtureId: string) {
  const profile = narrativeProfiles.find((p) => p.id === fixtureId);
  if (!profile) throw new Error('Unknown synthetic fixture.');
  const input = narrativeInput(profile),
    f = narrativePlanFixture(input),
    detail = material[profile.id];
  f.result.plan.premise = `${profile.goal} An initial attempt meets a specific obstacle and leaves a narrower next choice.`;
  const observation = `${detail.action} ${detail.resistance} ${detail.response} ${detail.result}`;
  f.candidate.events[0]!.summary = observation;
  const progress = f.candidate.events[0]!.changes.find(
    (c) => c.type === 'goal_progress_set',
  );
  if (progress?.type === 'goal_progress_set')
    progress.value.note = detail.result;
  f.result.plan.scenes.forEach((scene, index) => {
    scene.sceneId = narrativeFixtureId(`fixed:${fixtureId}:scene:${index}`);
  });
  Object.assign(f.result.plan.scenes[0]!, {
    visibleAction: detail.action,
    obstacle: detail.resistance,
    shift: detail.response,
  });
  f.result.plan.memoryDelta.periodSummary = `${detail.response} ${detail.result}`;
  f.canon = simulatePeriodV2(
    f.candidate,
    input.state,
    input.input.constraints,
    {
      lifeId: input.input.lifeId,
      branchId: input.input.branchId,
      revision: input.revision,
      acceptedDecisionIds: input.acceptedDecisionIds,
    },
  );
  return f;
}
