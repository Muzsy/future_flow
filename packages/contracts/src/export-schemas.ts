import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  profileSchema,
  stateSchema,
  simulationOutputSchema,
  chapterOutputSchema,
  fidelitySchema,
  CONTRACT_VERSION,
  LIFE_CONTRACT_VERSION,
  lifeInputV2Schema,
  lifeStateV2Schema,
  periodCandidateV2Schema,
  constraintV2Schema,
  lifeSetupV2Schema,
  lifeDraftV2Schema,
  lifeCreateRequestV2Schema,
  lifeDraftRequestV2Schema,
  periodChapterV2Schema,
  PUBLIC_DRAFT_VERSION,
  publicSnapshotDraftSchema,
  publicPreviewCopySchema,
  betaFeedbackSchema,
  lifeContinueRequestV2Schema,
  SHARED_CONTEXT_CONTRACT_VERSION,
  socialProfileSchema,
  interactionProfileSchema,
  sharedPolicySchema,
  sharedStateSchema,
  sharedEventCandidateSchema,
  sharedCreateRequestSchema,
  sharedInviteRequestSchema,
  sharedAcceptRequestSchema,
  sharedInvitePreviewRequestSchema,
  sharedRevisionRequestSchema,
  sharedMemoryEventSchema,
  sharedDecisionRulesSchema,
  sharedDecisionEnvelopeSchema,
  sharedIntentRequestSchema,
  sharedIntentSchema,
  sharedResolutionResultSchema,
  sharedMemoryImpactSchema,
  sharedAiInputSchema,
  sharedAiCandidateSchema,
} from './index';

const directory = resolve(__dirname, '../../../docs/contracts');
mkdirSync(directory, { recursive: true });
for (const [name, schema] of Object.entries({
  profile: profileSchema,
  lifeState: stateSchema,
  simulationOutput: simulationOutputSchema,
  chapterOutput: chapterOutputSchema,
  fidelity: fidelitySchema,
})) {
  writeFileSync(
    resolve(directory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:future-flow:${name}:${CONTRACT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const publicDirectory = resolve(directory, 'public');
mkdirSync(publicDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  snapshotDraft: publicSnapshotDraftSchema,
  previewCopy: publicPreviewCopySchema,
})) {
  writeFileSync(
    resolve(publicDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public:${name}:${PUBLIC_DRAFT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const v2Directory = resolve(directory, 'v2');
mkdirSync(v2Directory, { recursive: true });
for (const [name, schema] of Object.entries({
  lifeInput: lifeInputV2Schema,
  lifeState: lifeStateV2Schema,
  periodCandidate: periodCandidateV2Schema,
  constraint: constraintV2Schema,
  lifeSetup: lifeSetupV2Schema,
  lifeDraft: lifeDraftV2Schema,
  lifeCreateRequest: lifeCreateRequestV2Schema,
  lifeDraftRequest: lifeDraftRequestV2Schema,
  periodChapter: periodChapterV2Schema,
  betaFeedback: betaFeedbackSchema,
  lifeContinueRequest: lifeContinueRequestV2Schema,
})) {
  writeFileSync(
    resolve(v2Directory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:${name}:${LIFE_CONTRACT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const sharedDirectory = resolve(directory, 'shared');
mkdirSync(sharedDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  socialProfile: socialProfileSchema,
  interactionProfile: interactionProfileSchema,
  policy: sharedPolicySchema,
  state: sharedStateSchema,
  eventCandidate: sharedEventCandidateSchema,
  createRequest: sharedCreateRequestSchema,
  inviteRequest: sharedInviteRequestSchema,
  acceptRequest: sharedAcceptRequestSchema,
  invitePreviewRequest: sharedInvitePreviewRequestSchema,
  revisionRequest: sharedRevisionRequestSchema,
  memoryEvent: sharedMemoryEventSchema,
  decisionRules: sharedDecisionRulesSchema,
  decisionEnvelope: sharedDecisionEnvelopeSchema,
  intentRequest: sharedIntentRequestSchema,
  intent: sharedIntentSchema,
  resolutionResult: sharedResolutionResultSchema,
  memoryImpact: sharedMemoryImpactSchema,
  aiInput: sharedAiInputSchema,
  aiCandidate: sharedAiCandidateSchema,
})) {
  writeFileSync(
    resolve(sharedDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:shared:${name}:${SHARED_CONTEXT_CONTRACT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
