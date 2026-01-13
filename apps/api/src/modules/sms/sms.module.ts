import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { BillingModule } from '../billing/billing.module';
import { SmsModule as SmsProviderModule } from '@/providers/sms/sms.module';
import { CampaignMessage } from '../campaigns/entities/campaign-message.entity';
import { AdminSendersController, SendersController } from './controllers';
import { SmsSender } from './entities';
import { SenderService } from './services';
import { BatchSmsService } from './services/batch-sms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsSender, CampaignMessage]),
    forwardRef(() => TenantsModule),
    forwardRef(() => BillingModule),
    SmsProviderModule,
  ],
  controllers: [SendersController, AdminSendersController],
  providers: [SenderService, BatchSmsService],
  exports: [SenderService, BatchSmsService],
})
export class SmsModule {}
