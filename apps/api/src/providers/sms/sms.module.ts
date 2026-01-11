import { Module } from '@nestjs/common';
import { TwilioProvider } from './providers/twilio.provider';
import { SmsService } from './sms.service';

@Module({
  imports: [],
  providers: [TwilioProvider, SmsService],
  exports: [SmsService],
})
export class SmsModule {}
