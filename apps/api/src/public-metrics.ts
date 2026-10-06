import { Controller, Post, Param, Body, Inject, Headers } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { DomainError } from '@future-flow/core';
import { z } from 'zod';
import {
  publicReadingStartSchema,
  publicReadingSignalSchema,
  publicReadingSessionSchema,
  publicReadingReceiptSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicMetricsRepository,
  type PublicMetricsConfig,
  type PublicationConfig,
} from '@future-flow/database';
export function createPublicMetricsController(
  token: symbol,
  config: PublicMetricsConfig,
  community: PublicationConfig,
  official: PublicationConfig,
) {
  const respectPrivacy = (dnt?: string, gpc?: string) => {
    if (dnt === '1' || gpc === '1')
      throw new DomainError(
        'PUBLIC_METRICS_DISABLED',
        'Reading measurements are unavailable.',
        404,
      );
  };
  @Controller('api/public/reading')
  class PublicMetricsController {
    readonly metrics: PublicMetricsRepository;
    constructor(@Inject(token) repo: Repository) {
      this.metrics = new PublicMetricsRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Post(':slug')
    @ApiBody({ schema: z.toJSONSchema(publicReadingStartSchema) as never })
    @ApiCreatedResponse({
      schema: z.toJSONSchema(publicReadingSessionSchema) as never,
    })
    start(
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Headers('dnt') dnt?: string,
      @Headers('sec-gpc') gpc?: string,
    ) {
      respectPrivacy(dnt, gpc);
      return this.metrics.start(slug, body);
    }
    @Post(':slug/signals')
    @ApiBody({ schema: z.toJSONSchema(publicReadingSignalSchema) as never })
    @ApiCreatedResponse({
      schema: z.toJSONSchema(publicReadingReceiptSchema) as never,
    })
    signal(
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Headers('dnt') dnt?: string,
      @Headers('sec-gpc') gpc?: string,
    ) {
      respectPrivacy(dnt, gpc);
      return this.metrics.signal(slug, body);
    }
  }
  return PublicMetricsController;
}
