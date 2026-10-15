import { addMonths, simulatePeriodV2 } from '@future-flow/core';
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
  { action: string; resistance: string; response: string }
> = {
  'bounded-career': {
    action:
      'During a weekday-only trial inside current duties, the protagonist traces a three-step administrative handoff in a temporary working list.',
    resistance:
      'The second step has no named owner, so the third step cannot start even though the order of work is clear.',
    response:
      'The protagonist flags the missing owner rather than taking over the underlying task, and closes the trial at the agreed boundary.',
  },
  'career-transition': {
    action:
      'The protagonist completes a reversible practice exercise for a different field alongside current administrative employment.',
    resistance:
      'The first attempt reaches an unfamiliar step and cannot produce the required final check.',
    response:
      'The protagonist retries that step with the exercise guidance and identifies the missing check without claiming professional competence.',
  },
  'creative-portfolio': {
    action:
      'The protagonist makes three rough illustration thumbnails as a temporary composition test for the portfolio.',
    resistance:
      'At a smaller viewing size, the middle thumbnail loses its focal point and the intended sequence becomes unclear.',
    response:
      'The protagonist redraws its outline and compares the three again instead of polishing all of them.',
  },
  'learning-exam': {
    action:
      'The protagonist attempts a five-task practice exercise within the existing weekly study boundary.',
    resistance:
      'The final check exposes a skipped intermediate step in one answer.',
    response:
      'The protagonist returns to that answer, performs the missing step and compares it with the earlier attempt.',
  },
  moving: {
    action:
      'The protagonist tests a possible travel route while exploring a housing change, without making a payment or agreement.',
    resistance:
      'A missed connection leaves a longer final walk than the planned route allowed.',
    response:
      'The protagonist completes the route test and records the transfer as the part needing another look.',
  },
  'community-project': {
    action:
      'The protagonist runs a solo timed rehearsal of a short neighbourhood creative activity before requesting participation.',
    resistance:
      'The setup consumes enough of the rehearsal that the final activity cannot be completed within the intended session.',
    response:
      'The protagonist removes one setup step and repeats the transition to the final activity.',
  },
  'fictional-friend': {
    action:
      'The protagonist drafts a low-pressure invitation to the supplied fictional companion using two times that fit the protagonist’s own recorded availability.',
    resistance:
      'The first draft offers a broad ongoing commitment instead of one manageable meeting.',
    response:
      'The protagonist replaces it with a single invitation and sends it without assuming a reply or attendance.',
  },
  'limited-energy': {
    action:
      'The protagonist tries a modest paper prototype in a deliberately short session within the existing time and energy boundaries.',
    resistance: 'The second join does not hold, leaving one side unfinished.',
    response:
      'The protagonist tests the first working edge once more and stops at the planned session boundary rather than extending the session.',
  },
};
// The second movement tests the first observation and produces a specific result.
// Neither writer has to invent the missing follow-up or an unnamed alternative.
const consequence: Record<
  keyof typeof material,
  {
    action: string;
    resistance: string;
    response: string;
    result: string;
    alternatives: [string, string];
    costs: [string, string];
    gains: [string, string];
  }
