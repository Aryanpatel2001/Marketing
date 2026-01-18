import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioOptimizedProvider } from './providers/twilio-optimized.provider';
import { TwilioProviderFactory } from './twilio-provider.factory';
import { SmsService } from './sms.service';
import { EncryptionService } from '@/common/services/encryption.service';
import { TenantSmsSettings } from '@/modules/sms/entities/tenant-sms-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantSmsSettings])],
  providers: [
    TwilioProvider,
    TwilioOptimizedProvider,
    TwilioProviderFactory,
    SmsService,
    EncryptionService,
  ],
  exports: [SmsService, TwilioOptimizedProvider, TwilioProviderFactory],
})
export class SmsModule {}
