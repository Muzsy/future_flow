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
  socialProfileSchema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { Repository, SharedContextRepository } from '@future-flow/database';

export type SharedFeatures = {
  enabled: boolean;
  friend: boolean;
  connected: boolean;
  world: boolean;
  inviteSecret?: string;
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
  return {
    enabled: flag('SHARED_CONTEXTS_ENABLED'),
    friend: flag('SHARED_FRIEND_ENABLED'),
    connected: flag('SHARED_CONNECTED_ENABLED'),
    world: flag('SHARED_WORLD_ENABLED'),
    inviteSecret: env.SHARED_INVITE_SIGNING_KEY,
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
    private readonly shared: SharedContextRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.shared = new SharedContextRepository(repo.db, flags.inviteSecret);
    }
    private enabled() {
      if (!flags.enabled || !flags.friend)
        throw new DomainError('NOT_FOUND', 'This feature is unavailable.', 404);
    }
    @Get('social-profile') social(@Req() req: SharedRequest) {
      this.enabled();
      return this.shared.socialProfile(req.userId);
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
  }
  return SharedContextController;
}
