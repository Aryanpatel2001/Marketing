import { QueueService } from '@/providers/queue/queue.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';

import { Campaign, CampaignStatus } from '../entities/campaign.entity';
import { CampaignSendService } from './campaign-send.service';

// Helper to get supported timezones (ES2022 Intl.supportedValuesOf may not be available)
function getSupportedTimezones(): Set<string> {
  // Try to use Intl.supportedValuesOf if available (ES2022+)
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    try {
      return new Set((Intl as any).supportedValuesOf('timeZone'));
    } catch {
      // Fall through to validation approach
    }
  }
  // Return empty set - will use validation approach instead
  return new Set<string>();
}

const VALID_TIMEZONES = getSupportedTimezones();

@Injectable()
export class CampaignSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CampaignSchedulerService.name);
  private isProcessing = false;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    private readonly sendService: CampaignSendService,
    private readonly queueService: QueueService
  ) {}

  /**
   * Validate if a timezone string is valid IANA timezone
   */
  isValidTimezone(timezone: string): boolean {
    // If we have the supported timezones list, use it
    if (VALID_TIMEZONES.size > 0) {
      return VALID_TIMEZONES.has(timezone);
    }

    // Fallback: try to use the timezone with Intl.DateTimeFormat
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert a date from one timezone to UTC
   * Used when frontend sends local time instead of UTC
   */
  private convertToUTC(date: Date, timezone: string): Date {
    // Get the time in the target timezone
    const dateString = date.toLocaleString('en-US', { timeZone: timezone });
    const localDate = new Date(dateString);

    // Get the offset between the timezone and UTC
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offset = localDate.getTime() - utcDate.getTime();

    // Return the date adjusted to UTC
    return new Date(date.getTime() - offset);
  }

  /**
   * Format a date in a specific timezone for display
   */
  formatInTimezone(date: Date, timezone: string): string {
    if (!this.isValidTimezone(timezone)) {
      timezone = 'UTC';
    }

    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  /**
   * Check if a scheduled time has passed
   *
   * IMPORTANT: This assumes scheduledAt is stored in UTC.
   * The frontend MUST convert local times to UTC before saving.
   *
   * The timezone field is used for:
   * 1. Display purposes (showing the user when the campaign was scheduled)
   * 2. Validation that a valid timezone was specified
   * 3. Future features like "send at 9am in recipient's timezone"
   */
  private isScheduledTimeReached(campaign: Campaign): boolean {
    if (!campaign.scheduledAt) {
      return false;
    }

    const timezone = campaign.timezone || 'UTC';

    // Validate timezone
    if (!this.isValidTimezone(timezone)) {
      this.logger.warn(
        `Invalid timezone "${timezone}" for campaign ${campaign.id}, defaulting to UTC comparison`
      );
    }

    // PostgreSQL's 'timestamp with time zone' stores values in UTC
    // JavaScript Date objects also work in UTC internally
    // So we can directly compare the stored scheduledAt with current time
    const now = new Date();
    const isReached = now >= campaign.scheduledAt;

    if (isReached) {
      this.logger.debug(
        `Campaign ${campaign.id} scheduled time reached: ` +
          `scheduled=${campaign.scheduledAt.toISOString()} (${this.formatInTimezone(campaign.scheduledAt, timezone)} ${timezone}), ` +
          `now=${now.toISOString()}`
      );
    }

    return isReached;
  }

  onModuleInit() {
    this.logger.log('Campaign Scheduler Service initialized');
    // Run immediately on startup to catch any missed scheduled campaigns
    this.processScheduledCampaigns();
  }

  /**
   * Check for scheduled campaigns every minute
   * This cron job runs every minute to find campaigns whose scheduledAt time has passed
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCampaigns(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Previous scheduling job still running, skipping...');
      return;
    }

    await this.processScheduledCampaigns();
  }

  /**
   * Check for upcoming campaigns to pre-process (every 5 minutes)
   * Finds campaigns scheduled in the next hour and triggers dry-run preparation
   */
  @Cron('*/5 * * * *')
  async handleUpcomingCampaigns(): Promise<void> {
    this.logger.log('Checking for upcoming campaigns to pre-process');

    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Find campaigns scheduled between now and 1h from now
      // that are still in SCHEDULED status (not yet PREPARING or READY)
      const upcomingCampaigns = await this.campaignRepository.find({
        where: {
          status: CampaignStatus.SCHEDULED,
          scheduledAt: Between(now, oneHourFromNow),
        },
      });

      if (upcomingCampaigns.length === 0) {
        return;
      }

      this.logger.log(`Found ${upcomingCampaigns.length} upcoming campaigns to pre-process`);

      for (const campaign of upcomingCampaigns) {
        await this.triggerPreProcessing(campaign);
      }
    } catch (error: any) {
      this.logger.error(`Error processing upcoming campaigns: ${error.message}`, error.stack);
    }
  }

  /**
   * Trigger pre-processing (dry run) for a campaign
   */
  private async triggerPreProcessing(campaign: Campaign): Promise<void> {
    this.logger.log(`[PRE-PROCESSING] Triggering dry-run for campaign ${campaign.id}`);

    try {
      // Publish to prepare queue with isDryRun: true
      await this.queueService.publishEmailPrepare({
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        batchSize: 100,
        isDryRun: true,
      });

      // Update status to prevent re-triggering
      await this.campaignRepository.update(campaign.id, {
        status: CampaignStatus.PREPARING,
      });
    } catch (error: any) {
      this.logger.error(`Failed to trigger pre-processing for ${campaign.id}: ${error.message}`);
    }
  }

  /**
   * Process all campaigns that are due to be sent
   */
  async processScheduledCampaigns(): Promise<void> {
    this.isProcessing = true;

    try {
      const now = new Date();

      // Find all scheduled campaigns that are due
      // We fetch campaigns where scheduledAt <= now (UTC comparison)
      // PostgreSQL stores timestamps with time zone in UTC internally
      const scheduledCampaigns = await this.campaignRepository.find({
        where: [
          {
            status: CampaignStatus.SCHEDULED,
            scheduledAt: LessThanOrEqual(now),
          },
          {
            status: CampaignStatus.READY,
            scheduledAt: LessThanOrEqual(now),
          },
        ],
        order: {
          scheduledAt: 'ASC', // Process oldest first
        },
      });

      if (scheduledCampaigns.length === 0) {
        return;
      }

      this.logger.log(`Found ${scheduledCampaigns.length} scheduled campaign(s) to process`);

      // Filter campaigns that have actually reached their scheduled time
      // (with timezone validation)
      const readyCampaigns = scheduledCampaigns.filter((campaign) => {
        const isReady = this.isScheduledTimeReached(campaign);
        if (!isReady) {
          this.logger.debug(
            `Campaign ${campaign.id} not ready yet (timezone: ${campaign.timezone})`
          );
        }
        return isReady;
      });

      this.logger.log(`${readyCampaigns.length} campaign(s) ready to send`);

      for (const campaign of readyCampaigns) {
        await this.triggerCampaign(campaign);
      }
    } catch (error: any) {
      this.logger.error(`Error processing scheduled campaigns: ${error.message}`, error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Trigger a scheduled campaign to start sending
   */
  private async triggerCampaign(campaign: Campaign): Promise<void> {
    const triggerTime = new Date();
    this.logger.log(
      `[SCHEDULED CAMPAIGN TRIGGER] ID: ${campaign.id} | Name: ${campaign.name} | ` +
        `ScheduledFor: ${campaign.scheduledAt?.toISOString()} (${campaign.timezone || 'UTC'}) | ` +
        `TriggerTime: ${triggerTime.toISOString()}`
    );

    try {
      if (campaign.status === CampaignStatus.READY) {
        // This is a prepared campaign, just release it
        this.logger.log(`[SCHEDULED CAMPAIGN RELEASE] Releasing prepared campaign ${campaign.id}`);
        await this.sendService.releaseCampaign(campaign.tenantId, campaign.id);
      } else {
        // Standard flow (prepare + send)
        this.logger.log(`[SCHEDULED CAMPAIGN TRIGGER] Starting standard flow for ${campaign.id}`);
        await this.sendService.sendCampaign(campaign.tenantId, campaign.id);
      }

      this.logger.log(
        `[SCHEDULED CAMPAIGN STARTED] ID: ${campaign.id} | Timestamp: ${new Date().toISOString()}`
      );
    } catch (error: any) {
      this.logger.error(`Failed to trigger campaign ${campaign.id}: ${error.message}`, error.stack);

      // Mark campaign as failed
      await this.campaignRepository.update(campaign.id, {
        status: CampaignStatus.FAILED,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Get all upcoming scheduled campaigns
   */
  async getUpcomingCampaigns(tenantId?: string): Promise<Campaign[]> {
    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .where('campaign.status = :status', { status: CampaignStatus.SCHEDULED })
      .andWhere('campaign.scheduledAt > :now', { now: new Date() })
      .orderBy('campaign.scheduledAt', 'ASC');

    if (tenantId) {
      query.andWhere('campaign.tenantId = :tenantId', { tenantId });
    }

    return query.getMany();
  }

  /**
   * Get overdue campaigns (scheduled in the past but not yet processed)
   */
  async getOverdueCampaigns(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
    });
  }

  /**
   * Manually trigger processing of scheduled campaigns
   * Useful for admin endpoints or recovery scenarios
   */
  /**
   * Recover stuck messages (every 15 minutes)
   * Finds messages that are in QUEUED state for > 15 minutes and re-queues them
   * This handles edge cases where RabbitMQ publish might have failed after DB update
   */
  @Cron('*/15 * * * *')
  async recoverStuckMessages(): Promise<void> {
    this.logger.log('Checking for stuck messages...');

    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const stuckMessages = await this.messageRepository.find({
        where: {
          status: MessageStatus.QUEUED,
          queuedAt: LessThanOrEqual(fifteenMinutesAgo),
        },
        take: 1000, // Process in batches
        relations: ['contact'],
      });

      if (stuckMessages.length === 0) {
        return;
      }

      this.logger.warn(`Found ${stuckMessages.length} stuck messages. Attempting recovery...`);

      const sendMessages: any[] = [];
      for (const message of stuckMessages) {
        // Skip if campaign is cancelled or failed
        const campaign = await this.campaignRepository.findOne({
          where: { id: message.campaignId },
          select: ['status'],
        });

        if (
          !campaign ||
          [CampaignStatus.CANCELLED, CampaignStatus.FAILED].includes(campaign.status)
        ) {
          continue;
        }

        if (!message.contact?.email) continue;

        sendMessages.push({
          campaignId: message.campaignId,
          tenantId: message.tenantId,
          messageId: message.id,
          contactId: message.contactId,
          email: message.contact.email,
          firstName: message.contact.firstName || undefined,
          lastName: message.contact.lastName || undefined,
          customFields: message.contact.customFields || undefined,
          attempt: message.retryCount + 1,
        });
      }

      if (sendMessages.length > 0) {
        await this.queueService.publishEmailSendBatch(sendMessages);
        this.logger.log(`Recovered and re-queued ${sendMessages.length} messages`);
      }
    } catch (error: any) {
      this.logger.error(`Error recovering stuck messages: ${error.message}`, error.stack);
    }
  }
}
