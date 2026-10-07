import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  type CanActivate,
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import {
  publicForkPermissionRequestSchema,
  publicForkPermissionOwnerSchema,
  publicForkCapabilitySchema,
  publicForkStartRequestSchema,
  publicForkStartReceiptSchema,
  publicForkAttributionSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicForkPermissionRepository,
  PublicForkStartRepository,
  type PublicForkPermissionConfig,
  type PublicationConfig,
} from '@future-flow/database';
export function createPublicForkPermissionControllers(
  guard: Type<CanActivate>,
  token: symbol,
  config: PublicForkPermissionConfig,
  community: PublicationConfig,
  official: PublicationConfig,
): Type[] {
  @Controller('api/v2/public-fork-permission')
  @UseGuards(guard)
  @ApiBearerAuth()
  class OwnerForkPermissionController {
    private readonly forks: PublicForkPermissionRepository;
    constructor(@Inject(token) repo: Repository) {
      this.forks = new PublicForkPermissionRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Get(':slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicForkPermissionOwnerSchema) as never,
    })
    own(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.forks.own(req.userId, slug);
    }
    @Post(':slug')
    @ApiBody({
      schema: z.toJSONSchema(publicForkPermissionRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicForkPermissionOwnerSchema) as never,
    })
    set(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.forks.setOwner(req.userId, slug, body);
    }
  }
  @Controller('api/public/fork-capabilities')
  class ForkCapabilityController {
    private readonly forks: PublicForkPermissionRepository;
    constructor(@Inject(token) repo: Repository) {
      this.forks = new PublicForkPermissionRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Get(':slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicForkCapabilitySchema) as never,
    })
    capability(@Param('slug') slug: string, @Query() raw: unknown) {
      z.object({}).strict().parse(raw);
      return this.forks.capability(slug);
    }
  }
  @Controller('api/v2/public-forks')
  @UseGuards(guard)
  @ApiBearerAuth()
  class PublicForkStartController {
    private readonly starts: PublicForkStartRepository;
    constructor(@Inject(token) repo: Repository) {
      this.starts = new PublicForkStartRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Post(':slug')
    @ApiBody({ schema: z.toJSONSchema(publicForkStartRequestSchema) as never })
    @ClosedBetaGeneration()
    @ApiOkResponse({
      schema: z.toJSONSchema(publicForkStartReceiptSchema) as never,
    })
    start(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string | undefined,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.starts.start(req.userId, slug, body, key ?? '');
    }
    @Get('lives/:lifeId/source')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicForkAttributionSchema) as never,
    })
    attribution(
      @Req() req: Request & { userId: string },
      @Param('lifeId') lifeId: string,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.starts.attribution(req.userId, lifeId);
    }
  }
  return [
    OwnerForkPermissionController,
    ForkCapabilityController,
    PublicForkStartController,
  ];
}
import { ClosedBetaGeneration } from './closed-beta';
