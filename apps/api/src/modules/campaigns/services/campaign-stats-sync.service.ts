import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConsumeMessage } from 'amqplib';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCounterService, CampaignStats } from '@/providers/redis/redis-counter.service';
import { RedisService } from '@/providers/redis/redis.service';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';
import { QUEUES, StatsSyncMessage } from '@/providers/queue/queue.constants';

/**
 * Campaign Stats Sync Service
 *
 * Periodically syncs campaign statistics from Redis to PostgreSQL.
 * This ensures data durability while maintaining high performance
 * through Redis counters.
 */
@Injectable()
export class CampaignStatsSyncService implements OnModuleInit {
  private readonly logger = new Logger(CampaignStatsSyncService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService,
    private readonly redisService: RedisService
  ) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.startConsuming(), 2000);
  }

  /**
   * Start consuming stats sync messages
   */
  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(5);

      await channel.consume(
        QUEUES.STATS_SYNC.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: StatsSyncMessage = JSON.parse(msg.content.toString());
            await this.syncCampaignStats(message.campaignId);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing stats sync: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('Campaign Stats Sync Service started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Sync stats for a specific campaign
   */
  async syncCampaignStats(campaignId: string): Promise<void> {
    try {
      const stats = await this.counterService.getCampaignStats(campaignId);
      if (!stats) {
        this.logger.debug(`No Redis stats found for campaign ${campaignId}`);
        return;
      }

      // Get unique counts from Redis sets
      const uniqueOpens = await this.counterService.getUniqueOpenCount(campaignId);
      const uniqueClicks = await this.counterService.getUniqueClickCount(campaignId);

      // Update campaign in database
      await this.campaignRepository.update(campaignId, {
        sentCount: stats.sent,
        failedCount: stats.failed,
        openedCount: stats.opened,
        uniqueOpens,
        clickedCount: stats.clicked,
        uniqueClicks,
        unsubscribedCount: stats.unsubscribed,
        bouncedCount: stats.bounced,
        complainedCount: stats.complained,
      });

      this.logger.debug(`Synced stats for campaign ${campaignId}`);
    } catch (error: any) {
      this.logger.error(`Error syncing stats for campaign ${campaignId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cron job to sync all active campaign stats every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async syncActiveCampaigns(): Promise<void> {
    try {
      // Find all campaigns in SENDING status
      const activeCampaigns = await this.campaignRepository.find({
        where: { status: CampaignStatus.SENDING },
        select: ['id'],
      });

      if (activeCampaigns.length === 0) return;

      this.logger.debug(`Syncing stats for ${activeCampaigns.length} active campaigns`);

      for (const campaign of activeCampaigns) {
        await this.syncCampaignStats(campaign.id);
      }
    } catch (error: any) {
      this.logger.error(`Error in sync cron: ${error.message}`);
    }
  }

  /**
   * Cron job to sync recently completed campaigns (last hour)
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncRecentlyCompletedCampaigns(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const recentCampaigns = await this.campaignRepository
        .createQueryBuilder('campaign')
        .where('campaign.status = :status', { status: CampaignStatus.SENT })
        .andWhere('campaign.completedAt >= :since', { since: oneHourAgo })
        .select(['campaign.id'])
        .getMany();

      if (recentCampaigns.length === 0) return;

      this.logger.debug(`Syncing stats for ${recentCampaigns.length} recently completed campaigns`);

      for (const campaign of recentCampaigns) {
        await this.syncCampaignStats(campaign.id);
      }
    } catch (error: any) {
      this.logger.error(`Error syncing recently completed: ${error.message}`);
    }
  }

  /**
   * Cleanup old Redis stats for completed campaigns
   * Runs daily at 3 AM
   */
  @Cron('0 3 * * *')
  async cleanupOldStats(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find campaigns completed more than 7 days ago
      const oldCampaigns = await this.campaignRepository
        .createQueryBuilder('campaign')
        .where('campaign.status IN (:...statuses)', {
          statuses: [CampaignStatus.SENT, CampaignStatus.CANCELLED, CampaignStatus.FAILED],
        })
        .andWhere('campaign.completedAt < :cutoff', { cutoff: sevenDaysAgo })
        .select(['campaign.id'])
        .getMany();

      if (oldCampaigns.length === 0) return;

      this.logger.log(`Cleaning up Redis stats for ${oldCampaigns.length} old campaigns`);

      for (const campaign of oldCampaigns) {
        await this.cleanupCampaignRedisData(campaign.id);
      }

      this.logger.log('Old campaign stats cleanup completed');
    } catch (error: any) {
      this.logger.error(`Error in cleanup cron: ${error.message}`);
    }
  }

  /**
   * Clean up all Redis data for a campaign
   */
  private async cleanupCampaignRedisData(campaignId: string): Promise<void> {
    try {
      // Delete stats hash
      await this.counterService.deleteCampaignStats(campaignId);

      // Delete tracking sets
      await this.redisService.del(`tracking:opens:${campaignId}`);
      await this.redisService.del(`tracking:clicks:${campaignId}`);

      // Delete progress cache
      await this.redisService.del(`campaign:progress:${campaignId}`);

      this.logger.debug(`Cleaned up Redis data for campaign ${campaignId}`);
    } catch (error: any) {
      this.logger.error(`Error cleaning up Redis for campaign ${campaignId}: ${error.message}`);
    }
  }

  /**
   * Manual sync for a specific campaign
   */
  async triggerSync(campaignId: string, tenantId: string): Promise<void> {
    await this.queueService.publishStatsSync(campaignId, tenantId);
  }

  /**
   * Get real-time stats from Redis (faster than DB)
   */
  async getRealTimeStats(campaignId: string): Promise<CampaignStats | null> {
    return this.counterService.getCampaignStats(campaignId);
  }

  /**
   * Get combined stats (Redis + DB fallback)
   */
  async getCombinedStats(campaignId: string): Promise<CampaignStats | null> {
    // Try Redis first
    const redisStats = await this.counterService.getCampaignStats(campaignId);
    if (redisStats) {
      return redisStats;
    }

    // Fall back to database
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
      select: [
        'sentCount',
        'failedCount',
        'openedCount',
        'clickedCount',
        'unsubscribedCount',
        'bouncedCount',
        'complainedCount',
      ],
    });

    if (!campaign) return null;

    return {
      sent: campaign.sentCount,
      failed: campaign.failedCount,
      opened: campaign.openedCount,
      clicked: campaign.clickedCount,
      unsubscribed: campaign.unsubscribedCount,
      bounced: campaign.bouncedCount,
      complained: campaign.complainedCount,
    };
  }
}
