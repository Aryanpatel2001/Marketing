import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { UsageThresholdEvent } from '../services/usage.service';

@Injectable()
export class UsageNotificationListener {
  private readonly logger = new Logger(UsageNotificationListener.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>
  ) {}

  @OnEvent('usage.threshold.warning')
  async handleUsageWarning(event: UsageThresholdEvent): Promise<void> {
    this.logger.log(
      `Usage warning: Tenant ${event.tenantId} reached ${event.threshold}% of ${event.channel} quota`
    );

    try {
      const tenant = await this.tenantRepository.findOne({
        where: { id: event.tenantId },
      });

      if (!tenant) {
        this.logger.warn(`Tenant ${event.tenantId} not found for notification`);
        return;
      }

      // TODO: Send email notification
      // For now, just log the notification
      this.logger.log(
        `[NOTIFICATION] Would send email to tenant ${tenant.name}: ` +
          `You've used ${event.percentUsed.toFixed(1)}% of your ${event.channel.toUpperCase()} quota. ` +
          `${event.used} of ${event.limit} messages used.`
      );

      // In a real implementation, you would:
      // 1. Get tenant admin email
      // 2. Send email via EmailService
      // 3. Create in-app notification
      // await this.emailService.sendUsageWarningEmail({
      //   to: tenant.email,
      //   channel: event.channel,
      //   percentUsed: event.percentUsed,
      //   used: event.used,
      //   limit: event.limit,
      // });
    } catch (error) {
      this.logger.error(`Failed to send usage warning notification: ${error.message}`);
    }
  }

  @OnEvent('usage.threshold.exceeded')
  async handleUsageExceeded(event: UsageThresholdEvent): Promise<void> {
    this.logger.warn(
      `Usage exceeded: Tenant ${event.tenantId} exceeded 100% of ${event.channel} quota`
    );

    try {
      const tenant = await this.tenantRepository.findOne({
        where: { id: event.tenantId },
      });

      if (!tenant) {
        this.logger.warn(`Tenant ${event.tenantId} not found for notification`);
        return;
      }

      // TODO: Send urgent email notification
      this.logger.warn(
        `[URGENT NOTIFICATION] Would send email to tenant ${tenant.name}: ` +
          `You've exceeded your ${event.channel.toUpperCase()} quota! ` +
          `${event.used} of ${event.limit} messages used. ` +
          `Additional messages will be charged from your wallet balance.`
      );

      // In a real implementation:
      // await this.emailService.sendUsageExceededEmail({
      //   to: tenant.email,
      //   channel: event.channel,
      //   used: event.used,
      //   limit: event.limit,
      //   overage: event.used - event.limit,
      // });
    } catch (error) {
      this.logger.error(`Failed to send usage exceeded notification: ${error.message}`);
    }
  }
}
