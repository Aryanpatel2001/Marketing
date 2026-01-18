import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import {
  SubscriptionPlan,
  TenantSubscription,
  UsageQuota,
  Wallet,
  WalletTransaction,
  Invoice,
} from './entities';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';

// Services
import {
  StripeService,
  SubscriptionService,
  WalletService,
  UsageService,
  PricingService,
} from './services';

// Controllers
import {
  SubscriptionController,
  WalletController,
  UsageController,
  StripeWebhookController,
} from './controllers';

// Guards
import { BillingGuard, ActiveSubscriptionGuard } from './guards/billing.guard';

// Listeners
import { UsageNotificationListener } from './listeners/usage-notification.listener';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      TenantSubscription,
      UsageQuota,
      Wallet,
      WalletTransaction,
      Invoice,
      Tenant,
    ]),
  ],
  controllers: [SubscriptionController, WalletController, UsageController, StripeWebhookController],
  providers: [
    // Services
    StripeService,
    SubscriptionService,
    WalletService,
    UsageService,
    PricingService,
    // Guards
    BillingGuard,
    ActiveSubscriptionGuard,
    // Listeners
    UsageNotificationListener,
  ],
  exports: [
    // Services for use in other modules
    StripeService,
    SubscriptionService,
    WalletService,
    UsageService,
    PricingService,
    // Guards
    BillingGuard,
    ActiveSubscriptionGuard,
    // TypeORM for entity access
    TypeOrmModule,
  ],
})
export class BillingModule {}
