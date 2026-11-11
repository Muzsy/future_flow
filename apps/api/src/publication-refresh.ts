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
  publicationRefreshRequestSchema,
  publicationRefreshTargetsSchema,
  publicationRefreshReceiptSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicationRefreshRepository,
  type PublicationRefreshConfig,
  type PublicationConfig,
  type PublicMetricsConfig,
} from '@future-flow/database';
export function createPublicationRefreshController(
  guard: Type<CanActivate>,
  token: symbol,
  config: PublicationRefreshConfig,
  community: PublicationConfig,
  official: PublicationConfig,
  metrics: PublicMetricsConfig,
): Type {
  @Controller('api/v2/publication-refresh')
  @UseGuards(guard)
  @ApiBearerAuth()
  class PublicationRefreshController {
    private readonly refreshes: PublicationRefreshRepository;
    constructor(@Inject(token) repo: Repository) {
      this.refreshes = new PublicationRefreshRepository(
        repo.db,
        config,
        community,
        official,
        metrics,
      );
    }
    @Get(':origin/bundles/:bundleId/targets')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationRefreshTargetsSchema) as never,
    })
    targets(
      @Req() req: Request & { userId: string },
      @Param('origin') origin: string,
      @Param('bundleId') bundleId: string,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.refreshes.targets(req.userId, bundleId, origin);
    }
    @Post(':origin')
    @ApiBody({
      schema: z.toJSONSchema(publicationRefreshRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationRefreshReceiptSchema) as never,
    })
    apply(
      @Req() req: Request & { userId: string },
      @Param('origin') origin: string,
      @Body() raw: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.refreshes.refresh(req.userId, origin, raw, key ?? '');
    }
  }
  return PublicationRefreshController;
}
