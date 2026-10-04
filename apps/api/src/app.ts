import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
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
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { json, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  getQuestionnaire,
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
  enabledLocales,
  betaFeedbackSchema,
  lifeContinueRequestV2Schema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  PublicDraftRepository,
  BetaFeedbackRepository,
} from '@future-flow/database';
import { deleteAccount } from './account-deletion';
import { type AuthProvider, requireRecentAuthentication } from './auth';
import {
  requireEnabledContent,
  requireEnabledLocale,
} from './content-language';

const REPOSITORY = Symbol('REPOSITORY'),
  AUTH = Symbol('AUTH');
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
    return deleteAccount(this.repo, this.auth, req.userId);
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
  constructor(@Inject(REPOSITORY) private readonly repo: Repository) {
    this.publicDrafts = new PublicDraftRepository(repo.db);
    this.lives = new LifeRepository(repo.db, {
      daily: Number(process.env.GENERATION_DAILY_LIMIT ?? 10),
      concurrent: Number(process.env.GENERATION_CONCURRENT_LIMIT ?? 2),
    });
  }
  private async availableBranch(userId: string, id: string) {
    const branch = await this.lives.branch(userId, idSchema.parse(id));
    requireEnabledLocale(branch.content_locale);
    return branch;
  }
  @Get('lives') list(@Req() req: AuthRequest) {
    return this.lives.list(req.userId, enabledLocales);
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
  @Post('lives') create(
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
  @Post('branches/:id/public-preview')
  @ApiOperation({
    summary: 'Prepare an owner-only draft. This does not publish content.',
  })
  @ApiBody({ schema: z.toJSONSchema(publicPreviewRequestSchema) as never })
  async preparePublicPreview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = publicPreviewRequestSchema.parse(body);
    const branch = await this.availableBranch(req.userId, id);
    return this.publicDrafts.prepare(
      req.userId,
      branch.id,
      input.revision,
      input.copy,
    );
  }
  @Get('public-previews/:id')
  async publicPreview(@Req() req: AuthRequest, @Param('id') id: string) {
    const preview = await this.publicDrafts.get(req.userId, idSchema.parse(id));
    requireEnabledLocale(preview.snapshot.locale);
    return preview;
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
  @Post('branches/:id/continue') async continue(
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
  @Post('branches/:id/periods/:periodId/fork') async fork(
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
  @Post('jobs/:id/retry') async retry(
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
) {
  @Module({
    controllers: [ApiController, LifeController, HealthController],
    providers: [
      { provide: REPOSITORY, useValue: repo },
      { provide: AUTH, useValue: auth },
      AuthGuard,
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
    next();
  });
  app.use(json({ limit: '64kb' }));
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
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
  app.enableShutdownHooks();
  return app;
}
