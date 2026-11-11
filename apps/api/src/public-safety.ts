import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Inject,
  UseGuards,
  type CanActivate,
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  publicReportRequestSchema,
  publicReportReceiptSchema,
  publicSafetyViewSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicSafetyRepository,
  type PublicReportsConfig,
  type PublicationConfig,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from '@future-flow/database';
export function createPublicSafetyController(
  guard: Type<CanActivate>,
  token: symbol,
  config: PublicReportsConfig,
  community: PublicationConfig,
  official: PublicationConfig,
  metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
): Type {
  @Controller('api/v2')
  @UseGuards(guard)
  @ApiBearerAuth()
  class PublicSafetyController {
    private readonly safety: PublicSafetyRepository;
    constructor(@Inject(token) repo: Repository) {
      this.safety = new PublicSafetyRepository(
        repo.db,
        config,
        community,
        official,
        metrics,
      );
    }
    @Post('public-reports/:slug')
    @ApiBody({ schema: z.toJSONSchema(publicReportRequestSchema) as never })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicReportReceiptSchema) as never,
    })
    report(
      @Req() req: { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
    ) {
      return this.safety.report(req.userId, slug, body);
    }
    @Get('public-safety')
    @ApiOkResponse({ schema: z.toJSONSchema(publicSafetyViewSchema) as never })
    own(@Req() req: { userId: string }) {
      return this.safety.ownSafety(req.userId);
    }
  }
  return PublicSafetyController;
}
