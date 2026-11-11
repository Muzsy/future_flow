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
  publicScenarioPrepareRequestSchema,
  publicScenarioPreviewSchema,
  publicScenarioConfirmRequestSchema,
  publicScenarioOwnerSchema,
  publicScenarioReaderSchema,
  scenarioDiscoveryPageSchema,
  parseScenarioDiscoveryWireQuery,
  scenarioPublicationSourceSchema,
  scenarioOwnedPublicationsSchema,
} from '@future-flow/contracts';
import {
  Repository,
  PublicScenarioPublicationRepository,
  type PublicScenarioConfig,
} from '@future-flow/database';

export function createPublicScenarioPublicationControllers(
  guard: Type<CanActivate>,
  token: symbol,
  config: PublicScenarioConfig,
): Type[] {
  @Controller('api/v2/scenario-publications')
  @UseGuards(guard)
  @ApiBearerAuth()
  class ScenarioOwnerController {
    private readonly publications: PublicScenarioPublicationRepository;
    constructor(@Inject(token) repo: Repository) {
      this.publications = new PublicScenarioPublicationRepository(
        repo.db,
        config,
      );
    }
    @Post('versions/:versionId/preview')
    @ApiBody({
      schema: z.toJSONSchema(publicScenarioPrepareRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicScenarioPreviewSchema) as never,
    })
    prepare(
      @Req() req: Request & { userId: string },
      @Param('versionId') id: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string | undefined,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.publications.prepare(
        req.userId,
        z.uuid().parse(id),
        body,
        key ?? '',
      );
    }
    @Post('confirm')
    @ApiBody({
      schema: z.toJSONSchema(publicScenarioConfirmRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(publicScenarioOwnerSchema) as never,
    })
    confirm(
      @Req() req: Request & { userId: string },
      @Body() body: unknown,
      @Headers('idempotency-key') key: string | undefined,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.publications.confirm(req.userId, body, key ?? '');
    }
    @Get(':id')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicScenarioOwnerSchema) as never,
    })
    own(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
      @Query() raw: unknown,
    ) {
      z.object({}).strict().parse(raw);
      return this.publications.own(req.userId, z.uuid().parse(id));
    }
    @Get('versions/:versionId/source')
    @ApiOkResponse({
      schema: z.toJSONSchema(scenarioPublicationSourceSchema) as never,
    })
    source(
      @Req() req: Request & { userId: string },
      @Param('versionId') id: string,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.publications.publicationSource(
        req.userId,
        z.uuid().parse(id),
      );
    }
    @Get('versions/:versionId/publications')
    @ApiOkResponse({
      schema: z.toJSONSchema(scenarioOwnedPublicationsSchema) as never,
    })
    history(
      @Req() req: Request & { userId: string },
      @Param('versionId') id: string,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.publications.forVersion(req.userId, z.uuid().parse(id));
    }
    @Post(':id/withdraw')
    withdraw(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
      @Body() body: unknown,
      @Query() raw: unknown,
    ) {
      z.object({})
        .strict()
        .parse(body ?? {});
      z.object({}).strict().parse(raw);
      return this.publications.withdraw(req.userId, z.uuid().parse(id));
    }
  }
  @Controller('api/public/scenarios')
  class ScenarioReaderController {
    private readonly publications: PublicScenarioPublicationRepository;
    constructor(@Inject(token) repo: Repository) {
      this.publications = new PublicScenarioPublicationRepository(
        repo.db,
        config,
      );
    }
    @Get()
    @ApiOkResponse({
      schema: z.toJSONSchema(scenarioDiscoveryPageSchema) as never,
    })
    list(@Query() raw: unknown) {
      return this.publications.list(parseScenarioDiscoveryWireQuery(raw));
    }
    @Get(':slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicScenarioReaderSchema) as never,
    })
    read(@Param('slug') slug: string, @Query() raw: unknown) {
      z.object({}).strict().parse(raw);
      return this.publications.read(slug);
    }
  }
  return [ScenarioOwnerController, ScenarioReaderController];
}
