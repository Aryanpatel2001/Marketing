import { ContactListMember } from '@/modules/contacts/entities/contact-list-member.entity';
import { Contact } from '@/modules/contacts/entities/contact.entity';
import { SmsModule as SmsSendersModule } from '@/modules/sms/sms.module';
import { EmailModule } from '@/providers/email/email.module';
import { SmsModule } from '@/providers/sms/sms.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SESWebhookController } from './controllers/ses-webhook.controller';
import { SmsWebhookController } from './controllers/sms-webhook.controller';
import { TrackingController } from './controllers/tracking.controller';
import { CampaignEvent } from './entities/campaign-event.entity';
import { CampaignMessage } from './entities/campaign-message.entity';
import { Campaign } from './entities/campaign.entity';
import { InboundSms } from './entities/inbound-sms.entity';
import { SmsDeliveryReceipt } from './entities/sms-delivery-receipt.entity';
import { CampaignSchedulerService } from './services/campaign-scheduler.service';
import { CampaignSendService } from './services/campaign-send.service';
import { CampaignSplitterService } from './services/campaign-splitter.service';
import { CampaignStatsSyncService } from './services/campaign-stats-sync.service';
import { EmailTrackingService } from './services/email-tracking.service';
import { SmsTrackingService } from './services/sms-tracking.service';

// Workers
import { EmailPrepareWorker } from './workers/email-prepare.worker';
import { EmailRetryWorker } from './workers/email-retry.worker';
import { EmailSendWorker } from './workers/email-send.worker';
import { SmsPrepareWorker } from './workers/sms-prepare.worker';
import { SmsRetryWorker } from './workers/sms-retry.worker';
import { SmsSendWorker } from './workers/sms-send.worker';
import { SmsTrackingWorker } from './workers/sms-tracking.worker';
import { TrackingBulkWorker } from './workers/tracking-bulk.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignMessage,
      CampaignEvent,
      Contact,
      ContactListMember,
      SmsDeliveryReceipt,
      InboundSms,
    ]),
    EmailModule,
    SmsModule,
    forwardRef(() => SmsSendersModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [
    CampaignsController,
    TrackingController,
    SESWebhookController,
    SmsWebhookController,
  ],
  providers: [
    // Services
    CampaignsService,
    CampaignSendService,
    CampaignSplitterService,
    EmailTrackingService,
    SmsTrackingService,
    CampaignSchedulerService,
    CampaignStatsSyncService,
    // Workers (queue consumers)
    EmailPrepareWorker,
    EmailSendWorker,
    EmailRetryWorker,
    SmsPrepareWorker,
    SmsSendWorker,
    SmsRetryWorker,
    // SmsBatchWorker, // Disabled: Uses Bull queues which are not configured. System uses RabbitMQ-based workers.
    SmsTrackingWorker,
    TrackingBulkWorker,
  ],
  exports: [
    CampaignsService,
    CampaignSendService,
    CampaignSplitterService,
    EmailTrackingService,
    SmsTrackingService,
    CampaignStatsSyncService,
  ],
})
export class CampaignsModule {}
