import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { CatalogService } from './application/catalog.service';
import { AdminController } from './controllers/admin.controller';
import { PublicMenuController } from './controllers/public-menu.controller';
import { CATALOG_AUTHORIZER, DenyAllAuthorizer } from './domain/authorization';
import { CatalogRepository } from './infrastructure/catalog.repository';
import { CATALOG_POOL, createCatalogPool } from './infrastructure/database';
import { PublicCache } from './infrastructure/public-cache';

@Module({
  controllers: [PublicMenuController, AdminController],
  providers: [
    { provide: CATALOG_POOL, useFactory: createCatalogPool },
    {
      provide: CatalogRepository,
      useFactory: (pool: Pool) => new CatalogRepository(pool),
      inject: [CATALOG_POOL],
    },
    { provide: PublicCache, useFactory: () => new PublicCache() },
    // Deny-by-default hasta que Identity (Spec #2) provea la autoridad real.
    { provide: CATALOG_AUTHORIZER, useClass: DenyAllAuthorizer },
    CatalogService,
  ],
  exports: [CatalogService],
})
export class CatalogModule implements OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_POOL) private readonly pool: Pool,
    @Inject(PublicCache) private readonly cache: PublicCache,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.cache.close();
    await this.pool.end();
  }
}
