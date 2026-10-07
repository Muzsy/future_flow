import {
  Body,
  Controller,
  Get,
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
} from '@future-flow/contracts';
import {
  Repository,
  PublicForkPermissionRepository,
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
  return [OwnerForkPermissionController, ForkCapabilityController];
}
