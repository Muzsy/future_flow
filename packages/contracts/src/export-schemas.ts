import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  PUBLIC_SCENARIO_VERSION,
  publicScenarioPrepareRequestSchema,
  publicScenarioPreviewSchema,
  publicScenarioConfirmRequestSchema,
  publicScenarioOwnerSchema,
  publicScenarioReaderSchema,
  publicScenarioModerationSchema,
} from './public-scenario-publication';
import {
  SCENARIO_PERSONALIZATION_VERSION,
  scenarioPersonalProfileSchema,
  scenarioPersonalizationFactsSchema,
  scenarioPersonalizationPreviewSchema,
  scenarioPersonalizationApprovalSchema,
} from './scenario-personalization';
import { privacyConsentStatusSchema } from './privacy-consent';
import {
  PUBLIC_FORK_START_VERSION,
  publicForkStartRequestSchema,
  publicForkStartReceiptSchema,
  publicForkAttributionSchema,
  publicForkInitialChoiceSchema,
} from './public-fork-start';
import {
  PUBLIC_FORK_PERMISSION_VERSION,
  publicForkPermissionRequestSchema,
  officialForkPermissionRequestSchema,
  publicForkPermissionOwnerSchema,
  publicForkCapabilitySchema,
} from './public-fork-permission';
import {
  lifeDeletionRequestSchema,
  lifeDeletionReceiptSchema,
} from './life-deletion';
import {
  PUBLICATION_REFRESH_VERSION,
  publicationRefreshRequestSchema,
  publicationRefreshTargetsSchema,
  publicationRefreshReceiptSchema,
} from './publication-refresh';
import {
  PUBLIC_EXPOSURE_VERSION,
  publicExposureRequestSchema,
  officialExposureRequestSchema,
  publicExposureOwnerViewSchema,
  publicExposureSchema,
  publicExposureSitemapQuerySchema,
  publicExposureSitemapSchema,
} from './public-exposure';
import {
  PUBLIC_COLLECTIONS_VERSION,
  publicCollectionRequestSchema,
  publicCollectionPageSchema,
  publicCollectionReceiptSchema,
} from './public-collections';
import {
  PUBLIC_METRICS_VERSION,
  publicReadingStartSchema,
  publicReadingSessionSchema,
  publicReadingSignalSchema,
  publicReadingReceiptSchema,
} from './public-metrics';
import {
  PUBLIC_SAFETY_VERSION,
  publicReportRequestSchema,
  publicReportReceiptSchema,
  publicReportModerationSchema,
  publicRestrictionRequestSchema,
  publicSafetyViewSchema,
} from './public-safety';
import {
  SAVED_LIVES_VERSION,
  savedLivesQuerySchema,
  savedLifeStatusSchema,
  savedLifeMutationSchema,
  savedLivesPageSchema,
} from './saved-lives';
import {
  DISCOVERY_VERSION,
  discoveryQuerySchema,
  discoveryCardSchema,
  discoveryPageSchema,
} from './discovery';
import {
  OFFICIAL_PUBLICATION_VERSION,
  officialPublicationSnapshotSchema,
  officialPublicationPrepareRequestSchema,
  officialPublicationPreviewSchema,
  officialPublicationConfirmRequestSchema,
  officialPublicationOwnerViewSchema,
  officialPublicationActionRequestSchema,
  officialPublicationModerationRequestSchema,
  officialPublicationReaderSchema,
  officialPublicationStatusSchema,
} from './official-publication';
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
  publicReviewInputSchema,
  publicReviewReportSchema,
  publicPreviewRecordSchema,
  publicPreviewWorkspaceSchema,
  publicReviewViewSchema,
  publicPreviewPreflightSchema,
  publicReviewJobRequestSchema,
  publicReviewJobViewSchema,
  publicCurationRequestSchema,
  publicCurationViewSchema,
  SCENARIO_CONTRACT_VERSION,
  scenarioTemplateSchema,
  scenarioCreateRequestSchema,
  scenarioVersionRequestSchema,
  scenarioVersionSchema,
  scenarioStartRequestSchema,
  SCENARIO_REVIEW_VERSION,
  SCENARIO_CURATION_VERSION,
  OFFICIAL_SCENARIO_SOURCE_VERSION,
  scenarioReviewInputSchema,
  scenarioReviewReportSchema,
  scenarioReviewReceiptSchema,
  scenarioReviewRequestSchema,
  scenarioCurationDecisionSchema,
  officialScenarioSourceRequestSchema,
  officialScenarioSourceRevokeSchema,
  scenarioReleaseViewSchema,
  OFFICIAL_LIFE_SOURCE_VERSION,
  officialLifeStartRequestSchema,
  officialLifeGenerationBindingSchema,
  officialLifeReceiptSchema,
  officialLifeEvidenceSchema,
  officialLifeGrantRequestSchema,
  officialLifeRevokeRequestSchema,
  officialLifeSourceViewSchema,
  FORK_CHECKPOINT_VERSION,
  forkCheckpointSchema,
  forkFactChangeSchema,
  forkCheckpointRequestSchema,
  forkCheckpointViewSchema,
  forkCheckpointCandidateSchema,
  PUBLIC_CONTENT_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicContentSchema,
  publicContentRequestSchema,
  publicContentViewSchema,
  publicContentWorkspaceSchema,
  publicContentReviewInputSchema,
  publicContentReviewReportSchema,
  publicContentReviewJobRequestSchema,
  publicContentReviewJobViewSchema,
  PUBLIC_CONTENT_CURATION_VERSION,
  publicContentCurationRequestSchema,
  publicContentCurationViewSchema,
  PUBLICATION_VERSION,
  publicationSnapshotSchema,
  publicationPrepareRequestSchema,
  publicationPreviewSchema,
  publicationConfirmRequestSchema,
  publicationOwnerViewSchema,
  publicationActionRequestSchema,
  publicationModerationRequestSchema,
  publicationReaderSchema,
  publicationStatusSchema,
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
  personalSharedMemorySchema,
  personalSharedMemoriesSchema,
  sharedBlockRequestSchema,
  sharedReportRequestSchema,
  sharedInviteReportRequestSchema,
} from './index';

