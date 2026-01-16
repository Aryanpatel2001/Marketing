import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';

// Services
import { InvoiceService } from './services/invoice.service';
import { StripeService } from './services/stripe.service';
import { SubscriptionService } from './services/subscription.service';
import { WalletService } from './services/wallet.service';

// Controllers
import { BillingController } from './controllers/billing.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { WalletController } from './controllers/wallet.controller';

// External modules
import { EmailModule } from '../../providers/email/email.module';
import { RedisModule } from '../../providers/redis/redis.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      Invoice,
      PaymentMethod,
      Contact,
      Campaign,
    ]),
    ConfigModule,
    forwardRef(() => TenantsModule),
    RedisModule,
    EmailModule,
  ],
  controllers: [BillingController, WalletController, StripeWebhookController],
  providers: [StripeService, WalletService, SubscriptionService, InvoiceService],
  exports: [StripeService, WalletService, SubscriptionService, InvoiceService],
})
export class BillingModule {}
