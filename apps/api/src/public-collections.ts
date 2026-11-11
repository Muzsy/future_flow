import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  type Type,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { publicCollectionPageSchema } from '@future-flow/contracts';
import {
  Repository,
  PublicCollectionsRepository,
  type PublicCollectionsConfig,
  type DiscoveryConfig,
  type PublicationConfig,
} from '@future-flow/database';
export function createPublicCollectionsController(
  token: symbol,
  config: PublicCollectionsConfig,
  discovery: DiscoveryConfig,
  community: PublicationConfig,
  official: PublicationConfig,
): Type {
  @Controller('api/public/collections')
  class PublicCollectionsController {
    private readonly collections: PublicCollectionsRepository;
    constructor(@Inject(token) repo: Repository) {
      this.collections = new PublicCollectionsRepository(
        repo.db,
        config,
        discovery,
        community,
        official,
      );
    }
    @Get(':collectionId')
    @ApiOkResponse({
      schema: z.toJSONSchema(publicCollectionPageSchema) as never,
    })
    list(@Param('collectionId') key: string, @Query() raw: unknown) {
      z.object({}).strict().parse(raw);
      return this.collections.list(key);
    }
  }
  return PublicCollectionsController;
}
