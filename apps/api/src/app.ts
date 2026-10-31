import 'reflect-metadata';
import { ClosedBetaGeneration, CLOSED_BETA_GENERATION } from './closed-beta';
import {
  BILLING_WEBHOOK_LIMIT,
  BILLING_WEBHOOK_PATH,
  accountDeletionBilling,
  createBillingController,
  createBillingRuntime,
  describeBilling,
  type BillingRuntime,
} from './billing';
import {
  configureGenerationGate,
  createGenerationGate,
  closedBetaConfigFromEnv,
  validateClosedBetaConfig,
  assertClosedBetaAdmission,
  type ClosedBetaConfig,
} from '@future-flow/database';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Query,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  Req,
  Res,
  Inject,
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiOkResponse,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { json, raw, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  getQuestionnaire,
  privacyConsentStatusSchema,
  localeFromAcceptLanguage,
  errorMessage,
  type Locale,
  draftRequestSchema,
  futureRequestSchema,
  resolveDecisionSchema,
  idSchema,
  lifeCreateRequestV2Schema,
  lifeDraftRequestV2Schema,
  lifeChoiceRequestV2Schema,
  lifeRevisionRequestV2Schema,
  lifeInteractionV2Schema,
  publicPreviewRequestSchema,
  publicPreviewWorkspaceSchema,
  publicPreviewPreflightSchema,
  publicReviewJobRequestSchema,
  publicReviewJobViewSchema,
  publicCurationRequestSchema,
  publicCurationViewSchema,
  scenarioCreateRequestSchema,
  scenarioVersionRequestSchema,
  scenarioStartRequestSchema,
  scenarioVersionSchema,
  scenarioReleaseViewSchema,
  forkCheckpointRequestSchema,
  forkCheckpointViewSchema,
  forkCheckpointCandidateSchema,
  publicContentRequestSchema,
  publicContentViewSchema,
  publicContentWorkspaceSchema,
  publicContentReviewJobRequestSchema,
  publicContentReviewJobViewSchema,
  publicContentCurationRequestSchema,
  publicContentCurationViewSchema,
  enabledLocales,
  betaFeedbackSchema,
  lifeContinueRequestV2Schema,
  lifeDeletionRequestSchema,
  lifeDeletionReceiptSchema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  narrativeConfigFromEnv,
  type NarrativeConfig,
  LifeDeletionRepository,
  PublicDraftRepository,
  PublicReviewRepository,
  PublicReviewJobRepository,
  PublicContentReviewJobRepository,
  publicContentReviewJobConfigFromEnv,
  PublicContentCurationRepository,
  publicContentCurationEnabledFromEnv,
  PublicCurationRepository,
  publicCurationEnabledFromEnv,
  ScenarioRepository,
  ScenarioReleaseRepository,
  scenarioVersionsEnabledFromEnv,
  PublicForkCheckpointRepository,
  publicForkCheckpointsEnabledFromEnv,
  PublicContentRepository,
  publicContentBundlesEnabledFromEnv,
  publicReviewJobConfigFromEnv,
  type PublicReviewJobConfig,
  BetaFeedbackRepository,
  publicationConfigFromEnv,
  type PublicationConfig,
} from '@future-flow/database';
import { deleteAccount } from './account-deletion';
import {
  createClosedSiteGate,
  publicApiException,
  type ClosedSiteGate,
} from '@future-flow/access';
import { createPublicationControllers } from './publications';
import { createOfficialPublicationControllers } from './official-publications';
import { createDiscoveryController } from './discovery';
import { createSavedLivesController } from './saved-lives';
import { createPublicSafetyController } from './public-safety';
import { createPublicMetricsController } from './public-metrics';
import { createPublicCollectionsController } from './public-collections';
import { createPublicExposureControllers } from './public-exposure';
import { createPublicationRefreshController } from './publication-refresh';
import { createPublicForkPermissionControllers } from './public-fork-permission';
import { createPublicScenarioPublicationControllers } from './public-scenario-publications';
import {
  createPersonalScenarioController,
  createScenarioPersonalizationCapabilityController,
} from './personal-scenario-starts';
import {
  personalScenarioConfigFromEnv,
  type PersonalScenarioConfig,
} from '@future-flow/database';
import {
  publicScenarioConfigFromEnv,
  type PublicScenarioConfig,
} from '@future-flow/database';
import {
  publicForkPermissionConfigFromEnv,
  type PublicForkPermissionConfig,
} from '@future-flow/database';
import {
  officialPublicationConfigFromEnv,
  type OfficialPublicationConfig,
  discoveryConfigFromEnv,
  type DiscoveryConfig,
  savedLivesConfigFromEnv,
  type SavedLivesConfig,
  publicReportsConfigFromEnv,
  type PublicReportsConfig,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
  publicCollectionsConfigFromEnv,
  type PublicCollectionsConfig,
  publicExposureConfigFromEnv,
  type PublicExposureConfig,
  publicationRefreshConfigFromEnv,
  type PublicationRefreshConfig,
} from '@future-flow/database';
import {
  createSharedContextController,
  sharedFeaturesFromEnv,
  type SharedFeatures,
} from './shared-context';
import { type AuthProvider, requireRecentAuthentication } from './auth';
import {
  requireEnabledContent,
  requireEnabledLocale,
} from './content-language';

