import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantsModule } from '../tenants/tenants.module';
import { SmsModule as SmsProviderModule } from '@/providers/sms/sms.module';
import { CampaignMessage } from '../campaigns/entities/campaign-message.entity';
import {
  AdminSendersController,
  SendersController,
  SmsSettingsController,
  ComplianceController,
} from './controllers';
import { SmsSender, TenantSmsSettings, TenantComplianceStatus } from './entities';
import {
  SenderService,
  SmsSettingsService,
  ComplianceService,
  UsComplianceService,
  EuComplianceService,
} from './services';
import { EncryptionService } from '@/common/services/encryption.service';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SmsSender,
      CampaignMessage,
      TenantSmsSettings,
      TenantComplianceStatus,
      Tenant,
    ]),
    forwardRef(() => TenantsModule),
    SmsProviderModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    SendersController,
    AdminSendersController,
    SmsSettingsController,
    ComplianceController,
  ],
  providers: [
    SenderService,
    SmsSettingsService,
    ComplianceService,
    UsComplianceService,
    EuComplianceService,
    EncryptionService,
  ],
  exports: [
    SenderService,
    SmsSettingsService,
    ComplianceService,
    UsComplianceService,
    EuComplianceService,
  ],
})
export class SmsModule {}
