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
  publicExposureRequestSchema,
  publicExposureOwnerViewSchema,
  publicExposureSchema,
  publicExposureSitemapSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicExposureRepository,
  type PublicExposureConfig,
  type PublicationConfig,
} from '@future-flow/database';
export function createPublicExposureControllers(
  guard: Type<CanActivate>,
  token: symbol,
  config: PublicExposureConfig,
  community: PublicationConfig,
  official: PublicationConfig,
): Type[] {
  @Controller('api/v2/public-exposure')
  @UseGuards(guard)
  @ApiBearerAuth()
  class OwnerExposureController {
    private readonly exposure: PublicExposureRepository;
    constructor(@Inject(token) repo: Repository) {
      this.exposure = new PublicExposureRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Get(':slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicExposureOwnerViewSchema) as never,
    })
    view(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.exposure.ownerView(req.userId, slug);
    }
    @Post(':slug')
    @ApiBody({ schema: z.toJSONSchema(publicExposureRequestSchema) as never })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicExposureOwnerViewSchema) as never,
    })
    set(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
    ) {
      return this.exposure.setOwner(req.userId, slug, body);
    }
  }
  @Controller('api/public/external')
  class ExternalExposureController {
    private readonly exposure: PublicExposureRepository;
    constructor(@Inject(token) repo: Repository) {
      this.exposure = new PublicExposureRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Get('sitemap')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicExposureSitemapSchema) as never,
    })
    sitemap(@Query() raw: unknown) {
      const input = z
        .object({
          cursor: z.string().optional(),
          limit: z
            .string()
            .regex(/^[1-9][0-9]{0,2}$/)
            .optional(),
        })
        .strict()
        .parse(raw);
      return this.exposure.sitemap({
        ...input,
        ...(input.limit === undefined ? {} : { limit: Number(input.limit) }),
      });
    }
    @Get(':slug')
    @ApiOkResponse({ schema: z.toJSONSchema(publicExposureSchema) as never })
    project(@Param('slug') slug: string, @Query() raw: unknown) {
      z.object({}).strict().parse(raw);
      return this.exposure.project(slug);
    }
  }
  return [OwnerExposureController, ExternalExposureController];
}
