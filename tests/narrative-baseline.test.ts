import { describe, expect, it } from 'vitest';
import {
  lifeSetupV2Schema,
  type LifePeriodInput,
} from '@future-flow/contracts';
import {
  addMonths,
  applyFactChangesV2,
  hash,
  simulatePeriodV2,
  validatePeriodChapterV2,
} from '@future-flow/core';
import type { LifeAiProvider } from '@future-flow/ai';
import type { LifeJob, LifeJobRepository } from '@future-flow/database';
import { processLifeJob } from '../apps/worker/src/life-processor';
import {
  narrativeChapter,
  narrativeFixtureId,
  narrativeInput,
  narrativePeriod,
  narrativeProfiles,
  narrativeReceipt,
  narrativeSetup,
} from './narrative-fixtures';

describe('offline narrative baseline', () => {
  it('provides eight distinct, stable fictional inputs with unknown finances', () => {
    expect(narrativeProfiles).toHaveLength(8);
    expect(
      new Set(narrativeProfiles.map((p) => hash(narrativeInput(p)))).size,
    ).toBe(8);
    for (const profile of narrativeProfiles) {
      expect(lifeSetupV2Schema.safeParse(narrativeSetup(profile)).success).toBe(
        true,
      );
      expect(narrativeInput(profile)).toEqual(narrativeInput(profile));
      expect(narrativeInput(profile).state.finance.monthlyIncome).toBeNull();
    }
  });

  it.each(narrativeProfiles)(
    '$id follows the real legacy worker for three periods without a provider request',
    async (profile) => {
      let input: LifePeriodInput = narrativeInput(profile);
      const calls: string[] = [];
      const ai: LifeAiProvider = {
        period: async (request) => {
          calls.push('life_period');
          return {
            output: narrativePeriod(request),
            receipt: narrativeReceipt('life_period', hash(request)),
          };
        },
        periodChapter: async (story) => {
          calls.push('life_chapter');
          return {
            output: narrativeChapter(story),
            receipt: narrativeReceipt('life_chapter', hash(story)),
          };
        },
        checkPeriodChapter: async (story, chapter) => {
          calls.push('life_fidelity');
          validatePeriodChapterV2(chapter, story.events);
          return {
            output: { valid: true, issues: [] },
            receipt: narrativeReceipt(
              'life_fidelity',
              hash({ story, chapter }),
            ),
          };
        },
      };
      for (let index = 0; index < 3; index++) {
        const job: LifeJob = {
          id: narrativeFixtureId(`${profile.id}:job:${index}`),
          user_id: narrativeFixtureId(`${profile.id}:owner`),
          life_id: input.input.lifeId,
          branch_id: input.input.branchId,
          base_revision: input.revision,
          payload: input,
          checkpoints: {},
          lease_token: narrativeFixtureId(`${profile.id}:lease:${index}`),
          attempt: 1,
        };
        let committed = false;
        const scope = {
          lifeId: job.life_id,
          branchId: job.branch_id,
          revision: input.revision,
          acceptedDecisionIds: input.acceptedDecisionIds,
        };
        const jobs = {
          verifySharedPrivacy: async () => {},
          checkpoint: async (
            _job: LifeJob,
            _stage: string,
            patch: Record<string, unknown>,
          ) => {
            Object.assign(job.checkpoints, patch);
          },
          complete: async (
            _job: LifeJob,
            candidate: ReturnType<typeof narrativePeriod>,
            chapter: ReturnType<typeof narrativeChapter>,
          ) => {
            const canon = simulatePeriodV2(
              candidate,
              input.state,
              input.input.constraints,
              scope,
            );
            validatePeriodChapterV2(chapter, canon.events);
            const decision = candidate.events.at(-1)!.decision!;
            const option = decision.options[0]!;
            const state = applyFactChangesV2(
              canon.endState,
              option.changes,
              candidate.endDate,
              option.preconditions,
              input.input.constraints,
              {
                ...scope,
                acceptedDecisionIds: [
                  ...scope.acceptedDecisionIds,
                  decision.id,
                ],
              },
            );
            input = {
              ...input,
              state: state.state,
              revision: input.revision + 2,
              periodId: narrativeFixtureId(`${profile.id}:period:${index + 1}`),
              startDate: candidate.endDate,
              endDate: addMonths(candidate.endDate, 6),
              acceptedDecisionIds: [...input.acceptedDecisionIds, decision.id],
              memory: {
                recentEvents: canon.events,
                choices: [
                  {
                    decision_id: decision.id,
                    payload: { optionId: option.id },
                  },
                ],
              },
            };
            committed = true;
          },
        } as unknown as LifeJobRepository;
        await processLifeJob(job, jobs, ai);
        expect(committed).toBe(true);
        expect(job.checkpoints.fidelityPassed).toBe(true);
      }
      expect(calls).toEqual(
        Array.from({ length: 3 }, () => [
          'life_period',
          'life_chapter',
          'life_fidelity',
        ]).flat(),
      );
      expect(input.revision).toBe(6);
      expect(input.state.effectiveAt).toBe('2027-07-15');
    },
  );
});