const directory = resolve(__dirname, '../../../docs/contracts');
mkdirSync(directory, { recursive: true });
const consentDirectory = resolve(directory, 'privacy-consent');
mkdirSync(consentDirectory, { recursive: true });
writeFileSync(
  resolve(consentDirectory, 'status.schema.json'),
  JSON.stringify(
    {
      $id: 'urn:alterward:privacy-consent:status:privacy-consent-status-1',
      ...z.toJSONSchema(privacyConsentStatusSchema),
    },
    null,
    2,
  ) + '\n',
);
const forkStartDirectory = resolve(directory, 'public-fork-start');
mkdirSync(forkStartDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: publicForkStartRequestSchema,
  receipt: publicForkStartReceiptSchema,
  attribution: publicForkAttributionSchema,
  initialChoice: publicForkInitialChoiceSchema,
}))
  writeFileSync(
    resolve(forkStartDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-fork-start:${name}:${PUBLIC_FORK_START_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
const forkPermissionDirectory = resolve(directory, 'public-fork-permission');
mkdirSync(forkPermissionDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: publicForkPermissionRequestSchema,
  officialRequest: officialForkPermissionRequestSchema,
  ownerView: publicForkPermissionOwnerSchema,
  capability: publicForkCapabilitySchema,
}))
  writeFileSync(
    resolve(forkPermissionDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-fork-permission:${name}:${PUBLIC_FORK_PERMISSION_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
const publicCollectionsDirectory = resolve(directory, 'public-collections');
const publicExposureDirectory = resolve(directory, 'public-exposure');
const publicationRefreshDirectory = resolve(directory, 'publication-refresh');
const lifeDeletionDirectory = resolve(directory, 'life-deletion');
mkdirSync(lifeDeletionDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: lifeDeletionRequestSchema,
  receipt: lifeDeletionReceiptSchema,
}))
  writeFileSync(
    resolve(lifeDeletionDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:life-deletion:${name}:life-deletion-1`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
mkdirSync(publicationRefreshDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: publicationRefreshRequestSchema,
  targets: publicationRefreshTargetsSchema,
  receipt: publicationRefreshReceiptSchema,
}))
  writeFileSync(
    resolve(publicationRefreshDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:publication-refresh:${name}:${PUBLICATION_REFRESH_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
mkdirSync(publicExposureDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: publicExposureRequestSchema,
  officialRequest: officialExposureRequestSchema,
  ownerView: publicExposureOwnerViewSchema,
  projection: publicExposureSchema,
  sitemapQuery: publicExposureSitemapQuerySchema,
  sitemap: publicExposureSitemapSchema,
})) {
  writeFileSync(
    resolve(publicExposureDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-exposure:${name}:${PUBLIC_EXPOSURE_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(publicCollectionsDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  request: publicCollectionRequestSchema,
  page: publicCollectionPageSchema,
  receipt: publicCollectionReceiptSchema,
})) {
  writeFileSync(
    resolve(publicCollectionsDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-collections:${name}:${PUBLIC_COLLECTIONS_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const publicMetricsDirectory = resolve(directory, 'public-metrics');
mkdirSync(publicMetricsDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  startRequest: publicReadingStartSchema,
  session: publicReadingSessionSchema,
  signalRequest: publicReadingSignalSchema,
  receipt: publicReadingReceiptSchema,
})) {
  writeFileSync(
    resolve(publicMetricsDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-metrics:${name}:${PUBLIC_METRICS_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
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
  reviewInput: publicReviewInputSchema,
  reviewReport: publicReviewReportSchema,
  previewRecord: publicPreviewRecordSchema,
  previewWorkspace: publicPreviewWorkspaceSchema,
  reviewView: publicReviewViewSchema,
  previewPreflight: publicPreviewPreflightSchema,
  reviewJobRequest: publicReviewJobRequestSchema,
  reviewJobView: publicReviewJobViewSchema,
  curationRequest: publicCurationRequestSchema,
  curationView: publicCurationViewSchema,
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
const scenarioReleaseDirectory = resolve(directory, 'scenario-release');
mkdirSync(scenarioReleaseDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  reviewInput: scenarioReviewInputSchema,
  reviewReport: scenarioReviewReportSchema,
  reviewReceipt: scenarioReviewReceiptSchema,
  reviewRequest: scenarioReviewRequestSchema,
  curationDecision: scenarioCurationDecisionSchema,
  sourceRequest: officialScenarioSourceRequestSchema,
  sourceRevoke: officialScenarioSourceRevokeSchema,
  releaseView: scenarioReleaseViewSchema,
})) {
  const version = name.startsWith('source')
    ? OFFICIAL_SCENARIO_SOURCE_VERSION
    : name === 'curationDecision'
      ? SCENARIO_CURATION_VERSION
      : SCENARIO_REVIEW_VERSION;
  writeFileSync(
    resolve(scenarioReleaseDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:scenario-release:${name}:${version}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const v2Directory = resolve(directory, 'v2');
const officialLifeDirectory = resolve(directory, 'official-life');
mkdirSync(officialLifeDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  startRequest: officialLifeStartRequestSchema,
  generationBinding: officialLifeGenerationBindingSchema,
  receipt: officialLifeReceiptSchema,
  evidence: officialLifeEvidenceSchema,
  grantRequest: officialLifeGrantRequestSchema,
  revokeRequest: officialLifeRevokeRequestSchema,
  sourceView: officialLifeSourceViewSchema,
})) {
  writeFileSync(
    resolve(officialLifeDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:official-life:${name}:${OFFICIAL_LIFE_SOURCE_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
for (const [name, schema] of Object.entries({
  contentCurationRequest: publicContentCurationRequestSchema,
  contentCurationView: publicContentCurationViewSchema,
})) {
  writeFileSync(
    resolve(publicDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public:${name}:${PUBLIC_CONTENT_CURATION_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
for (const [name, schema] of Object.entries({
  forkCheckpoint: forkCheckpointSchema,
  forkFactChange: forkFactChangeSchema,
  forkCheckpointRequest: forkCheckpointRequestSchema,
  forkCheckpointView: forkCheckpointViewSchema,
  forkCheckpointCandidate: forkCheckpointCandidateSchema,
})) {
  writeFileSync(
    resolve(publicDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public:${name}:${FORK_CHECKPOINT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
for (const [name, schema] of Object.entries({
  scenarioTemplate: scenarioTemplateSchema,
  scenarioCreateRequest: scenarioCreateRequestSchema,
  scenarioVersionRequest: scenarioVersionRequestSchema,
  scenarioVersion: scenarioVersionSchema,
  scenarioStartRequest: scenarioStartRequestSchema,
})) {
  writeFileSync(
    resolve(publicDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public:${name}:${SCENARIO_CONTRACT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(v2Directory, { recursive: true });
for (const [name, schema] of Object.entries({
  contentBundle: publicContentSchema,
  contentBundleRequest: publicContentRequestSchema,
  contentBundleView: publicContentViewSchema,
  contentBundleWorkspace: publicContentWorkspaceSchema,
  contentReviewInput: publicContentReviewInputSchema,
  contentReviewReport: publicContentReviewReportSchema,
  contentReviewJobRequest: publicContentReviewJobRequestSchema,
  contentReviewJobView: publicContentReviewJobViewSchema,
})) {
  writeFileSync(
    resolve(publicDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public:${name}:${name.startsWith('contentReview') ? PUBLIC_CONTENT_REVIEW_VERSION : PUBLIC_CONTENT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
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
const discoveryDirectory = resolve(directory, 'discovery');
const savedLivesDirectory = resolve(directory, 'saved-lives');
const publicSafetyDirectory = resolve(directory, 'public-safety');
mkdirSync(publicSafetyDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  reportRequest: publicReportRequestSchema,
  receipt: publicReportReceiptSchema,
  moderation: publicReportModerationSchema,
  restriction: publicRestrictionRequestSchema,
  ownSafety: publicSafetyViewSchema,
})) {
  writeFileSync(
    resolve(publicSafetyDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-safety:${name}:${PUBLIC_SAFETY_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(savedLivesDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  query: savedLivesQuerySchema,
  status: savedLifeStatusSchema,
  mutation: savedLifeMutationSchema,
  page: savedLivesPageSchema,
})) {
  writeFileSync(
    resolve(savedLivesDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:saved-lives:${name}:${SAVED_LIVES_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(discoveryDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  query: discoveryQuerySchema,
  card: discoveryCardSchema,
  page: discoveryPageSchema,
})) {
  writeFileSync(
    resolve(discoveryDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:discovery:${name}:${DISCOVERY_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const officialPublicationDirectory = resolve(directory, 'official-publication');
mkdirSync(officialPublicationDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  snapshot: officialPublicationSnapshotSchema,
  prepareRequest: officialPublicationPrepareRequestSchema,
  preview: officialPublicationPreviewSchema,
  confirmRequest: officialPublicationConfirmRequestSchema,
  ownerView: officialPublicationOwnerViewSchema,
  actionRequest: officialPublicationActionRequestSchema,
  moderationRequest: officialPublicationModerationRequestSchema,
  reader: officialPublicationReaderSchema,
  status: officialPublicationStatusSchema,
})) {
  writeFileSync(
    resolve(officialPublicationDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:official-publication:${name}:${OFFICIAL_PUBLICATION_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const personalizationDirectory = resolve(directory, 'scenario-personalization');
const scenarioPublicationDirectory = resolve(
  directory,
  'public-scenario-publication',
);
mkdirSync(scenarioPublicationDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  prepareRequest: publicScenarioPrepareRequestSchema,
  preview: publicScenarioPreviewSchema,
  confirmRequest: publicScenarioConfirmRequestSchema,
  ownerView: publicScenarioOwnerSchema,
  reader: publicScenarioReaderSchema,
  moderation: publicScenarioModerationSchema,
})) {
  writeFileSync(
    resolve(scenarioPublicationDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:public-scenario:${name}:${PUBLIC_SCENARIO_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(personalizationDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  personalProfile: scenarioPersonalProfileSchema,
  facts: scenarioPersonalizationFactsSchema,
  preview: scenarioPersonalizationPreviewSchema,
  approval: scenarioPersonalizationApprovalSchema,
})) {
  writeFileSync(
    resolve(personalizationDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:scenario-personalization:${name}:${SCENARIO_PERSONALIZATION_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
const publicationDirectory = resolve(directory, 'publication');
mkdirSync(publicationDirectory, { recursive: true });
for (const [name, schema] of Object.entries({
  snapshot: publicationSnapshotSchema,
  prepareRequest: publicationPrepareRequestSchema,
  preview: publicationPreviewSchema,
  confirmRequest: publicationConfirmRequestSchema,
  ownerView: publicationOwnerViewSchema,
  actionRequest: publicationActionRequestSchema,
  moderationRequest: publicationModerationRequestSchema,
  reader: publicationReaderSchema,
  status: publicationStatusSchema,
})) {
  writeFileSync(
    resolve(publicationDirectory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:alterward:publication:${name}:${PUBLICATION_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
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
  personalMemory: personalSharedMemorySchema,
  personalMemories: personalSharedMemoriesSchema,
  blockRequest: sharedBlockRequestSchema,
  reportRequest: sharedReportRequestSchema,
  inviteReportRequest: sharedInviteReportRequestSchema,
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
