import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  type CanActivate,
  type Type,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import {
  idSchema,
  sharedCreateRequestSchema,
  sharedInviteRequestSchema,
  sharedAcceptRequestSchema,
  sharedInvitePreviewRequestSchema,
  sharedDeclineRequestSchema,
  sharedRevisionRequestSchema,
  sharedIntentRequestSchema,
  socialProfileSchema,
  sharedBlockRequestSchema,
  sharedReportRequestSchema,
  sharedInviteReportRequestSchema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { Repository, SharedSafetyRepository } from '@future-flow/database';

export type SharedFeatures = {
  enabled: boolean;
  friend: boolean;
  connected: boolean;
  world: boolean;
  inviteSecret?: string;
  decisionDeadlineSeconds?: number | null;
  generationLimits?: { daily: number; concurrent: number };
};
export function sharedFeaturesFromEnv(
  env: Record<string, string | undefined> = process.env,
): SharedFeatures {
  const flag = (name: string) => {
    const value = env[name] ?? 'false';
    if (!['true', 'false'].includes(value))
      throw new Error(`${name} must be true or false`);
    return value === 'true';
  };
  const rawDeadline = env.SHARED_DECISION_DEADLINE_SECONDS;
  const generationLimits = {
    daily: Number(env.SHARED_GENERATION_DAILY_LIMIT ?? 3),
    concurrent: Number(env.SHARED_GENERATION_CONCURRENT_LIMIT ?? 1),
  };
  if (
    !Number.isInteger(generationLimits.daily) ||
    generationLimits.daily < 1 ||
    !Number.isInteger(generationLimits.concurrent) ||
    generationLimits.concurrent < 1
  )
    throw new Error('Invalid Shared generation limits');
  const decisionDeadlineSeconds =
    rawDeadline === undefined || rawDeadline === ''
      ? null
      : Number(rawDeadline);
  if (
    decisionDeadlineSeconds !== null &&
    (!Number.isInteger(decisionDeadlineSeconds) ||
      decisionDeadlineSeconds < 60 ||
      decisionDeadlineSeconds > 604800)
  )
    throw new Error(
      'SHARED_DECISION_DEADLINE_SECONDS must be 60–604800 or empty',
    );
  return {
    enabled: flag('SHARED_CONTEXTS_ENABLED'),
    friend: flag('SHARED_FRIEND_ENABLED'),
    connected: flag('SHARED_CONNECTED_ENABLED'),
    world: flag('SHARED_WORLD_ENABLED'),
    inviteSecret: env.SHARED_INVITE_SIGNING_KEY,
    decisionDeadlineSeconds,
    generationLimits,
  };
}
type SharedRequest = Request & { userId: string };
const idempotency = { name: 'Idempotency-Key', required: true };
export function createSharedContextController(
  authGuard: Type<CanActivate>,
  repositoryToken: symbol,
  flags: SharedFeatures,
): Type<object> {
  @Controller('api/v2')
  @UseGuards(authGuard)
  @ApiBearerAuth()
  class SharedContextController {
    private readonly shared: SharedSafetyRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.shared = new SharedSafetyRepository(
        repo.db,
        flags.inviteSecret,
        180,
        flags.decisionDeadlineSeconds ?? null,
        flags.generationLimits,
      );
    }
    private enabled() {
      if (!flags.enabled || !flags.friend)
        throw new DomainError('NOT_FOUND', 'This feature is unavailable.', 404);
    }
    @Get('shared-capabilities')
    @ApiOperation({
      summary: 'Read the server-controlled availability of Connections.',
    })
    capabilities() {
      return { friendEnabled: flags.enabled && flags.friend };
    }
    @Get('social-profile') social(@Req() req: SharedRequest) {
      this.enabled();
      return this.shared.socialProfile(req.userId);
    }
    @Get('shared-contexts/:id/safety')
    safety(@Req() req: SharedRequest, @Param('id') id: string) {
      this.enabled();
      return this.shared.safety(req.userId, idSchema.parse(id));
    }
    @Post('shared-contexts/:id/block')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedBlockRequestSchema) as never })
    block(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.setBlock(
        req.userId,
        idSchema.parse(id),
        sharedBlockRequestSchema.parse(body),
        true,
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/unblock')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedBlockRequestSchema) as never })
    unblock(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.setBlock(
        req.userId,
        idSchema.parse(id),
        sharedBlockRequestSchema.parse(body),
        false,
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/reports')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedReportRequestSchema) as never })
    report(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.report(
        req.userId,
        idSchema.parse(id),
        sharedReportRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Post('shared-invites/reports')
    @ApiHeader(idempotency)
    @ApiBody({
      schema: z.toJSONSchema(sharedInviteReportRequestSchema) as never,
    })
    reportInvite(
      @Req() req: SharedRequest,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.reportInvite(
        req.userId,
        sharedInviteReportRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Put('social-profile')
    @ApiBody({ schema: z.toJSONSchema(socialProfileSchema) as never })
    saveSocial(@Req() req: SharedRequest, @Body() body: unknown) {
      this.enabled();
      return this.shared.saveSocialProfile(req.userId, body);
    }
    @Get('shared-contexts') list(@Req() req: SharedRequest) {
      this.enabled();
      return this.shared.list(req.userId);
    }
    @Post('shared-contexts')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedCreateRequestSchema) as never })
    @ApiOperation({
      summary:
        'Disabled foundation: bind your own branch to a private friend context.',
    })
    create(
      @Req() req: SharedRequest,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.create(
        req.userId,
        sharedCreateRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Get('shared-contexts/:id') detail(
      @Req() req: SharedRequest,
      @Param('id') id: string,
    ) {
      this.enabled();
      return this.shared.detail(req.userId, idSchema.parse(id));
    }
    @Post('shared-contexts/:id/continue')
    @ClosedBetaGeneration()
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    @ApiOperation({
      summary: 'Queue one English AI opportunity for a private friend group.',
    })
    continueGroup(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      const input = sharedRevisionRequestSchema.parse(body);
      return this.shared.enqueue(
        req.userId,
        idSchema.parse(id),
        input.contextRevision,
        key ?? '',
      );
    }
    @Get('shared-jobs/:id') sharedJob(
      @Req() req: SharedRequest,
      @Param('id') id: string,
    ) {
      this.enabled();
      return this.shared.job(req.userId, idSchema.parse(id));
    }
    @Post('shared-contexts/:id/invites')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedInviteRequestSchema) as never })
    invite(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.createInvite(
        req.userId,
        idSchema.parse(id),
        sharedInviteRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Get('shared-invites') invitations(@Req() req: SharedRequest) {
      this.enabled();
      return this.shared.listInvites(req.userId);
    }
    @Post('shared-invites/preview')
    @ApiBody({
      schema: z.toJSONSchema(sharedInvitePreviewRequestSchema) as never,
    })
    @ApiOperation({
      summary:
        'Authenticated preview; keep bearer tokens out of URL/access logs.',
    })
    preview(@Req() req: SharedRequest, @Body() body: unknown) {
      this.enabled();
      return this.shared.previewInvite(
        req.userId,
        sharedInvitePreviewRequestSchema.parse(body).token,
      );
    }
    @Post('shared-invites/:id/accept')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedAcceptRequestSchema) as never })
    accept(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.acceptInvite(
        req.userId,
        idSchema.parse(id),
        sharedAcceptRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Post('shared-invites/:id/decline')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedDeclineRequestSchema) as never })
    decline(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.declineInvite(
        req.userId,
        idSchema.parse(id),
        sharedDeclineRequestSchema.parse(body).token,
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/leave')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    leave(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.lifecycle(
        req.userId,
        idSchema.parse(id),
        sharedRevisionRequestSchema.parse(body).contextRevision,
        'leave',
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/end')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    end(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.lifecycle(
        req.userId,
        idSchema.parse(id),
        sharedRevisionRequestSchema.parse(body).contextRevision,
        'end',
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/archive')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    archive(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.lifecycle(
        req.userId,
        idSchema.parse(id),
        sharedRevisionRequestSchema.parse(body).contextRevision,
        'archive',
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/invites/:inviteId/revoke')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    revoke(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Param('inviteId') inviteId: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.revokeInvite(
        req.userId,
        idSchema.parse(id),
        idSchema.parse(inviteId),
        sharedRevisionRequestSchema.parse(body).contextRevision,
        key ?? '',
      );
    }
    @Get('shared-contexts/:id/events') events(
      @Req() req: SharedRequest,
      @Param('id') id: string,
    ) {
      this.enabled();
      return this.shared.events(req.userId, idSchema.parse(id));
    }
    @Post('shared-contexts/:id/events/:eventId/intents')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedIntentRequestSchema) as never })
    intent(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Param('eventId') eventId: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.submitIntent(
        req.userId,
        idSchema.parse(id),
        idSchema.parse(eventId),
        sharedIntentRequestSchema.parse(body),
        key ?? '',
      );
    }
    @Post('shared-contexts/:id/events/:eventId/resolve')
    @ApiHeader(idempotency)
    @ApiBody({ schema: z.toJSONSchema(sharedRevisionRequestSchema) as never })
    resolve(
      @Req() req: SharedRequest,
      @Param('id') id: string,
      @Param('eventId') eventId: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      this.enabled();
      return this.shared.resolvePending(
        req.userId,
        idSchema.parse(id),
        idSchema.parse(eventId),
        sharedRevisionRequestSchema.parse(body).contextRevision,
        key ?? '',
      );
    }
    @Get('branches/:id/shared-impacts') impacts(
      @Req() req: SharedRequest,
      @Param('id') id: string,
    ) {
      this.enabled();
      return this.shared.pendingImpacts(req.userId, idSchema.parse(id));
    }
  }
  return SharedContextController;
}
import { ClosedBetaGeneration } from './closed-beta';
