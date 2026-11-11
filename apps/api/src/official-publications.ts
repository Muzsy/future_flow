import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  type CanActivate,
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  idSchema,
  officialPublicationSlugSchema,
  officialPublicationPrepareRequestSchema,
  officialPublicationPreviewSchema,
  officialPublicationConfirmRequestSchema,
  officialPublicationOwnerViewSchema,
  officialPublicationActionRequestSchema,
  officialPublicationReaderSchema,
  officialPublicationStatusSchema,
} from '@future-flow/contracts';
import {
  OfficialPublicationRepository,
  Repository,
  type OfficialPublicationConfig,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from '@future-flow/database';
import type { Request } from 'express';

export function createOfficialPublicationControllers(
  guard: Type<CanActivate>,
  repositoryToken: symbol,
  config: OfficialPublicationConfig,
  metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
): Type[] {
  @Controller('api/v2')
  @UseGuards(guard)
  @ApiBearerAuth()
  class OwnerOfficialPublicationController {
    private readonly publications: OfficialPublicationRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.publications = new OfficialPublicationRepository(
        repo.db,
        config,
        metrics,
      );
    }
    @Get('official-publications')
    @ApiOkResponse({
      schema: z.toJSONSchema(
        z.array(officialPublicationOwnerViewSchema),
      ) as never,
    })
    list(@Req() req: Request & { userId: string }) {
      return this.publications.list(req.userId);
    }
    @Get('public-content-bundles/:id/official-publication')
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationStatusSchema) as never,
    })
    async forBundle(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
    ) {
      return {
        enabled: config.enabled,
        source: await this.publications.sourceForBundle(
          req.userId,
          idSchema.parse(id),
        ),
        publication: await this.publications.forBundle(
          req.userId,
          idSchema.parse(id),
        ),
      };
    }
    @Post('official-publication-previews')
    @ApiBody({
      schema: z.toJSONSchema(officialPublicationPrepareRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationPreviewSchema) as never,
    })
    prepare(
      @Req() req: Request & { userId: string },
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.prepare(req.userId, body, key ?? '');
    }
    @Post('official-publications/confirm')
    @ApiBody({
      schema: z.toJSONSchema(officialPublicationConfirmRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationOwnerViewSchema) as never,
    })
    confirm(
      @Req() req: Request & { userId: string },
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.confirm(req.userId, body, key ?? '');
    }
    @Post('official-publications/:id/withdraw')
    @ApiBody({
      schema: z.toJSONSchema(officialPublicationActionRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationOwnerViewSchema) as never,
    })
    withdraw(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.action(
        req.userId,
        idSchema.parse(id),
        'withdraw',
        body,
        key ?? '',
      );
    }
    @Post('official-publications/:id/rotate-link')
    @ApiBody({
      schema: z.toJSONSchema(officialPublicationActionRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationOwnerViewSchema) as never,
    })
    rotate(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.action(
        req.userId,
        idSchema.parse(id),
        'rotate',
        body,
        key ?? '',
      );
    }
  }
  @Controller('api/public')
  class OfficialPublicationReaderController {
    private readonly publications: OfficialPublicationRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.publications = new OfficialPublicationRepository(
        repo.db,
        config,
        metrics,
      );
    }
    @Get('official-lives/:slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationReaderSchema) as never,
    })
    public(@Param('slug') slug: string) {
      return this.publications.readPublic(
        officialPublicationSlugSchema.parse(slug),
      );
    }
    @Get('official-unlisted')
    @ApiOkResponse({
      schema: z.toJSONSchema(officialPublicationReaderSchema) as never,
    })
    unlisted(@Headers('authorization') authorization: string = '') {
      return this.publications.readUnlisted(
        /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1] ?? '',
      );
    }
  }
  return [
    OwnerOfficialPublicationController,
    OfficialPublicationReaderController,
  ];
}
