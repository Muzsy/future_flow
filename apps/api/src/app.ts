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
  questionnaire,
  draftRequestSchema,
  futureRequestSchema,
  resolveDecisionSchema,
  idSchema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { Repository } from '@future-flow/database';
import { type AuthProvider, requireRecentAuthentication } from './auth';

const REPOSITORY = Symbol('REPOSITORY'),
  AUTH = Symbol('AUTH');
type AuthRequest = Request & {
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
    const message =
      error instanceof DomainError
        ? error.message
        : error instanceof z.ZodError
          ? 'Ellenőrizd a megadott adatokat.'
          : 'A kérés nem sikerült.';
    const details =
      error instanceof z.ZodError
        ? {
            fields: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
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
  questions() {
    return questionnaire;
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
    return this.repo.listFutures(req.userId);
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
    );
  }
  @Get('futures/:id')
  future(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.repo.future(req.userId, idSchema.parse(id));
  }
  @Get('jobs/:id')
  job(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.repo.job(req.userId, idSchema.parse(id));
  }
  @Get('branches/:id')
  branch(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.repo.branch(req.userId, idSchema.parse(id));
  }
  @Get('branches/:id/timeline')
  timeline(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.repo.timeline(req.userId, idSchema.parse(id));
  }
  @Post('decisions/:id/resolve')
  @ApiBody({ schema: z.toJSONSchema(resolveDecisionSchema) as never })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 8, maxLength: 100 },
  })
  resolve(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const input = resolveDecisionSchema.parse(body);
    return this.repo.resolveDecision(
      req.userId,
      idSchema.parse(id),
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
    z.object({ confirmation: z.literal('FIÓK TÖRLÉSE') })
      .strict()
      .parse(body);
    requireRecentAuthentication(req.token);
    await this.repo.markDeleting(req.userId);
    try {
      await this.auth.deleteUser(req.userId);
    } catch (error) {
      await this.repo.restoreActive(req.userId);
      throw error;
    }
    await this.repo.deleteAccountData(req.userId);
    return { deleted: true };
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
) {
  @Module({
    controllers: [ApiController, HealthController],
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
  app.use(helmet());
  app.use((request: AuthRequest, response: Response, next: () => void) => {
    request.requestId = randomUUID();
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
      message: {
        error: {
          code: 'RATE_LIMIT',
          message: 'Túl sok kérés. Próbáld meg egy perc múlva.',
        },
      },
    }),
  );
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
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