> = {
  'bounded-career': {
    action:
      'The protagonist checks the flagged three-step list by tracing one unfinished handoff through a temporary receipt checklist during existing weekday duties.',
    resistance:
      'The receipt checklist can show that a request arrived, but it cannot name who is responsible for the unassigned second step.',
    response:
      'The protagonist separates receipt from ownership on the working sheet, marks the owner field unresolved, and stops rather than treating a received request as accepted responsibility.',
    result:
      'The receipt check works, but cannot solve the authority gap. The next useful evidence requires either seeking a named owner for this real handoff or leaving it unresolved to practise dependency mapping on an explicitly simulated case.',
    alternatives: [
      'Seek confirmation of a named owner for this handoff within existing weekday duties; no approval or reply is established.',
      'Leave this real handoff unresolved and use a fictional three-task dependency board to practise sequencing within the same time boundary.',
    ],
    costs: [
      'Further attention stays with a problem the protagonist cannot authorize others to solve.',
      'The real handoff remains unresolved and the evidence will be simulated rather than workplace feedback.',
    ],
    gains: [
      'A reply could establish whether the ownership question can actually be resolved.',
      'A dependency board could test sequencing separately from the missing authority.',
    ],
  },
  'career-transition': {
    action:
      'The protagonist retries a second version of the practice exercise with the guidance closed.',
    resistance:
      'The unfamiliar step is now recognizable, but the final check still cannot be reproduced without looking back.',
    response:
      'The protagonist compares the two attempts and marks exactly where independent recall stops.',
    result:
      'Following a worked example is possible; independent performance is not yet demonstrated. The next choice concerns repairing that specific recall gap or examining whether the target field actually uses the task.',
    alternatives: [
      'Practise recalling the missing check on a fresh version without the worked example.',
      'Pause the exercise and compare publicly available descriptions of the target field with this task, without assuming a vacancy or an offer.',
    ],
    costs: [
      'More practice may improve an exercise without answering whether the field is suitable.',
      'The demonstrated practice gap remains open while attention moves to relevance.',
    ],
    gains: [
      'An independent attempt could distinguish recognition from usable recall.',
      'The comparison could establish whether this exercise is relevant enough to justify more practice.',
    ],
  },
  'creative-portfolio': {
    action:
      'The protagonist puts the corrected thumbnail beside the other two and makes a temporary three-image sequence.',
    resistance:
      'The repaired focal point is clear alone, but its heavier outline overwhelms the neighbouring images.',
    response:
      'The protagonist lightens the neighbouring outlines on a second rough sheet and compares both sequences at the same small scale.',
    result:
      'The second rough sequence reads more evenly but loses some of the middle image’s emphasis. Neither sheet is a finished portfolio piece or outside approval.',
    alternatives: [
      'Develop the more even three-image sequence, accepting the reduced emphasis in the middle.',
      'Keep the middle image’s emphasis and test a two-image sequence, setting aside one thumbnail rather than balancing all three.',
    ],
    costs: [
      'The strongest individual image loses some emphasis.',
      'One prepared thumbnail is excluded from this composition.',
    ],
    gains: [
      'The set could read as one controlled sequence.',
      'A shorter sequence could preserve the stronger focal point.',
    ],
  },
  'learning-exam': {
    action:
      'The protagonist attempts a fresh version of the missed practice task with the earlier correction covered.',
    resistance:
      'The missing intermediate step can now be performed, but checking it consumes enough time that the last task in the timed practice remains unfinished.',
    response:
      'The protagonist marks the accurate step and the unfinished task separately instead of calling the whole practice successful.',
    result:
      'Accuracy improved in this practice, while completion within the practice time remains unproven. No assessment result or credential is established.',
    alternatives: [
      'Practise the corrected step untimed to make its execution more reliable.',
      'Run a timed mixed set and test task order, accepting that some accuracy practice will be postponed.',
    ],
    costs: [
      'Untimed accuracy practice will not establish pace across a whole set.',
      'Timed coverage leaves less attention for the newly corrected step.',
    ],
    gains: [
      'The corrected step could become reliable without looking back.',
      'A mixed set could reveal whether ordering changes completion within the limit.',
    ],
  },
  moving: {
    action:
      'The protagonist tests the same route with an earlier departure and records the transfer and arrival.',
    resistance:
      'The connection is now made, but arrival is early enough to require a longer wait at the destination.',
    response:
      'The protagonist records the waiting time beside the shorter final walk, keeping both route costs visible.',
    result:
      'The earlier departure trades the missed connection for a longer wait. No housing agreement, payment or affordability conclusion follows.',
    alternatives: [
      'Retain the earlier departure as the route candidate and test whether the waiting time is tolerable.',
      'Set this route aside and compare a direct route with a longer walk, without choosing housing.',
    ],
    costs: [
      'The route demands an earlier start and a wait at the destination.',
      'The working connection is relinquished for an untested route with a longer walk.',
    ],
    gains: [
      'A connected route could remain available for the housing comparison.',
      'A direct route could avoid dependence on the transfer.',
    ],
  },
  'community-project': {
    action:
      'The protagonist runs the shortened solo rehearsal from setup through the final activity.',
    resistance:
      'The activity now fits, but removing the setup step leaves the materials hard to distinguish in the final transition.',
    response:
      'The protagonist lays out a temporary labelled version and compares its setup time with the simpler layout.',
    result:
      'The labelled layout restores clarity at a time cost; the simpler layout fits more easily but leaves ambiguity. No participant has attended or approved either.',
    alternatives: [
      'Keep the labels and shorten the activity itself before seeking participation.',
      'Keep the shorter setup and redesign the final transition as a simpler activity.',
    ],
    costs: [
      'Part of the planned creative activity would be cut.',
      'The final activity would change rather than merely run faster.',
    ],
    gains: [
      'Clear materials could support the remaining activity within the limit.',
      'A simpler transition could preserve more activity time.',
    ],
  },
  'fictional-friend': {
    action:
      'At the later checkpoint the protagonist reviews the single invitation and its two offered times; no reply has been received by that checkpoint.',
    resistance:
      'The first offered time has passed and the second is approaching, so leaving both open no longer describes the actual choice.',
    response:
      'The protagonist crosses the elapsed time off the personal planning note without treating silence as consent, refusal or knowledge of the companion’s circumstances.',
    result:
      'Only the later time remains possible in the protagonist’s own schedule. The companion’s availability and reasons remain unknown.',
    alternatives: [
      'Send one brief clarification that only the later offered time remains, without demanding a reply or assuming attendance.',
      'Let this invitation lapse and make an individual plan for that time, without interpreting the companion’s silence.',
    ],
    costs: [
      'Another message consumes attention and still may receive no reply.',
      'This particular shared opening is relinquished without learning the reason for silence.',
    ],
    gains: [
      'A clarification could leave one accurate, low-pressure invitation.',
      'An individual plan could release the time from waiting on an unconfirmed meeting.',
    ],
  },
  'limited-energy': {
    action:
      'In a later short session the protagonist folds a temporary paper brace for the failed second join and tests the side once.',
    resistance:
      'The brace holds the side, but blocks the opening the prototype was intended to keep clear.',
    response:
      'The protagonist removes the brace and sets the two versions side by side at the planned stopping time.',
    result:
      'Support and an unobstructed opening are now a specific design conflict. Neither version is a complete working prototype; no purchase or changed financial fact is established.',
    alternatives: [
      'Keep the brace and redesign the opening in another short paper-only session.',
      'Leave the opening clear and test a different fold for the join in another short paper-only session.',
    ],
    costs: [
      'The opening would need redesign rather than simple completion.',
      'The failed join must be revisited instead of using the working support.',
    ],
    gains: [
      'The supported side could become the basis for a revised opening.',
      'A different join could preserve the original opening.',
    ],
  },
};
export function fixedNarrativeFixture(fixtureId: string) {
  const profile = narrativeProfiles.find((p) => p.id === fixtureId);
  if (!profile) throw new Error('Unknown synthetic fixture.');
  const input = narrativeInput(profile),
    f = narrativePlanFixture(input),
    detail = material[profile.id],
    next = consequence[profile.id];
  const goalId = input.input.goals[0]!.id;
  const first = f.candidate.events[0]!,
    final = f.candidate.events[1]!;
  first.effectiveAt = addMonths(input.startDate, 2);
  first.summary = `${detail.action} ${detail.resistance} ${detail.response}`;
  first.changes = [
    {
      type: 'goal_progress_set',
      value: { goalId, status: 'active', note: first.summary },
    },
  ];
  const middle = {
    ...structuredClone(first),
    id: narrativeFixtureId(`fixed:${fixtureId}:consequence`),
    title: 'The consequence of the first attempt',
    effectiveAt: addMonths(input.startDate, 4),
    summary: `${next.action} ${next.resistance} ${next.response} ${next.result}`,
    changes: [
      {
        type: 'goal_progress_set' as const,
        value: { goalId, status: 'active' as const, note: next.result },
      },
    ],
  };
  final.summary = `${next.result} The protagonist compares the two possible next actions without choosing either: ${next.alternatives.join(' Alternatively, ')}`;
  final.decision!.prompt =
    'Which consequence of this attempt will you act on next?';
  final.decision!.options.forEach((option, index) => {
    option.label =
      index === 0
        ? 'Pursue the first concrete route'
        : 'Choose the alternative route';
    option.description = next.alternatives[index]!;
    option.changes = [
      {
        type: 'goal_progress_set',
        value: {
          goalId,
          status: 'active',
          note: `Selected next action, not a completed outcome: ${option.description}`,
        },
      },
    ];
  });
  f.candidate.events = [first, middle, final];
  f.result.plan.premise = `${profile.goal} An initial attempt produces a specific difficulty; testing it changes the next decision.`;
  f.result.plan.centralTension = `${next.costs[0]} ${next.costs[1]}`;
  const scene = f.result.plan.scenes[0]!;
  f.result.plan.scenes = [
    {
      ...scene,
      sceneId: narrativeFixtureId(`fixed:${fixtureId}:scene:0`),
      eventIds: [first.id],
      purpose: 'pressure',
      visibleAction: detail.action,
      obstacle: detail.resistance,
      shift: detail.response,
    },
    {
      ...scene,
      sceneId: narrativeFixtureId(`fixed:${fixtureId}:scene:1`),
      eventIds: [middle.id],
      purpose: 'turning_point',
      visibleAction: next.action,
      obstacle: next.resistance,
      shift: next.response,
    },
  ];
  f.result.plan.turningPointEventId = middle.id;
  f.result.plan.decisionStakes = final.decision!.options.map(
    (option, index) => ({
      optionId: option.id,
      eventIds: [middle.id, final.id],
      cost: next.costs[index]!,
      possibleGain: next.gains[index]!,
      uncertainty:
        'The proposed next action has not happened; its result remains unknown.',
    }),
  );
  f.result.plan.memoryDelta.periodSummary = next.result;
  f.result.plan.memoryDelta.salientEventIds = [first.id, middle.id];
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
