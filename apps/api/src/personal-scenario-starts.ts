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
  personalScenarioPrepareRequestSchema,
  personalScenarioPreviewSchema,
  personalScenarioStartRequestSchema,
  personalScenarioStartReceiptSchema,
  personalScenarioAttributionSchema,
  scenarioPersonalizationCapabilitySchema,
} from '@future-flow/contracts';
import {
  Repository,
  PersonalScenarioRepository,
  type PersonalScenarioConfig,
  type PublicScenarioConfig,
} from '@future-flow/database';

export function createPersonalScenarioController(
  guard: Type<CanActivate>,
  token: symbol,
  config: PersonalScenarioConfig,
  publicConfig: PublicScenarioConfig,
): Type {
  @Controller('api/v2/personal-scenarios')
  @UseGuards(guard)
  @ApiBearerAuth()
  class PersonalScenarioController {
    private readonly scenarios: PersonalScenarioRepository;
    constructor(@Inject(token) repo: Repository) {
      this.scenarios = new PersonalScenarioRepository(
        repo.db,
        config,
        publicConfig,
      );
    }
    @Post('sources/:slug/preview')
    @ApiBody({
      schema: z.toJSONSchema(personalScenarioPrepareRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(personalScenarioPreviewSchema) as never,
    })
    prepare(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string | undefined,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.scenarios.prepare(req.userId, slug, body, key ?? '');
    }
    @Get('previews/:id')
    @ApiOkResponse({
      schema: z.toJSONSchema(personalScenarioPreviewSchema) as never,
    })
    preview(
      @Req() req: Request & { userId: string },
      @Param('id') id: string,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.scenarios.preview(req.userId, id);
    }
    @Post('sources/:slug/start')
    @ClosedBetaGeneration()
    @ApiBody({
      schema: z.toJSONSchema(personalScenarioStartRequestSchema) as never,
    })
    @ApiOkResponse({
      schema: z.toJSONSchema(personalScenarioStartReceiptSchema) as never,
    })
    start(
      @Req() req: Request & { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
      @Headers('idempotency-key') key: string | undefined,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.scenarios.start(req.userId, slug, body, key ?? '');
    }
    @Get('lives/:lifeId/attribution')
    @ApiOkResponse({
      schema: z.toJSONSchema(personalScenarioAttributionSchema) as never,
    })
    attribution(
      @Req() req: Request & { userId: string },
      @Param('lifeId') id: string,
      @Query() query: unknown,
    ) {
      z.object({}).strict().parse(query);
      return this.scenarios.attribution(req.userId, id);
    }
  }
  return PersonalScenarioController;
}
export function createScenarioPersonalizationCapabilityController(
  token: symbol,
  config: PersonalScenarioConfig,
  publicConfig: PublicScenarioConfig,
): Type {
  @Controller('api/public/scenario-personalization')
  class CapabilityController {
    private readonly scenarios: PersonalScenarioRepository;
    constructor(@Inject(token) repo: Repository) {
      this.scenarios = new PersonalScenarioRepository(
        repo.db,
        config,
        publicConfig,
      );
    }
    @Get(':slug')
    @ApiOkResponse({
      schema: z.toJSONSchema(scenarioPersonalizationCapabilitySchema) as never,
    })
    read(@Param('slug') slug: string, @Query() query: unknown) {
      z.object({}).strict().parse(query);
      return this.scenarios.capability(slug);
    }
  }
  return CapabilityController;
}
import { ClosedBetaGeneration } from './closed-beta';