const REPOSITORY = Symbol('REPOSITORY'),
  AUTH = Symbol('AUTH'),
  BILLING = Symbol('BILLING');
type AuthRequest = Request & {
  locale: Locale;
  userId: string;
  token: string;
  requestId: string;
};
@Injectable()
class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: AuthProvider,
    @Inject(REPOSITORY) private readonly repo: Repository,
    @Inject('CLOSED_BETA_CONFIG') private readonly beta: ClosedBetaConfig,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([A-Za-z0-9_.-]{20,6000})$/.exec(
      request.headers.authorization ?? '',
    );
    if (!match?.[1])
      throw new DomainError(
        'AUTH_REQUIRED',
        'A művelethez bejelentkezés szükséges.',
        401,
      );
    request.token = match[1];
    request.userId = (await this.auth.verify(request.token)).id;
    if (
      Reflect.getMetadata(CLOSED_BETA_GENERATION, context.getHandler()) === true
    )
      assertClosedBetaAdmission(this.beta, request.userId);
    await this.repo.ensureUser(request.userId);
    return true;
  }
}
@Catch()
class SafeErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>(),
      request = host.switchToHttp().getRequest<AuthRequest>();
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : error instanceof HttpException
            ? error.getStatus()
            : 500;
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof z.ZodError
          ? 'VALIDATION_FAILED'
          : status === 500
            ? 'INTERNAL_ERROR'
            : 'REQUEST_FAILED';
    const message = errorMessage(request.locale, code);
    const details =
      error instanceof z.ZodError
        ? {
            fields: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: errorMessage(request.locale, 'VALIDATION_FAILED'),
            })),
          }
        : {};
    response.status(status).json({
      error: { code, message, details, requestId: request.requestId },
    });
  }
}
@Controller('api/v1')
@ApiBearerAuth()
@UseGuards(AuthGuard)
class ApiController {
  constructor(
    @Inject(REPOSITORY) private readonly repo: Repository,
    @Inject(AUTH) private readonly auth: AuthProvider,
    @Inject(BILLING) private readonly billing: BillingRuntime,
  ) {}
  @Get('me')
  @ApiOperation({ summary: 'Authenticated account' })
  me(@Req() req: AuthRequest) {
    return { id: req.userId };
  }
  @Post('me/consent')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        adult: { type: 'boolean', enum: [true] },
        acknowledged: { type: 'boolean', enum: [true] },
      },
      required: ['adult', 'acknowledged'],
      additionalProperties: false,
    },
  })
  async consent(@Req() req: AuthRequest, @Body() body: unknown) {
    z.object({ adult: z.literal(true), acknowledged: z.literal(true) })
      .strict()
      .parse(body);
    await this.repo.acceptPrivacy(req.userId);
    return { accepted: true, policyVersion: 'alpha-privacy-v1' };
  }
  @Get('me/consent')
  @ApiOkResponse({
    schema: z.toJSONSchema(privacyConsentStatusSchema) as never,
  })
  async consentStatus(@Req() req: AuthRequest, @Query() raw: unknown) {
    z.object({}).strict().parse(raw);
    return privacyConsentStatusSchema.parse(
      await this.repo.privacyStatus(req.userId),
    );
  }
  @Get('questionnaires/current')
  questions(@Req() req: AuthRequest) {
    return getQuestionnaire(req.locale);
  }
  @Get('profile')
  profile(@Req() req: AuthRequest) {
    return this.repo.currentProfile(req.userId);
  }
  @Patch('profile/draft')
  @ApiBody({ schema: z.toJSONSchema(draftRequestSchema) as never })
  draft(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = draftRequestSchema.parse(body);
    return this.repo.saveDraft(
      req.userId,
      input.revision,
      input.answers,
      input.relationships,
    );
  }
  @Post('profile/draft/commit')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { revision: { type: 'integer', minimum: 0 } },
      required: ['revision'],
      additionalProperties: false,
    },
  })
  commit(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = z
      .object({ revision: z.number().int().min(0) })
      .strict()
      .parse(body);
    return this.repo.commitProfile(req.userId, input.revision);
  }
  @Get('futures')
  futures(@Req() req: AuthRequest) {
    return this.repo.listFutures(req.userId, enabledLocales);
  }
  @ClosedBetaGeneration()
  @Post('futures')
  @ApiBody({ schema: z.toJSONSchema(futureRequestSchema) as never })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 8, maxLength: 100 },
  })
  create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = futureRequestSchema.parse(body);
    return this.repo.createFuture(
      req.userId,
      input.profileVersionId,
      key ?? '',
      input.locale,
    );
  }
  @Get('futures/:id')
  async future(@Req() req: AuthRequest, @Param('id') id: string) {
    const future = await this.repo.future(req.userId, idSchema.parse(id));
    requireEnabledLocale(future.content_locale);
    return future;
  }
  @Get('jobs/:id')
  async job(@Req() req: AuthRequest, @Param('id') id: string) {
    const job = await this.repo.job(req.userId, idSchema.parse(id));
    await requireEnabledContent(
      this.repo.db,
      req.userId,
      'legacyBranch',
      String(job.branch_id),
    );
    if (job.error_message_safe)
      job.error_message_safe = errorMessage(
        req.locale,
        String(job.error_code ?? 'REQUEST_FAILED'),
      );
    return job;
  }
  @Get('branches/:id')
  async branch(@Req() req: AuthRequest, @Param('id') id: string) {
    const branch = await this.repo.branch(req.userId, idSchema.parse(id));
    requireEnabledLocale(branch.content_locale);
    return branch;
  }
  @Get('branches/:id/timeline')
  async timeline(@Req() req: AuthRequest, @Param('id') id: string) {
    const branchId = idSchema.parse(id);
    await requireEnabledContent(
      this.repo.db,
      req.userId,
      'legacyBranch',
      branchId,
    );
    return this.repo.timeline(req.userId, branchId);
  }
  @ClosedBetaGeneration()
  @Post('decisions/:id/resolve')
  @ApiBody({ schema: z.toJSONSchema(resolveDecisionSchema) as never })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 8, maxLength: 100 },
  })
  async resolve(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = resolveDecisionSchema.parse(body);
    const decisionId = idSchema.parse(id);
    await requireEnabledContent(
      this.repo.db,
      req.userId,
      'legacyDecision',
      decisionId,
    );
    return this.repo.resolveDecision(
      req.userId,
      decisionId,
      input.optionId,
      key ?? '',
    );
  }
  @Get('me/export')
  async export(@Req() req: AuthRequest, @Res() response: Response) {
    requireRecentAuthentication(req.token);
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="alterward-export.json"',
    );
    response.json(await this.repo.exportAccount(req.userId));
  }
  @Delete('me')
  async delete(@Req() req: AuthRequest, @Body() body: unknown) {
    z.object({ confirmation: z.literal('DELETE ACCOUNT') })
      .strict()
      .parse(body);
    requireRecentAuthentication(req.token);
    return deleteAccount(
      this.repo,
      this.auth,
      req.userId,
      accountDeletionBilling(this.billing),
    );
  }
}
@Controller('api/v2')
@UseGuards(AuthGuard)
class LifeController {
  @Post('feedback')
  @ApiBody({ schema: z.toJSONSchema(betaFeedbackSchema) as never })
  feedback(@Req() req: AuthRequest, @Body() body: unknown) {
    return new BetaFeedbackRepository(this.repo.db).submit(req.userId, body);
  }
  @Post('interactions') async interaction(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = lifeInteractionV2Schema.parse(body);
    if (input.branchId) await this.availableBranch(req.userId, input.branchId);
    return this.lives.interaction(req.userId, input);
  }
  private readonly lives: LifeRepository;
  private readonly publicDrafts: PublicDraftRepository;
  private readonly scenarios: ScenarioRepository;
  private readonly publicCheckpoints: PublicForkCheckpointRepository;
  private readonly publicContent: PublicContentRepository;
  constructor(
    @Inject(REPOSITORY) private readonly repo: Repository,
    @Inject('PUBLIC_REVIEW_CONFIG')
    private readonly publicReviewConfig: PublicReviewJobConfig,
    @Inject('PUBLIC_CURATION_ENABLED')
    private readonly publicCurationEnabled: boolean,
    @Inject('SCENARIO_VERSIONS_ENABLED')
    private readonly scenarioVersionsEnabled: boolean,
    @Inject('PUBLIC_FORK_CHECKPOINTS_ENABLED')
    private readonly publicForkCheckpointsEnabled: boolean,
    @Inject('PUBLIC_CONTENT_BUNDLES_ENABLED')
    private readonly publicContentBundlesEnabled: boolean,
    @Inject('PUBLIC_CONTENT_REVIEW_CONFIG')
    private readonly publicContentReviewConfig: PublicReviewJobConfig,
    @Inject('PUBLIC_CONTENT_CURATION_ENABLED')
    private readonly publicContentCurationEnabled: boolean,
    @Inject('GENERATION_LIMITS')
    generationLimits: { daily: number; concurrent: number },
    @Inject('NARRATIVE_CONFIG')
    narrativeConfig: NarrativeConfig,
  ) {
    this.publicDrafts = new PublicDraftRepository(repo.db);
    this.publicContent = new PublicContentRepository(
      repo.db,
      publicContentBundlesEnabled,
    );
    this.publicCheckpoints = new PublicForkCheckpointRepository(
      repo.db,
      publicForkCheckpointsEnabled,
    );
    this.lives = new LifeRepository(repo.db, generationLimits, narrativeConfig);
    this.scenarios = new ScenarioRepository(
      repo.db,
      scenarioVersionsEnabled,
      generationLimits,
    );
  }
  private async availableBranch(userId: string, id: string) {
    const branch = await this.lives.branch(userId, idSchema.parse(id));
    requireEnabledLocale(branch.content_locale);
    return branch;
  }
  @Get('lives') list(@Req() req: AuthRequest) {
    return this.lives.list(req.userId, enabledLocales);
  }
  @Delete('lives/:id')
  @ApiBody({ schema: z.toJSONSchema(lifeDeletionRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(lifeDeletionReceiptSchema) as never })
  deleteLife(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    requireRecentAuthentication(req.token);
    return new LifeDeletionRepository(this.repo.db).remove(
      req.userId,
      id,
      body,
      key ?? '',
    );
  }
  @Get('scenarios') scenariosList(@Req() req: AuthRequest) {
    return this.scenarios.list(req.userId);
  }
  @Get('public-previews/:id/content-bundles')
  @ApiOkResponse({
    schema: z.toJSONSchema(publicContentWorkspaceSchema) as never,
  })
  publicContentList(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.publicContent.workspace(req.userId, idSchema.parse(id));
  }
  @Get('public-content-bundles/:id/review-job')
  @ApiOkResponse({
    schema: z.toJSONSchema(publicContentReviewJobViewSchema) as never,
  })
  publicContentReview(@Req() req: AuthRequest, @Param('id') id: string) {
    return new PublicContentReviewJobRepository(
      this.repo.db,
      this.publicContentReviewConfig,
    ).get(req.userId, idSchema.parse(id));
  }
  @Get('public-content-bundles/:id/curation')
  @ApiOkResponse({
    schema: z.toJSONSchema(publicContentCurationViewSchema) as never,
  })
  publicFullCuration(@Req() req: AuthRequest, @Param('id') id: string) {
    return new PublicContentCurationRepository(
      this.repo.db,
      this.publicContentCurationEnabled,
    ).get(req.userId, idSchema.parse(id));
  }
  @Post('public-content-bundles/:id/curation')
  @ApiBody({
    schema: z.toJSONSchema(publicContentCurationRequestSchema) as never,
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(publicContentCurationViewSchema) as never,
  })
  submitPublicFullCuration(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return new PublicContentCurationRepository(
      this.repo.db,
      this.publicContentCurationEnabled,
    ).submit(req.userId, idSchema.parse(id), body, key ?? '');
  }
  @ClosedBetaGeneration()
  @Post('public-content-bundles/:id/review-job')
  @ApiBody({
    schema: z.toJSONSchema(publicContentReviewJobRequestSchema) as never,
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(publicContentReviewJobViewSchema) as never,
  })
  startPublicContentReview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return new PublicContentReviewJobRepository(
      this.repo.db,
      this.publicContentReviewConfig,
    ).enqueue(req.userId, idSchema.parse(id), body, key ?? '');
  }
  @Post('public-previews/:id/content-bundles')
  @ApiBody({ schema: z.toJSONSchema(publicContentRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(publicContentViewSchema) as never })
  publicContentSave(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.publicContent.save(
      req.userId,
      idSchema.parse(id),
      body,
      key ?? '',
    );
  }
  @Get('public-previews/:id/fork-checkpoints') publicForkList(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.publicCheckpoints.list(req.userId, idSchema.parse(id));
  }
  @Post('public-previews/:id/fork-checkpoints')
  @ApiBody({ schema: z.toJSONSchema(forkCheckpointRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(forkCheckpointViewSchema) as never })
  publicForkSave(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.publicCheckpoints.save(
      req.userId,
      idSchema.parse(id),
      body,
      key ?? '',
    );
  }
  @Get('public-previews/:id/fork-checkpoint-candidates')
  @ApiOkResponse({
    schema: z.toJSONSchema(z.array(forkCheckpointCandidateSchema)) as never,
  })
  publicForkCandidates(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.publicCheckpoints.candidates(req.userId, idSchema.parse(id));
  }
  @Post('scenarios')
  @ApiBody({ schema: z.toJSONSchema(scenarioCreateRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(scenarioVersionSchema) as never })
  scenarioCreate(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.scenarios.create(req.userId, body, key ?? '');
  }
  @Post('scenarios/:id/versions')
  @ApiBody({ schema: z.toJSONSchema(scenarioVersionRequestSchema) as never })
  scenarioRevise(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.scenarios.revise(
      req.userId,
      idSchema.parse(id),
      body,
      key ?? '',
    );
  }
  @Get('scenario-versions/:id') scenarioGet(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.scenarios.get(req.userId, idSchema.parse(id));
  }
  @Get('scenario-versions/:id/release-review')
  @ApiOkResponse({ schema: z.toJSONSchema(scenarioReleaseViewSchema) as never })
  async scenarioReleaseReview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    const versionId = idSchema.parse(id);
    await this.scenarios.get(req.userId, versionId);
    return new ScenarioReleaseRepository(this.repo.db).get(
      req.userId,
      versionId,
    );
  }
  @ClosedBetaGeneration()
  @Post('scenario-versions/:id/start')
  @ApiBody({ schema: z.toJSONSchema(scenarioStartRequestSchema) as never })
  scenarioStart(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.scenarios.start(
      req.userId,
      idSchema.parse(id),
      body,
      key ?? '',
    );
  }
  @Get('draft') draft(@Req() req: AuthRequest) {
    return this.lives.draft(req.userId);
  }
  @Patch('draft') saveDraft(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = z
      .object({
        revision: z.number().int().nonnegative(),
        payload: lifeDraftRequestV2Schema,
      })
      .strict()
      .parse(body);
    return this.lives.saveDraft(req.userId, input.revision, input.payload);
  }
  @ClosedBetaGeneration()
  @Post('lives')
  create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.lives.create(
      req.userId,
      lifeCreateRequestV2Schema.parse(body),
      key ?? '',
    );
  }
  @Get('branches/:id') async detail(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    const branch = await this.availableBranch(req.userId, id);
    return this.lives.detail(req.userId, branch.id);
  }
  @Get('branches/:id/public-preview')
  @ApiOperation({
    summary:
      'Read the own private copy editor and latest valid preview. No AI call.',
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(publicPreviewWorkspaceSchema) as never,
  })
  async publicPreviewWorkspace(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    const branch = await this.availableBranch(req.userId, id);
    return this.publicDrafts.workspace(req.userId, branch.id);
  }
  @Post('branches/:id/public-preview')
  @ApiOperation({
    summary: 'Prepare an owner-only draft. This does not publish content.',
  })
  @ApiBody({ schema: z.toJSONSchema(publicPreviewRequestSchema) as never })
  async preparePublicPreview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const input = publicPreviewRequestSchema.parse(body);
    const branch = await this.availableBranch(req.userId, id);
    return this.publicDrafts.prepare(
      req.userId,
      branch.id,
      input.revision,
      input.copy,
      key,
    );
  }
  @Get('public-previews/:id')
  @ApiOperation({ summary: 'Read the own saved private preview.' })
  async publicPreview(@Req() req: AuthRequest, @Param('id') id: string) {
    const preview = await this.publicDrafts.get(req.userId, idSchema.parse(id));
    requireEnabledLocale(preview.snapshot.locale);
    return preview;
  }
  @Post('branches/:id/public-preview/check')
  @ApiOperation({
    summary:
      'Check the own copy text for deterministic privacy findings. No AI or persistence.',
  })
  @ApiBody({ schema: z.toJSONSchema(publicPreviewRequestSchema) as never })
  @ApiOkResponse({
    schema: z.toJSONSchema(publicPreviewPreflightSchema) as never,
  })
  async checkPublicPreview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = publicPreviewRequestSchema.parse(body),
      branch = await this.availableBranch(req.userId, id);
    return this.publicDrafts.preflight(
      req.userId,
      branch.id,
      input.revision,
      input.copy,
    );
  }
  @Get('public-previews/:id/review')
  @ApiOperation({
    summary:
      'Read the own private AI pre-screen. This never approves publication.',
  })
  async publicReview(@Req() req: AuthRequest, @Param('id') id: string) {
    return new PublicReviewRepository(this.repo.db).get(
      req.userId,
      idSchema.parse(id),
    );
  }
  @Get('public-previews/:id/review-job')
  @ApiOperation({
    summary: 'Read own paid review availability and job status. No AI call.',
  })
  @ApiOkResponse({ schema: z.toJSONSchema(publicReviewJobViewSchema) as never })
  publicReviewJob(@Req() req: AuthRequest, @Param('id') id: string) {
    return new PublicReviewJobRepository(
      this.repo.db,
      this.publicReviewConfig,
    ).get(req.userId, idSchema.parse(id));
  }
  @ClosedBetaGeneration()
  @Post('public-previews/:id/review-job')
  @ApiOperation({
    summary:
      'Request one budget-guarded AI pre-screen of the own immutable copy.',
  })
  @ApiBody({ schema: z.toJSONSchema(publicReviewJobRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(publicReviewJobViewSchema) as never })
  startPublicReviewJob(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return new PublicReviewJobRepository(
      this.repo.db,
      this.publicReviewConfig,
    ).enqueue(
      req.userId,
      idSchema.parse(id),
      publicReviewJobRequestSchema.parse(body),
      key ?? '',
    );
  }
  @Get('public-previews/:id/curation')
  @ApiOperation({
    summary: 'Read own copy text review status. No publication or AI call.',
  })
  @ApiOkResponse({ schema: z.toJSONSchema(publicCurationViewSchema) as never })
  publicCuration(@Req() req: AuthRequest, @Param('id') id: string) {
    return new PublicCurationRepository(
      this.repo.db,
      this.publicCurationEnabled,
    ).get(req.userId, idSchema.parse(id));
  }
  @Post('public-previews/:id/curation')
  @ApiOperation({
    summary:
      'Submit own immutable copy for a trusted text review. No publication or AI call.',
  })
  @ApiBody({ schema: z.toJSONSchema(publicCurationRequestSchema) as never })
  @ApiOkResponse({ schema: z.toJSONSchema(publicCurationViewSchema) as never })
  submitPublicCuration(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return new PublicCurationRepository(
      this.repo.db,
      this.publicCurationEnabled,
    ).submit(
      req.userId,
      idSchema.parse(id),
      publicCurationRequestSchema.parse(body),
      key ?? '',
    );
  }
  @Post('branches/:id/choice') async choose(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = lifeChoiceRequestV2Schema.parse(body);
    const branch = await this.availableBranch(req.userId, id);
    return this.lives.choose(
      req.userId,
      branch.id,
      input.revision,
      input.decisionId,
      input.optionId,
      key ?? '',
    );
  }
  @ClosedBetaGeneration()
  @Post('branches/:id/continue')
  async continue(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = lifeContinueRequestV2Schema.parse(body);
    const branch = await this.availableBranch(req.userId, id);
    return this.lives.continue(
      req.userId,
      branch.id,
      input.revision,
      key ?? '',
      input.sessionId,
    );
  }
  @ClosedBetaGeneration()
  @Post('branches/:id/periods/:periodId/fork')
  async fork(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('periodId') periodId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = z
      .object({ revision: z.number().int().nonnegative(), optionId: idSchema })
      .strict()
      .parse(body);
    const branch = await this.availableBranch(req.userId, id);
    return this.lives.fork(
      req.userId,
      branch.id,
      idSchema.parse(periodId),
      input.revision,
      input.optionId,
      key ?? '',
    );
  }
  @ClosedBetaGeneration()
  @Post('jobs/:id/retry')
  async retry(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = lifeRevisionRequestV2Schema.parse(body);
    const jobId = idSchema.parse(id);
    await requireEnabledContent(this.repo.db, req.userId, 'lifeJob', jobId);
    return this.lives.retry(req.userId, jobId, input.revision, key ?? '');
  }
}
@Controller()
class HealthController {
  @Get('health') health() {
    return { status: 'ok', service: 'future-flow-api' };
  }
}
export async function createApp(
  repo: Repository,
  auth: AuthProvider,
  origin = 'http://localhost:3000',
  proxyHops: 0 | 1 = 0,
  sharedFeatures: SharedFeatures = sharedFeaturesFromEnv(),
  publicReviewConfig: PublicReviewJobConfig = publicReviewJobConfigFromEnv(),
  publicCurationEnabled = publicCurationEnabledFromEnv(),
  scenarioVersionsEnabled = scenarioVersionsEnabledFromEnv(),
  publicForkCheckpointsEnabled = publicForkCheckpointsEnabledFromEnv(),
  publicContentBundlesEnabled = publicContentBundlesEnabledFromEnv(),
  publicContentReviewConfig: PublicReviewJobConfig = publicContentReviewJobConfigFromEnv(),
  publicContentCurationEnabled = publicContentCurationEnabledFromEnv(),
  publicationConfig: PublicationConfig = publicationConfigFromEnv(),
  officialPublicationConfig: OfficialPublicationConfig = officialPublicationConfigFromEnv(),
  discoveryConfig: DiscoveryConfig = discoveryConfigFromEnv(),
  savedLivesConfig: SavedLivesConfig = savedLivesConfigFromEnv(),
  publicReportsConfig: PublicReportsConfig = publicReportsConfigFromEnv(),
  publicMetricsConfig: PublicMetricsConfig = publicMetricsConfigFromEnv(),
  publicCollectionsConfig: PublicCollectionsConfig = publicCollectionsConfigFromEnv(),
  publicExposureConfig: PublicExposureConfig = publicExposureConfigFromEnv(),
  publicationRefreshConfig: PublicationRefreshConfig = publicationRefreshConfigFromEnv(),
  publicForkPermissionConfig: PublicForkPermissionConfig = publicForkPermissionConfigFromEnv(),
  publicScenarioConfig: PublicScenarioConfig = publicScenarioConfigFromEnv(),
  personalScenarioConfig: PersonalScenarioConfig = personalScenarioConfigFromEnv(),
  closedBetaConfig: ClosedBetaConfig = closedBetaConfigFromEnv(),
  closedSiteGate: ClosedSiteGate = createClosedSiteGate(),
  billing: BillingRuntime = createBillingRuntime(repo.db),
) {
  // Chapter allowance gate: off unless BILLING_ENFORCEMENT is set. When it is on
  // but billing is not usable, everyone except the closed-beta accounts is
  // refused (a broken setup closes the gate, never opens it).
  configureGenerationGate(
    billing.config.enforcement
      ? createGenerationGate({
          ready: billing.config.enabled,
          exemptUserIds: closedBetaConfig.userIds,
          entitlement: billing.config.entitlement,
        })
      : null,
  );
  const generationLimits = Object.freeze({
    daily: Number(process.env.GENERATION_DAILY_LIMIT ?? 10),
    concurrent: Number(process.env.GENERATION_CONCURRENT_LIMIT ?? 2),
  });
  const narrativeConfig = narrativeConfigFromEnv();
  const SharedContextController = createSharedContextController(
    AuthGuard,
    REPOSITORY,
    sharedFeatures,
  );
  @Module({
    controllers: [
      createScenarioPersonalizationCapabilityController(
        REPOSITORY,
        personalScenarioConfig,
        publicScenarioConfig,
      ),
      createPersonalScenarioController(
        AuthGuard,
        REPOSITORY,
        personalScenarioConfig,
        publicScenarioConfig,
        generationLimits,
      ),
      ...createPublicScenarioPublicationControllers(
        AuthGuard,
        REPOSITORY,
        publicScenarioConfig,
      ),
      ...createPublicForkPermissionControllers(
        AuthGuard,
        REPOSITORY,
        publicForkPermissionConfig,
        publicationConfig,
        officialPublicationConfig,
        generationLimits,
      ),
      createPublicationRefreshController(
        AuthGuard,
        REPOSITORY,
        publicationRefreshConfig,
        publicationConfig,
        officialPublicationConfig,
        publicMetricsConfig,
      ),
      ...createPublicExposureControllers(
        AuthGuard,
        REPOSITORY,
        publicExposureConfig,
        publicationConfig,
        officialPublicationConfig,
      ),
      createPublicCollectionsController(
        REPOSITORY,
        publicCollectionsConfig,
        discoveryConfig,
        publicationConfig,
        officialPublicationConfig,
      ),
      createPublicMetricsController(
        REPOSITORY,
        publicMetricsConfig,
        publicationConfig,
        officialPublicationConfig,
      ),
      createPublicSafetyController(
        AuthGuard,
        REPOSITORY,
        publicReportsConfig,
        publicationConfig,
        officialPublicationConfig,
        publicMetricsConfig,
      ),
      createSavedLivesController(
        AuthGuard,
        REPOSITORY,
        savedLivesConfig,
        publicationConfig,
        officialPublicationConfig,
        publicMetricsConfig,
      ),
      createDiscoveryController(
        REPOSITORY,
        discoveryConfig,
        publicationConfig,
        officialPublicationConfig,
      ),
      ...createPublicationControllers(
        AuthGuard,
        REPOSITORY,
        publicationConfig,
        publicMetricsConfig,
      ),
      ...createOfficialPublicationControllers(
        AuthGuard,
        REPOSITORY,
        officialPublicationConfig,
        publicMetricsConfig,
      ),
      createBillingController(AuthGuard, billing),
      ApiController,
      LifeController,
      SharedContextController,
      HealthController,
    ],
    providers: [
      { provide: REPOSITORY, useValue: repo },
      { provide: AUTH, useValue: auth },
      { provide: BILLING, useValue: billing },
      { provide: 'GENERATION_LIMITS', useValue: generationLimits },
      { provide: 'NARRATIVE_CONFIG', useValue: narrativeConfig },
      {
        provide: 'CLOSED_BETA_CONFIG',
        useValue: validateClosedBetaConfig(closedBetaConfig),
      },
      { provide: 'PUBLIC_REVIEW_CONFIG', useValue: publicReviewConfig },
      {
        provide: 'PUBLIC_CONTENT_REVIEW_CONFIG',
        useValue: publicContentReviewConfig,
      },
      { provide: 'PUBLIC_CURATION_ENABLED', useValue: publicCurationEnabled },
      {
        provide: 'PUBLIC_CONTENT_CURATION_ENABLED',
        useValue: publicContentCurationEnabled,
      },
      {
        provide: 'SCENARIO_VERSIONS_ENABLED',
        useValue: scenarioVersionsEnabled,
      },
      AuthGuard,
      {
        provide: 'PUBLIC_FORK_CHECKPOINTS_ENABLED',
        useValue: publicForkCheckpointsEnabled,
      },
      {
        provide: 'PUBLIC_CONTENT_BUNDLES_ENABLED',
        useValue: publicContentBundlesEnabled,
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
  app.use(helmet());
  app.use((request: AuthRequest, response: Response, next: () => void) => {
    request.requestId = randomUUID();
    request.locale = localeFromAcceptLanguage(
      request.headers['accept-language'],
    );
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('CDN-Cache-Control', 'no-store');
    response.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // The Stripe signature covers the exact raw bytes, so this one path is read
  // raw (with its own limit) before the JSON parser, which then skips it.
  app.use(
    BILLING_WEBHOOK_PATH,
    raw({ type: () => true, limit: BILLING_WEBHOOK_LIMIT }),
  );
  app.use(json({ limit: '64kb' }));
  // Checkout holds the user lock and a pool connection across the provider call.
  app.use(
    '/api/v1/billing/checkout',
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (request, response) =>
        response.status(429).json({
          error: {
            code: 'RATE_LIMIT',
            message: errorMessage(
              (request as AuthRequest).locale,
              'RATE_LIMIT',
            ),
          },
        }),
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (request, response) =>
        response.status(429).json({
          error: {
            code: 'RATE_LIMIT',
            message: errorMessage(
              (request as AuthRequest).locale,
              'RATE_LIMIT',
            ),
          },
        }),
    }),
  );
  app.use(
    async (request: AuthRequest, response: Response, next: () => void) => {
      if (
        !closedSiteGate.enabled ||
        publicApiException(request.method, request.path) ||
        (await closedSiteGate.verify(
          typeof request.headers['cf-access-jwt-assertion'] === 'string'
            ? request.headers['cf-access-jwt-assertion']
            : undefined,
        ))
      ) {
        next();
        return;
      }
      response.status(403).json({
        error: {
          code: 'CLOSED_SITE_ACCESS_REQUIRED',
          message: 'Access is by invitation.',
        },
      });
    },
  );
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'Accept-Language',
    ],
  });
  app.useGlobalFilters(new SafeErrorFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('alterward API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
  if (billing.config.enabled) console.log(describeBilling(billing));
  app.enableShutdownHooks();
  return app;
}
