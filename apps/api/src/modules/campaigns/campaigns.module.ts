import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsController } from './campaigns.controller';
import { TrackingController } from './controllers/tracking.controller';
import { SESWebhookController } from './controllers/ses-webhook.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignSendService } from './services/campaign-send.service';
import { EmailTrackingService } from './services/email-tracking.service';
import { CampaignSchedulerService } from './services/campaign-scheduler.service';
import { CampaignStatsSyncService } from './services/campaign-stats-sync.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignMessage } from './entities/campaign-message.entity';
import { CampaignEvent } from './entities/campaign-event.entity';
import { Contact } from '@/modules/contacts/entities/contact.entity';
import { ContactListMember } from '@/modules/contacts/entities/contact-list-member.entity';
import { EmailModule } from '@/providers/email/email.module';

// Workers
import { EmailPrepareWorker } from './workers/email-prepare.worker';
import { EmailSendWorker } from './workers/email-send.worker';
import { EmailRetryWorker } from './workers/email-retry.worker';
import { TrackingBulkWorker } from './workers/tracking-bulk.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignMessage,
      CampaignEvent,
      Contact,
      ContactListMember,
    ]),
    EmailModule,
  ],
  controllers: [CampaignsController, TrackingController, SESWebhookController],
  providers: [
    // Services
    CampaignsService,
    CampaignSendService,
    EmailTrackingService,
    CampaignSchedulerService,
    CampaignStatsSyncService,
    // Workers (queue consumers)
    EmailPrepareWorker,
    EmailSendWorker,
    EmailRetryWorker,
    TrackingBulkWorker,
  ],
  exports: [CampaignsService, CampaignSendService, EmailTrackingService, CampaignStatsSyncService],
})
export class CampaignsModule {}
