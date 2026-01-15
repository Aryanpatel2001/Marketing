import { Module } from '@nestjs/common';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioOptimizedProvider } from './providers/twilio-optimized.provider';
import { SmsService } from './sms.service';

@Module({
  imports: [],
  providers: [TwilioProvider, TwilioOptimizedProvider, SmsService],
  exports: [SmsService, TwilioOptimizedProvider],
})
export class SmsModule {}
