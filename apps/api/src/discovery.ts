import { Controller, Get, Inject, Query, type Type } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  discoveryPageSchema,
  parseDiscoveryWireQuery,
} from '@future-flow/contracts';
import {
  DiscoveryRepository,
  Repository,
  type DiscoveryConfig,
  type PublicationConfig,
} from '@future-flow/database';

export function createDiscoveryController(
  repositoryToken: symbol,
  config: DiscoveryConfig,
  community: PublicationConfig,
  official: PublicationConfig,
): Type {
  @Controller('api/public')
  class DiscoveryController {
    private readonly discovery: DiscoveryRepository;
    constructor(@Inject(repositoryToken) repo: Repository) {
      this.discovery = new DiscoveryRepository(
        repo.db,
        config,
        community,
        official,
      );
    }
    @Get('discovery')
    @ApiOkResponse({ schema: z.toJSONSchema(discoveryPageSchema) as never })
    list(@Query() raw: unknown) {
      return this.discovery.list(parseDiscoveryWireQuery(raw));
    }
  }
  return DiscoveryController;
}
