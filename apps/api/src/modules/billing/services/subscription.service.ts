import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan, PlanTier, PlanInterval } from '../entities/subscription-plan.entity';
import { TenantSubscription, SubscriptionStatus } from '../entities/tenant-subscription.entity';
import { UsageQuota } from '../entities/usage-quota.entity';
import { StripeService } from './stripe.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  CreateCheckoutSessionDto,
  SubscriptionResponseDto,
  PlanResponseDto,
} from '../dto/subscription.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @InjectRepository(UsageQuota)
    private readonly usageQuotaRepository: Repository<UsageQuota>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  // ==================== PLANS ====================

  async getAllPlans(): Promise<PlanResponseDto[]> {
    const plans = await this.planRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });

    return plans.map((plan) => this.mapPlanToResponse(plan));
  }

  async getPlanByTier(tier: PlanTier): Promise<SubscriptionPlan> {
    const plan = await this.planRepository.findOne({ where: { tier } });
    if (!plan) {
      throw new NotFoundException(`Plan with tier ${tier} not found`);
    }
    return plan;
  }

  async getPlanById(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Plan with id ${planId} not found`);
    }
    return plan;
  }

  // ==================== SUBSCRIPTIONS ====================

  async getSubscription(tenantId: string): Promise<SubscriptionResponseDto | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
      relations: ['plan'],
    });

    if (!subscription) {
      return null;
    }

    return this.mapSubscriptionToResponse(subscription);
  }

  async getActiveSubscription(tenantId: string): Promise<TenantSubscription | null> {
    return this.subscriptionRepository.findOne({
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
      },
      relations: ['plan'],
    });
  }

  async createSubscription(
    tenantId: string,
    stripeCustomerId: string,
    dto: CreateSubscriptionDto
  ): Promise<TenantSubscription> {
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (existingSubscription && existingSubscription.status === SubscriptionStatus.ACTIVE) {
      throw new ConflictException('Tenant already has an active subscription');
    }

    const plan = await this.getPlanByTier(dto.planTier);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let subscription: TenantSubscription;

      if (plan.tier === PlanTier.FREE) {
        // Free plan - no Stripe subscription needed
        subscription = this.subscriptionRepository.create({
          tenantId,
          planId: plan.id,
          stripeCustomerId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: this.getNextMonthDate(),
        });
      } else {
        // Paid plan - create Stripe subscription
        if (!plan.stripePriceId) {
          throw new BadRequestException(
            `Plan ${plan.name} does not have a Stripe price configured`
          );
        }
        const trialDays = this.configService.get<number>('billing.trialDays', 14);
        const stripeSubscription = await this.stripeService.createSubscription({
          customerId: stripeCustomerId,
          priceId: plan.stripePriceId,
          trialDays,
          metadata: { tenantId, planTier: plan.tier },
          paymentMethodId: dto.paymentMethodId,
        });

        subscription = this.subscriptionRepository.create({
          tenantId,
          planId: plan.id,
          stripeCustomerId,
          stripeSubscriptionId: stripeSubscription.id,
          status: this.mapStripeStatus(stripeSubscription.status),
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          trialStart: stripeSubscription.trial_start
            ? new Date(stripeSubscription.trial_start * 1000)
            : null,
          trialEnd: stripeSubscription.trial_end
            ? new Date(stripeSubscription.trial_end * 1000)
            : null,
        });
      }

      await queryRunner.manager.save(subscription);

      // Initialize usage quota
      await this.initializeUsageQuota(queryRunner, tenantId, plan);

      await queryRunner.commitTransaction();

      this.logger.log(`Subscription created for tenant ${tenantId} with plan ${plan.tier}`);
      return subscription;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create subscription: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateSubscription(
    tenantId: string,
    dto: UpdateSubscriptionDto
  ): Promise<TenantSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
      relations: ['plan'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const newPlan = await this.getPlanByTier(dto.planTier);

    if (newPlan.id === subscription.planId) {
      throw new BadRequestException('Already subscribed to this plan');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Handle plan change
      if (subscription.stripeSubscriptionId && newPlan.tier !== PlanTier.FREE) {
        // Change Stripe subscription
        if (!newPlan.stripePriceId) {
          throw new BadRequestException(
            `Plan ${newPlan.name} does not have a Stripe price configured`
          );
        }
        const stripeSubscription = await this.stripeService.changeSubscriptionPlan(
          subscription.stripeSubscriptionId,
          newPlan.stripePriceId,
          dto.prorate ?? true
        );

        subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
        subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      } else if (newPlan.tier === PlanTier.FREE && subscription.stripeSubscriptionId) {
        // Downgrading to free - cancel Stripe subscription
        await this.stripeService.cancelSubscription(subscription.stripeSubscriptionId, false);
        subscription.stripeSubscriptionId = null;
      } else if (newPlan.tier !== PlanTier.FREE && !subscription.stripeSubscriptionId) {
        // Upgrading from free to paid
        throw new BadRequestException('Please use checkout to upgrade from free plan');
      }

      subscription.planId = newPlan.id;
      await queryRunner.manager.save(subscription);

      // Update usage quota limits
      await this.updateUsageQuotaLimits(queryRunner, tenantId, newPlan);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Subscription updated for tenant ${tenantId}: ${subscription.plan.tier} -> ${newPlan.tier}`
      );
      return subscription;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelSubscription(
    tenantId: string,
    dto: CancelSubscriptionDto
  ): Promise<TenantSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled');
    }

    const cancelAtPeriodEnd = dto.cancelAtPeriodEnd ?? true;

    if (subscription.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription(
        subscription.stripeSubscriptionId,
        cancelAtPeriodEnd
      );
    }

    subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;
    subscription.cancellationReason = dto.reason ?? null;

    if (!cancelAtPeriodEnd) {
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelledAt = new Date();
    }

    await this.subscriptionRepository.save(subscription);

    this.logger.log(
      `Subscription cancelled for tenant ${tenantId}. Cancel at period end: ${cancelAtPeriodEnd}`
    );
    return subscription;
  }

  async reactivateSubscription(tenantId: string): Promise<TenantSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new BadRequestException('Subscription is not scheduled for cancellation');
    }

    if (subscription.stripeSubscriptionId) {
      await this.stripeService.reactivateSubscription(subscription.stripeSubscriptionId);
    }

    subscription.cancelAtPeriodEnd = false;
    subscription.cancellationReason = null;
    await this.subscriptionRepository.save(subscription);

    this.logger.log(`Subscription reactivated for tenant ${tenantId}`);
    return subscription;
  }

  // ==================== CHECKOUT ====================

  async createCheckoutSession(
    tenantId: string,
    stripeCustomerId: string,
    dto: CreateCheckoutSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    const plan = await this.getPlanByTier(dto.planTier);

    if (plan.tier === PlanTier.FREE) {
      throw new BadRequestException('Cannot checkout for free plan');
    }

    if (!plan.stripePriceId) {
      throw new BadRequestException('Plan is not configured for checkout');
    }

    const frontendUrl = this.configService.get<string>('frontendUrl');
    const successUrl = dto.successUrl || `${frontendUrl}/settings/billing?success=true`;
    const cancelUrl = dto.cancelUrl || `${frontendUrl}/settings/billing?cancelled=true`;

    const session = await this.stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId: plan.stripePriceId,
      successUrl,
      cancelUrl,
      mode: 'subscription',
      trialDays: this.configService.get<number>('billing.trialDays', 14),
      metadata: { tenantId, planTier: plan.tier },
    });

    if (!session.url) {
      throw new BadRequestException('Failed to create checkout session');
    }

    return { url: session.url, sessionId: session.id };
  }

  async createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl?: string
  ): Promise<{ url: string }> {
    const frontendUrl = this.configService.get<string>('frontendUrl');
    const session = await this.stripeService.createBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl: returnUrl || `${frontendUrl}/settings/billing`,
    });
    return { url: session.url };
  }

  /**
   * Create checkout session for onboarding (new user plan selection)
   * This is used after registration to collect card and select plan
   */
  async createOnboardingCheckoutSession(
    tenantId: string,
    stripeCustomerId: string,
    dto: CreateCheckoutSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    const plan = await this.getPlanByTier(dto.planTier);

    // For free plan, create subscription directly without checkout
    if (plan.tier === PlanTier.FREE) {
      await this.createSubscription(tenantId, stripeCustomerId, {
        planTier: PlanTier.FREE,
      });
      const frontendUrl = this.configService.get<string>('frontendUrl');
      // Return dashboard URL for free plan
      return {
        url: `${frontendUrl}/dashboard?onboarding=complete&plan=free`,
        sessionId: 'free-plan',
      };
    }

    if (!plan.stripePriceId) {
      throw new BadRequestException('Plan is not configured for checkout');
    }

    const frontendUrl = this.configService.get<string>('frontendUrl');
    // Onboarding-specific URLs
    const successUrl =
      dto.successUrl || `${frontendUrl}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = dto.cancelUrl || `${frontendUrl}/onboarding/select-plan?cancelled=true`;

    const trialDays = this.configService.get<number>('billing.trialDays', 14);

    const session = await this.stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId: plan.stripePriceId,
      successUrl,
      cancelUrl,
      mode: 'subscription',
      trialDays,
      metadata: {
        tenantId,
        planTier: plan.tier,
        type: 'onboarding', // Mark this as onboarding checkout
      },
      // For onboarding, we want to collect payment method even for trial
      paymentMethodCollection: 'always',
    });

    if (!session.url) {
      throw new BadRequestException('Failed to create checkout session');
    }

    this.logger.log(
      `Created onboarding checkout session for tenant ${tenantId}, plan: ${plan.tier}`
    );

    return { url: session.url, sessionId: session.id };
  }

  // ==================== WEBHOOK HANDLERS ====================

  async handleSubscriptionCreated(stripeSubscription: any): Promise<void> {
    const tenantId = stripeSubscription.metadata?.tenantId;
    const planTier = stripeSubscription.metadata?.planTier;

    if (!tenantId) {
      this.logger.warn('Subscription created without tenantId in metadata');
      return;
    }

    // Check if subscription already exists
    let subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (subscription) {
      // Update existing subscription
      subscription.status = this.mapStripeStatus(stripeSubscription.status);
      if (stripeSubscription.current_period_start) {
        subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
      }
      if (stripeSubscription.current_period_end) {
        subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      }
      await this.subscriptionRepository.save(subscription);
      this.logger.log(`Updated existing subscription for tenant ${tenantId}`);
      return;
    }

    // Check if this is a new subscription (e.g., from onboarding checkout)
    const existingForTenant = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (existingForTenant) {
      // Tenant already has a subscription, update it with Stripe data
      existingForTenant.stripeSubscriptionId = stripeSubscription.id;
      existingForTenant.stripeCustomerId = stripeSubscription.customer;
      existingForTenant.status = this.mapStripeStatus(stripeSubscription.status);
      if (stripeSubscription.current_period_start) {
        existingForTenant.currentPeriodStart = new Date(
          stripeSubscription.current_period_start * 1000
        );
      }
      if (stripeSubscription.current_period_end) {
        existingForTenant.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      }
      existingForTenant.trialStart = stripeSubscription.trial_start
        ? new Date(stripeSubscription.trial_start * 1000)
        : null;
      existingForTenant.trialEnd = stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null;
      await this.subscriptionRepository.save(existingForTenant);
      this.logger.log(`Linked Stripe subscription to existing tenant ${tenantId}`);
      return;
    }

    // Create new subscription record (from onboarding or Stripe Dashboard)
    if (planTier) {
      try {
        const plan = await this.getPlanByTier(planTier as PlanTier);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          // Safely convert timestamps - handle null/undefined values
          const currentPeriodStart = stripeSubscription.current_period_start
            ? new Date(stripeSubscription.current_period_start * 1000)
            : new Date();
          const currentPeriodEnd = stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000)
            : this.getNextMonthDate();

          subscription = this.subscriptionRepository.create({
            tenantId,
            planId: plan.id,
            stripeCustomerId: stripeSubscription.customer,
            stripeSubscriptionId: stripeSubscription.id,
            status: this.mapStripeStatus(stripeSubscription.status),
            currentPeriodStart,
            currentPeriodEnd,
            trialStart: stripeSubscription.trial_start
              ? new Date(stripeSubscription.trial_start * 1000)
              : null,
            trialEnd: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000)
              : null,
          });

          await queryRunner.manager.save(subscription);

          // Initialize usage quota
          await this.initializeUsageQuota(queryRunner, tenantId, plan);

          await queryRunner.commitTransaction();

          this.logger.log(
            `Created subscription from webhook for tenant ${tenantId}, plan: ${planTier}`
          );
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw error;
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        this.logger.error(`Failed to create subscription from webhook: ${error.message}`);
      }
    } else {
      this.logger.warn(`Subscription created without planTier in metadata for tenant ${tenantId}`);
    }
  }

  async handleSubscriptionUpdated(stripeSubscription: any): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      this.logger.warn(`Subscription not found for Stripe ID: ${stripeSubscription.id}`);
      return;
    }

    subscription.status = this.mapStripeStatus(stripeSubscription.status);
    if (stripeSubscription.current_period_start) {
      subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    }
    if (stripeSubscription.current_period_end) {
      subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    }
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    if (stripeSubscription.canceled_at) {
      subscription.cancelledAt = new Date(stripeSubscription.canceled_at * 1000);
    }

    await this.subscriptionRepository.save(subscription);
    this.logger.log(`Subscription ${subscription.id} updated from Stripe webhook`);
  }

  async handleSubscriptionDeleted(stripeSubscription: any): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      return;
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    await this.subscriptionRepository.save(subscription);

    this.logger.log(`Subscription ${subscription.id} cancelled from Stripe webhook`);
  }

  // ==================== HELPERS ====================

  private async initializeUsageQuota(
    queryRunner: any,
    tenantId: string,
    plan: SubscriptionPlan
  ): Promise<void> {
    const now = new Date();
    const periodEnd = this.getNextMonthDate();

    const usageQuota = this.usageQuotaRepository.create({
      tenantId,
      periodStart: now,
      periodEnd,
      smsLimit: plan.smsQuota,
      emailLimit: plan.emailQuota,
      whatsappLimit: plan.whatsappQuota,
      contactsLimit: plan.maxContacts,
      campaignsLimit: plan.maxCampaignsPerMonth,
      isCurrent: true,
    });

    await queryRunner.manager.save(usageQuota);
  }

  private async updateUsageQuotaLimits(
    queryRunner: any,
    tenantId: string,
    plan: SubscriptionPlan
  ): Promise<void> {
    const currentQuota = await this.usageQuotaRepository.findOne({
      where: { tenantId, isCurrent: true },
    });

    if (currentQuota) {
      currentQuota.smsLimit = plan.smsQuota;
      currentQuota.emailLimit = plan.emailQuota;
      currentQuota.whatsappLimit = plan.whatsappQuota;
      currentQuota.contactsLimit = plan.maxContacts;
      currentQuota.campaignsLimit = plan.maxCampaignsPerMonth;
      await queryRunner.manager.save(currentQuota);
    }
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELLED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      paused: SubscriptionStatus.PAUSED,
    };
    return statusMap[status] || SubscriptionStatus.INCOMPLETE;
  }

  private getNextMonthDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date;
  }

  private mapPlanToResponse(plan: SubscriptionPlan): PlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      description: plan.description || '',
      price: Number(plan.price),
      interval: plan.interval,
      smsQuota: plan.smsQuota,
      emailQuota: plan.emailQuota,
      whatsappQuota: plan.whatsappQuota,
      maxContacts: plan.maxContacts,
      maxSenders: plan.maxSenders,
      maxUsers: plan.maxUsers,
      features: plan.features,
      trialDays: plan.trialDays,
    };
  }

  private mapSubscriptionToResponse(subscription: TenantSubscription): SubscriptionResponseDto {
    return {
      id: subscription.id,
      planId: subscription.planId,
      planName: subscription.plan?.name || '',
      planTier: subscription.plan?.tier || PlanTier.FREE,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      price: Number(subscription.plan?.price || 0),
      interval: subscription.plan?.interval || PlanInterval.MONTHLY,
    };
  }

  // ==================== INVOICES ====================

  async getInvoices(stripeCustomerId: string, limit: number = 20): Promise<any[]> {
    if (!stripeCustomerId) {
      return [];
    }

    const invoices = await this.stripeService.listInvoices(stripeCustomerId, limit);
    return invoices.map((invoice) => this.mapInvoiceToResponse(invoice));
  }

  async getInvoice(stripeCustomerId: string, invoiceId: string): Promise<any> {
    const invoice = await this.stripeService.getInvoice(invoiceId);

    // Verify invoice belongs to customer
    if (invoice.customer !== stripeCustomerId) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapInvoiceToResponse(invoice);
  }

  private mapInvoiceToResponse(invoice: any): any {
    return {
      id: invoice.id,
      invoiceNumber: invoice.number || invoice.id,
      status: invoice.status,
      total: invoice.total / 100, // Convert from cents
      amountPaid: invoice.amount_paid / 100,
      amountDue: invoice.amount_due / 100,
      currency: invoice.currency.toUpperCase(),
      invoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : null,
      createdAt: new Date(invoice.created * 1000),
    };
  }
}
