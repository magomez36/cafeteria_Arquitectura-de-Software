import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PlatformModule } from './platform/platform.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({ imports: [HealthModule, PlatformModule, IdentityModule, CustomersModule, CatalogModule, PromotionsModule, CartModule, OrdersModule, PaymentsModule, NotificationsModule, ReportsModule] })
export class AppModule {}
