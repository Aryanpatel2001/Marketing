import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsageService } from '../services/usage.service';
import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionStatus } from '../entities/tenant-subscription.entity';
import { UsageChannel } from '../dto/usage.dto';

export const BILLING_CHECK_KEY = 'billing_check';
export const QUOTA_CHECK_KEY = 'quota_check';

export interface BillingCheckOptions {
  requireActiveSubscription?: boolean;
  channel?: UsageChannel;
  messageCountParam?: string;
}

export interface QuotaCheckOptions {
  channel: UsageChannel;
  countParam?: string;
  countryCodeParam?: string;
}

export const BillingCheck = (options: BillingCheckOptions = {}) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(BILLING_CHECK_KEY, options, descriptor?.value || target);
    return descriptor;
  };
};

export const QuotaCheck = (options: QuotaCheckOptions) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(QUOTA_CHECK_KEY, options, descriptor?.value || target);
    return descriptor;
  };
};

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
    private readonly usageService: UsageService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const billingOptions = this.reflector.get<BillingCheckOptions>(
      BILLING_CHECK_KEY,
      context.getHandler()
    );

    const quotaOptions = this.reflector.get<QuotaCheckOptions>(
      QUOTA_CHECK_KEY,
      context.getHandler()
    );

    if (!billingOptions && !quotaOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    // Check subscription status
    if (billingOptions?.requireActiveSubscription !== false) {
      await this.checkSubscriptionStatus(user.tenantId);
    }

    // Check quota
    if (quotaOptions) {
      await this.checkQuota(user.tenantId, quotaOptions, request);
    }

    return true;
  }

  private async checkSubscriptionStatus(tenantId: string): Promise<void> {
    const subscription = await this.subscriptionService.getActiveSubscription(tenantId);

    if (!subscription) {
      throw new ForbiddenException('No active subscription found');
    }

    const allowedStatuses = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING];

    if (!allowedStatuses.includes(subscription.status)) {
      throw new ForbiddenException(
        `Subscription is ${subscription.status}. Please update your payment method.`
      );
    }
  }

  private async checkQuota(
    tenantId: string,
    options: QuotaCheckOptions,
    request: any
  ): Promise<void> {
    const count = this.extractCount(request, options.countParam);
    const countryCode = options.countryCodeParam
      ? request.body?.[options.countryCodeParam] || request.query?.[options.countryCodeParam]
      : undefined;

    const result = await this.usageService.canSendMessages(
      tenantId,
      options.channel,
      count,
      countryCode
    );

    if (!result.canSend) {
      throw new ForbiddenException(result.reason || 'Insufficient quota or funds');
    }
  }

  private extractCount(request: any, paramName?: string): number {
    if (!paramName) {
      return 1;
    }

    const value =
      request.body?.[paramName] || request.query?.[paramName] || request.params?.[paramName];

    const count = parseInt(value, 10);
    return isNaN(count) ? 1 : count;
  }
}

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(ActiveSubscriptionGuard.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const subscription = await this.subscriptionService.getActiveSubscription(user.tenantId);

    if (!subscription) {
      throw new ForbiddenException('No active subscription. Please subscribe to a plan.');
    }

    const allowedStatuses = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING];

    if (!allowedStatuses.includes(subscription.status)) {
      throw new ForbiddenException(
        `Your subscription is ${subscription.status}. Please update your billing information.`
      );
    }

    // Attach subscription to request for downstream use
    request.subscription = subscription;

    return true;
  }
}
