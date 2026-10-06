import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Inject,
  UseGuards,
  type Type,
  type CanActivate,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  savedLifeMutationSchema,
  savedLifeStatusSchema,
  savedLivesPageSchema,
  parseSavedLivesWireQuery,
} from '@future-flow/contracts';
import {
  Repository,
  SavedLivesRepository,
  type SavedLivesConfig,
  type PublicationConfig,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from '@future-flow/database';
export function createSavedLivesController(
  guard: Type<CanActivate>,
  token: symbol,
  config: SavedLivesConfig,
  community: PublicationConfig,
  official: PublicationConfig,
  metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
): Type {
  @Controller('api/v2/saved-lives')
  @UseGuards(guard)
  @ApiBearerAuth()
  class SavedLivesController {
    private readonly saved: SavedLivesRepository;
    constructor(@Inject(token) repo: Repository) {
      this.saved = new SavedLivesRepository(
        repo.db,
        config,
        community,
        official,
        metrics,
      );
    }
    @Get()
    @ApiOkResponse({ schema: z.toJSONSchema(savedLivesPageSchema) as never })
    list(@Req() req: { userId: string }, @Query() query: unknown) {
      return this.saved.list(req.userId, parseSavedLivesWireQuery(query));
    }
    @Get(':slug')
    @ApiOkResponse({ schema: z.toJSONSchema(savedLifeStatusSchema) as never })
    status(@Req() req: { userId: string }, @Param('slug') slug: string) {
      return this.saved.getStatus(req.userId, slug);
    }
    @Put(':slug')
    @ApiBody({ schema: z.toJSONSchema(savedLifeMutationSchema) as never })
    @ApiOkResponse({ schema: z.toJSONSchema(savedLifeStatusSchema) as never })
    save(
      @Req() req: { userId: string },
      @Param('slug') slug: string,
      @Body() body: unknown,
    ) {
      savedLifeMutationSchema.parse(body);
      return this.saved.save(req.userId, slug);
    }
    @Delete(':slug')
    @ApiOkResponse({ schema: z.toJSONSchema(savedLifeStatusSchema) as never })
    remove(@Req() req: { userId: string }, @Param('slug') slug: string) {
      return this.saved.remove(req.userId, slug);
    }
  }
  return SavedLivesController;
}
