import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import {
  ChannelUsageDto,
  CostEstimateRequestDto,
  CostEstimateResponseDto,
  UsageChannel,
  UsageResponseDto,
  UsageSummaryDto,
} from '../dto/usage.dto';
import { TenantSubscription } from '../entities/tenant-subscription.entity';
import { UsageQuota } from '../entities/usage-quota.entity';
import { PricingService } from './pricing.service';
import { WalletService } from './wallet.service';

// Event types for usage notifications
export interface UsageThresholdEvent {
  tenantId: string;
  channel: UsageChannel;
  threshold: 80 | 100;
  used: number;
  limit: number;
  percentUsed: number;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageQuota)
    private readonly usageQuotaRepository: Repository<UsageQuota>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2
  ) {}

  // ==================== USAGE TRACKING ====================

  async getCurrentUsage(tenantId: string): Promise<UsageResponseDto> {
    const quota = await this.getCurrentQuota(tenantId);
    if (!quota) {
      throw new NotFoundException('Usage quota not found');
    }
    return this.mapQuotaToResponse(quota);
  }

  async getCurrentQuota(tenantId: string): Promise<UsageQuota | null> {
    return this.usageQuotaRepository.findOne({
      where: { tenantId, isCurrent: true },
    });
  }

  async getOrCreateCurrentQuota(tenantId: string): Promise<UsageQuota> {
    let quota = await this.getCurrentQuota(tenantId);

    if (!quota) {
      // Get subscription to determine limits
      const subscription = await this.subscriptionRepository.findOne({
        where: { tenantId },
        relations: ['plan'],
      });

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      quota = this.usageQuotaRepository.create({
        tenantId,
        periodStart: now,
        periodEnd,
        smsLimit: subscription?.plan?.smsQuota || 0,
        emailLimit: subscription?.plan?.emailQuota || 0,
        whatsappLimit: subscription?.plan?.whatsappQuota || 0,
        contactsLimit: subscription?.plan?.maxContacts || 100,
        campaignsLimit: subscription?.plan?.maxCampaignsPerMonth || 10,
        isCurrent: true,
      });

      await this.usageQuotaRepository.save(quota);
    }

    return quota;
  }

  async incrementUsage(
    tenantId: string,
    channel: UsageChannel,
    count: number = 1,
    cost: number = 0
  ): Promise<{ withinQuota: boolean; overageCount: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const quota = await queryRunner.manager.findOne(UsageQuota, {
        where: { tenantId, isCurrent: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!quota) {
        throw new NotFoundException('Usage quota not found');
      }

      let withinQuota = true;
      let overageCount = 0;

      switch (channel) {
        case UsageChannel.SMS: {
          const smsRemaining = quota.smsLimit - quota.smsUsed;
          if (count > smsRemaining) {
            overageCount = count - Math.max(0, smsRemaining);
            quota.smsOverage += overageCount;
            withinQuota = false;
          }
          quota.smsUsed += count;
          quota.smsCost = Number(quota.smsCost) + cost;
          break;
        }

        case UsageChannel.EMAIL: {
          const emailRemaining = quota.emailLimit - quota.emailUsed;
          if (count > emailRemaining) {
            overageCount = count - Math.max(0, emailRemaining);
            quota.emailOverage += overageCount;
            withinQuota = false;
          }
          quota.emailUsed += count;
          quota.emailCost = Number(quota.emailCost) + cost;
          break;
        }

        case UsageChannel.WHATSAPP: {
          const whatsappRemaining = quota.whatsappLimit - quota.whatsappUsed;
          if (count > whatsappRemaining) {
            overageCount = count - Math.max(0, whatsappRemaining);
            quota.whatsappOverage += overageCount;
            withinQuota = false;
          }
          quota.whatsappUsed += count;
          quota.whatsappCost = Number(quota.whatsappCost) + cost;
          break;
        }
      }

      quota.totalCost =
        Number(quota.smsCost) + Number(quota.emailCost) + Number(quota.whatsappCost);

      // Check and emit threshold notifications
      await this.checkAndEmitThresholdEvents(queryRunner, quota, channel);

      await queryRunner.manager.save(quota);
      await queryRunner.commitTransaction();

      return { withinQuota, overageCount };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async checkAndEmitThresholdEvents(
    queryRunner: any,
    quota: UsageQuota,
    channel: UsageChannel
  ): Promise<void> {
    let used: number;
    let limit: number;
    let notified80Key: keyof UsageQuota;
    let notified100Key: keyof UsageQuota;

    switch (channel) {
      case UsageChannel.SMS:
        used = quota.smsUsed;
        limit = quota.smsLimit;
        notified80Key = 'sms80Notified';
        notified100Key = 'sms100Notified';
        break;
      case UsageChannel.EMAIL:
        used = quota.emailUsed;
        limit = quota.emailLimit;
        notified80Key = 'email80Notified';
        notified100Key = 'email100Notified';
        break;
      case UsageChannel.WHATSAPP:
        used = quota.whatsappUsed;
        limit = quota.whatsappLimit;
        notified80Key = 'whatsapp80Notified';
        notified100Key = 'whatsapp100Notified';
        break;
      default:
        return;
    }

    if (limit <= 0) return; // Skip if no limit set

    const percentUsed = (used / limit) * 100;

    // Check 100% threshold
    if (percentUsed >= 100 && !quota[notified100Key]) {
      (quota as any)[notified100Key] = true;
      this.eventEmitter.emit('usage.threshold.exceeded', {
        tenantId: quota.tenantId,
        channel,
        threshold: 100,
        used,
        limit,
        percentUsed,
      } as UsageThresholdEvent);
      this.logger.warn(`Tenant ${quota.tenantId} exceeded 100% ${channel} quota: ${used}/${limit}`);
    }
    // Check 80% threshold
    else if (percentUsed >= 80 && !quota[notified80Key]) {
      (quota as any)[notified80Key] = true;
      this.eventEmitter.emit('usage.threshold.warning', {
        tenantId: quota.tenantId,
        channel,
        threshold: 80,
        used,
        limit,
        percentUsed,
      } as UsageThresholdEvent);
      this.logger.log(`Tenant ${quota.tenantId} reached 80% ${channel} quota: ${used}/${limit}`);
    }
  }

  async incrementCampaignUsage(tenantId: string): Promise<boolean> {
    const quota = await this.getCurrentQuota(tenantId);
    if (!quota) return false;

    if (quota.campaignsUsed >= quota.campaignsLimit) {
      return false;
    }

    quota.campaignsUsed += 1;
    await this.usageQuotaRepository.save(quota);
    return true;
  }

  async updateContactCount(tenantId: string, count: number): Promise<void> {
    const quota = await this.getCurrentQuota(tenantId);
    if (quota) {
      quota.contactsUsed = count;
      await this.usageQuotaRepository.save(quota);
    }
  }

  // ==================== QUOTA CHECKS ====================

  async checkQuota(
    tenantId: string,
    channel: UsageChannel,
    count: number
  ): Promise<{ allowed: boolean; quotaRemaining: number; needsWallet: number }> {
    const quota = await this.getCurrentQuota(tenantId);
    if (!quota) {
      return { allowed: false, quotaRemaining: 0, needsWallet: count };
    }

    let used: number;
    let limit: number;

    switch (channel) {
      case UsageChannel.SMS:
        used = quota.smsUsed;
        limit = quota.smsLimit;
        break;
      case UsageChannel.EMAIL:
        used = quota.emailUsed;
        limit = quota.emailLimit;
        break;
      case UsageChannel.WHATSAPP:
        used = quota.whatsappUsed;
        limit = quota.whatsappLimit;
        break;
      default:
        return { allowed: false, quotaRemaining: 0, needsWallet: count };
    }

    const remaining = Math.max(0, limit - used);
    const needsWallet = Math.max(0, count - remaining);

    return {
      allowed: true,
      quotaRemaining: remaining,
      needsWallet,
    };
  }

  async canSendMessages(
    tenantId: string,
    channel: UsageChannel,
    count: number,
    countryCode?: string
  ): Promise<{ canSend: boolean; reason?: string }> {
    // Check quota
    const quotaCheck = await this.checkQuota(tenantId, channel, count);

    if (quotaCheck.needsWallet > 0) {
      // Need to check wallet balance
      const unitPrice = this.pricingService.getUnitPrice(channel, countryCode);
      const walletNeeded = quotaCheck.needsWallet * unitPrice;
      const hasBalance = await this.walletService.hasBalance(tenantId, walletNeeded);

      if (!hasBalance) {
        return {
          canSend: false,
          reason: `Insufficient funds. Need $${walletNeeded.toFixed(2)} for ${quotaCheck.needsWallet} messages beyond quota.`,
        };
      }
    }

    return { canSend: true };
  }

  // ==================== COST ESTIMATION ====================

  async estimateCost(
    tenantId: string,
    dto: CostEstimateRequestDto
  ): Promise<CostEstimateResponseDto> {
    const quotaCheck = await this.checkQuota(tenantId, dto.channel, dto.messageCount);
    const unitPrice = this.pricingService.getUnitPrice(dto.channel, dto.countryCode);
    const walletBalance = await this.walletService.getAvailableBalance(tenantId);

    const fromQuota = Math.min(dto.messageCount, quotaCheck.quotaRemaining);
    const fromWallet = dto.messageCount - fromQuota;
    const estimatedCost = fromWallet * unitPrice;

    return {
      channel: dto.channel,
      messageCount: dto.messageCount,
      quotaRemaining: quotaCheck.quotaRemaining,
      fromQuota,
      fromWallet,
      unitPrice,
      estimatedCost,
      walletBalance,
      hasSufficientFunds: walletBalance >= estimatedCost,
      shortfall: Math.max(0, estimatedCost - walletBalance),
    };
  }

  // ==================== USAGE SUMMARY ====================

  async getUsageSummary(tenantId: string): Promise<UsageSummaryDto> {
    const quota = await this.getCurrentQuota(tenantId);
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
      relations: ['plan'],
    });
    const wallet = await this.walletService.getWallet(tenantId);

    return {
      currentPeriod: quota ? this.mapQuotaToResponse(quota) : null,
      subscription: subscription
        ? {
            plan: subscription.plan?.name || 'Free',
            status: subscription.status,
            renewsAt: subscription.currentPeriodEnd,
          }
        : null,
      wallet: {
        balance: wallet.availableBalance,
        currency: wallet.currency,
      },
    };
  }

  // ==================== QUOTA RESET (CRON) ====================

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAndResetQuotas(): Promise<void> {
    const now = new Date();

    // Find expired quotas
    const expiredQuotas = await this.usageQuotaRepository.find({
      where: {
        isCurrent: true,
        periodEnd: LessThanOrEqual(now),
      },
    });

    for (const quota of expiredQuotas) {
      await this.resetQuota(quota);
    }

    if (expiredQuotas.length > 0) {
      this.logger.log(`Reset ${expiredQuotas.length} expired usage quotas`);
    }
  }

  private async resetQuota(oldQuota: UsageQuota): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Mark old quota as not current
      oldQuota.isCurrent = false;
      await queryRunner.manager.save(oldQuota);

      // Get subscription for new limits
      const subscription = await this.subscriptionRepository.findOne({
        where: { tenantId: oldQuota.tenantId },
        relations: ['plan'],
      });

      // Create new quota period
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const newQuota = this.usageQuotaRepository.create({
        tenantId: oldQuota.tenantId,
        periodStart: now,
        periodEnd,
        smsLimit: subscription?.plan?.smsQuota || oldQuota.smsLimit,
        emailLimit: subscription?.plan?.emailQuota || oldQuota.emailLimit,
        whatsappLimit: subscription?.plan?.whatsappQuota || oldQuota.whatsappLimit,
        contactsLimit: subscription?.plan?.maxContacts || oldQuota.contactsLimit,
        campaignsLimit: subscription?.plan?.maxCampaignsPerMonth || oldQuota.campaignsLimit,
        contactsUsed: oldQuota.contactsUsed, // Contacts persist
        isCurrent: true,
        lastResetAt: now,
      });

      await queryRunner.manager.save(newQuota);
      await queryRunner.commitTransaction();

      this.logger.log(`Reset quota for tenant ${oldQuota.tenantId}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to reset quota: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== HELPERS ====================

  private mapQuotaToResponse(quota: UsageQuota): UsageResponseDto {
    return {
      periodStart: quota.periodStart,
      periodEnd: quota.periodEnd,
      sms: this.mapChannelUsage(
        quota.smsUsed,
        quota.smsLimit,
        quota.smsOverage,
        Number(quota.smsCost)
      ),
      email: this.mapChannelUsage(
        quota.emailUsed,
        quota.emailLimit,
        quota.emailOverage,
        Number(quota.emailCost)
      ),
      whatsapp: this.mapChannelUsage(
        quota.whatsappUsed,
        quota.whatsappLimit,
        quota.whatsappOverage,
        Number(quota.whatsappCost)
      ),
      contacts: {
        used: quota.contactsUsed,
        limit: quota.contactsLimit,
        remaining: Math.max(0, quota.contactsLimit - quota.contactsUsed),
        percentUsed: quota.contactsLimit > 0 ? (quota.contactsUsed / quota.contactsLimit) * 100 : 0,
      },
      campaigns: {
        used: quota.campaignsUsed,
        limit: quota.campaignsLimit,
        remaining: Math.max(0, quota.campaignsLimit - quota.campaignsUsed),
        percentUsed:
          quota.campaignsLimit > 0 ? (quota.campaignsUsed / quota.campaignsLimit) * 100 : 0,
      },
      totalCost: Number(quota.totalCost),
    };
  }

  private mapChannelUsage(
    used: number,
    limit: number,
    overage: number,
    cost: number
  ): ChannelUsageDto {
    return {
      used,
      limit,
      overage,
      remaining: Math.max(0, limit - used),
      percentUsed: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
      cost,
    };
  }
}
