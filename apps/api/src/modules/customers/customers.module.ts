import { Module } from '@nestjs/common';
import { CustomersService, type CustomersDeps } from './application/customers-service';
import { CustomerGuard, CustomersController } from './controllers/customers.controller';
import { customersKey } from './infrastructure/crypto';
import {
  CustomersConnections,
  PendingOrdersHistory,
  PgConsentRepository,
  PgCustomerRepository,
  PgDataInventoryRepository,
  PgRightsRequestRepository,
  RedisErasureQueue,
  RedisSessionReader,
} from './infrastructure/adapters';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersConnections,
    {
      provide: CustomersService,
      inject: [CustomersConnections],
      useFactory: (connections: CustomersConnections): CustomersService => {
        const deps: CustomersDeps = {
          customers: new PgCustomerRepository(connections.pool, customersKey()),
          consents: new PgConsentRepository(connections.pool),
          requests: new PgRightsRequestRepository(connections.pool),
          inventory: new PgDataInventoryRepository(connections.pool),
          sessions: new RedisSessionReader(connections),
          orders: new PendingOrdersHistory(),
          erasure: new RedisErasureQueue(connections),
        };
        return new CustomersService(deps);
      },
    },
    CustomerGuard,
  ],
})
export class CustomersModule {}
