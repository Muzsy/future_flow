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
  publicationSlugSchema,
  publicationPrepareRequestSchema,
  publicationPreviewSchema,
  publicationConfirmRequestSchema,
  publicationOwnerViewSchema,
  publicationActionRequestSchema,
  publicationReaderSchema,
  publicationStatusSchema,
} from '@future-flow/contracts';
import {
  PublicationRepository,
  Repository,
  type PublicationConfig,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from '@future-flow/database';
import type { Request } from 'express';

export function createPublicationControllers(
  guard: Type<CanActivate>,
  repositoryToken: symbol,
  config: PublicationConfig,
  metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
): Type[] {
  @Controller('api/v2')
  @UseGuards(guard)
  @ApiBearerAuth()
  class OwnerPublicationController {
    private readonly publications: PublicationRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.publications = new PublicationRepository(repo.db, config, metrics);
    }
    @Get('publications')
    @ApiOkResponse({
      schema: z.toJSONSchema(z.array(publicationOwnerViewSchema)) as never,
    })
    list(@Req() req: Request & { userId: string }) {
      return this.publications.list(req.userId);
    }
    @Get('public-content-bundles/:id/publication')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationStatusSchema) as never,
    })
    async forBundle(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
    ) {
      return {
        enabled: config.enabled,
        publication: await this.publications.forBundle(
          req.userId,
          idSchema.parse(id),
        ),
      };
    }
    @Post('publication-previews')
    @ApiBody({
      schema: z.toJSONSchema(publicationPrepareRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationPreviewSchema) as never,
    })
    prepare(
      @Req() req: Request & { userId: string },
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.prepare(req.userId, body, key ?? '');
    }
    @Post('publications/confirm')
    @ApiBody({
      schema: z.toJSONSchema(publicationConfirmRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationOwnerViewSchema) as never,
    })
    confirm(
      @Req() req: Request & { userId: string },
      @Body() body: unknown,
      @Headers('idempotency-key') key: string,
    ) {
      return this.publications.confirm(req.userId, body, key ?? '');
    }
    @Post('publications/:id/withdraw')
    @ApiBody({
      schema: z.toJSONSchema(publicationActionRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationOwnerViewSchema) as never,
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
    @Post('publications/:id/rotate-link')
    @ApiBody({
      schema: z.toJSONSchema(publicationActionRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicationOwnerViewSchema) as never,
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
  class PublicationReaderController {
    private readonly publications: PublicationRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.publications = new PublicationRepository(repo.db, config, metrics);
    }
    @Get('lives/:slug')
    @ApiOkResponse({ schema: z.toJSONSchema(publicationReaderSchema) as never })
    public(@Param('slug') slug: string) {
      return this.publications.readPublic(publicationSlugSchema.parse(slug));
    }
    @Get('unlisted')
    @ApiOkResponse({ schema: z.toJSONSchema(publicationReaderSchema) as never })
    unlisted(@Headers('authorization') authorization: string = '') {
      return this.publications.readUnlisted(
        /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1] ?? '',
      );
    }
  }
  return [OwnerPublicationController, PublicationReaderController];
}
