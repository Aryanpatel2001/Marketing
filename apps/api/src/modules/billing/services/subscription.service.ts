import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Between, Repository } from 'typeorm';
import { EmailService } from '../../../providers/email/email.service';
import { Campaign } from '../../campaigns/entities/campaign.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { SubscriptionPlan, TenantStatus } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
  CreatePortalSessionDto,
} from '../dto/create-checkout-session.dto';
import { SubscriptionDto, SubscriptionPlanInfoDto } from '../dto/subscription.dto';
import { UsageStatsDto } from '../dto/usage.dto';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { TransactionType } from '../entities/wallet-transaction.entity';
import { StripeService } from './stripe.service';
import { WalletService } from './wallet.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly tenantsService: TenantsService,
    private readonly walletService: WalletService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>
  ) {}

  // ============================================
  // Subscription Queries
  // ============================================

  async getCurrentSubscription(tenantId: string): Promise<SubscriptionDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    let stripeSubscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      stripeSubscription = await this.stripeService.getSubscription(tenant.stripeSubscriptionId);
    }

    return {
      plan: tenant.plan,
      status: tenant.status,
      stripeSubscriptionId: tenant.stripeSubscriptionId || undefined,
      stripeCustomerId: tenant.stripeCustomerId || undefined,
      isTrial: tenant.status === TenantStatus.TRIAL,
      trialEndsAt: tenant.trialEndsAt || undefined,
      currentPeriodStart: stripeSubscription?.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: stripeSubscription?.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : undefined,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end,
      limits: tenant.limits || this.getDefaultLimits(tenant.plan),
    };
  }

  async getAvailablePlans(): Promise<SubscriptionPlanInfoDto[]> {
    return [
      {
        plan: SubscriptionPlan.FREE,
        name: 'Free',
        description: 'Get started with basic features',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: [
          'Up to 500 contacts',
          '3 campaigns per month',
          '1,000 emails per month',
          '100 SMS per month',
          '2 team members',
        ],
        limits: this.getDefaultLimits(SubscriptionPlan.FREE),
      },
      {
        plan: SubscriptionPlan.STARTER,
        name: 'Starter',
        description: 'For growing businesses',
        monthlyPrice: 2900, // $29/month
        yearlyPrice: 2900,
        popular: true,
        features: [
          'Up to 5,000 contacts',
          '20 campaigns per month',
          '25,000 emails per month',
          '1,000 SMS per month',
          '5 team members',
          'Priority support',
        ],
        limits: this.getDefaultLimits(SubscriptionPlan.STARTER),
      },
      {
        plan: SubscriptionPlan.PRO,
        name: 'Pro',
        description: 'For large organizations',
        monthlyPrice: 9900, // $99/month
        yearlyPrice: 9900,
        features: [
          'Up to 50,000 contacts',
          'Unlimited campaigns',
          '250,000 emails per month',
          '25,000 SMS per month',
          '25 team members',
          'Dedicated support',
          'API access',
          'Custom integrations',
        ],
        limits: this.getDefaultLimits(SubscriptionPlan.PRO),
      },
    ];
  }

  async getUsageStats(tenantId: string): Promise<UsageStatsDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const limits = tenant.limits || this.getDefaultLimits(tenant.plan);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get wallet balance for credits
    const balance = await this.walletService.getBalance(tenantId);

    // Count actual contacts
    const contactCount = await this.contactRepository.count({
      where: { tenantId },
    });

    // Count campaigns created this month
    const campaignCount = await this.campaignRepository.count({
      where: {
        tenantId,
        createdAt: Between(startOfMonth, endOfMonth),
      },
    });

    // Calculate percentages
    const contactPercentage =
      limits.maxContacts > 0 ? (contactCount / limits.maxContacts) * 100 : 0;

    const campaignPercentage =
      limits.maxCampaignsPerMonth > 0 ? (campaignCount / limits.maxCampaignsPerMonth) * 100 : 0;

    return {
      contacts: {
        used: contactCount,
        limit: limits.maxContacts,
        percentage: Math.min(contactPercentage, 100),
      },
      campaigns: {
        used: campaignCount,
        limit: limits.maxCampaignsPerMonth,
        percentage: Math.min(campaignPercentage, 100),
        periodStart: startOfMonth.toISOString(),
        periodEnd: endOfMonth.toISOString(),
      },
      sms: {
        used: limits.maxSmsPerMonth - balance.availableCredits, // Approximate
        limit: limits.maxSmsPerMonth,
        percentage:
          limits.maxSmsPerMonth > 0
            ? Math.min(
                ((limits.maxSmsPerMonth - balance.availableCredits) / limits.maxSmsPerMonth) * 100,
                100
              )
            : 0,
        periodStart: startOfMonth.toISOString(),
        periodEnd: endOfMonth.toISOString(),
      },
      emails: {
        used: 0, // Email feature not yet implemented
        limit: limits.maxEmailsPerMonth,
        percentage: 0,
        periodStart: startOfMonth.toISOString(),
        periodEnd: endOfMonth.toISOString(),
      },
      credits: {
        available: balance.availableCredits,
        reserved: balance.reservedCredits,
        total: balance.balance,
      },
    };
  }

  // ============================================
  // Checkout & Portal
  // ============================================

  async createCheckoutSession(
    tenantId: string,
    dto: CreateCheckoutSessionDto
  ): Promise<CheckoutSessionResponseDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!tenant.stripeCustomerId) {
      throw new BadRequestException('Stripe customer not set up for this tenant');
    }

    const priceId = this.stripeService.getPriceId(dto.plan, dto.interval);

    const session = await this.stripeService.createCheckoutSession({
      tenantId,
      customerId: tenant.stripeCustomerId,
      priceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      mode: 'subscription',
      metadata: {
        plan: dto.plan,
        interval: dto.interval,
      },
    });

    return {
      url: session.url || '',
      sessionId: session.id,
    };
  }

  async createBillingPortalSession(
    tenantId: string,
    dto: CreatePortalSessionDto
  ): Promise<{ url: string }> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!tenant.stripeCustomerId) {
      throw new BadRequestException('Stripe customer not set up for this tenant');
    }

    const session = await this.stripeService.createBillingPortalSession(
      tenant.stripeCustomerId,
      dto.returnUrl
    );

    return { url: session.url };
  }

  // ============================================
  // Webhook Handlers
  // ============================================

  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn('Subscription created without tenantId metadata');
      return;
    }

    this.logger.log(`Handling subscription created for tenant ${tenantId}`);

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId ? this.stripeService.getPlanFromPriceId(priceId) : SubscriptionPlan.FREE;

    await this.tenantsService.updateStripeIds(
      tenantId,
      subscription.customer as string,
      subscription.id
    );

    await this.tenantsService.updatePlan(tenantId, plan);

    // Add monthly SMS credits based on plan
    const planCredits = this.getPlanMonthlyCredits(plan);
    if (planCredits > 0) {
      await this.walletService.addCredits(
        tenantId,
        planCredits,
        TransactionType.SUBSCRIPTION_CREDIT,
        subscription.id,
        {
          plan,
          reason: `Monthly credits for ${plan} plan`,
        }
      );
      this.logger.log(`Added ${planCredits} credits for tenant ${tenantId} on ${plan} plan`);
    }
  }

  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn('Subscription updated without tenantId metadata');
      return;
    }

    this.logger.log(`Handling subscription updated for tenant ${tenantId}`);

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId ? this.stripeService.getPlanFromPriceId(priceId) : SubscriptionPlan.FREE;

    // Update plan if changed
    const tenant = await this.tenantsService.findById(tenantId);
    if (tenant && tenant.plan !== plan) {
      await this.tenantsService.updatePlan(tenantId, plan);
    }

    // Handle cancellation scheduled
    if (subscription.cancel_at_period_end) {
      this.logger.log(`Subscription will be canceled at period end for tenant ${tenantId}`);
    }
  }

  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn('Subscription deleted without tenantId metadata');
      return;
    }

    this.logger.log(`Handling subscription deleted for tenant ${tenantId}`);

    // Downgrade to free plan
    await this.tenantsService.updatePlan(tenantId, SubscriptionPlan.FREE);

    // Update status
    await this.tenantsService.update(tenantId, {
      stripeSubscriptionId: null,
      status: TenantStatus.CANCELLED,
    });
  }

  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    let tenantId = invoice.subscription_details?.metadata?.tenantId || invoice.metadata?.tenantId;

    // If tenantId not in metadata, look up from customer
    if (!tenantId && customerId) {
      const tenant = await this.tenantsService.findByStripeCustomerId(customerId);
      if (tenant) {
        tenantId = tenant.id;
      }
    }

    if (!tenantId) {
      this.logger.warn(`Invoice paid without tenantId for customer ${customerId}`);
      return;
    }

    this.logger.log(`Handling invoice paid for tenant ${tenantId}`);

    // Store invoice locally
    await this.storeInvoice(invoice, tenantId);

    // Get tenant info
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for invoice: ${tenantId}`);
      return;
    }

    // Update tenant status if suspended
    if (tenant.status === TenantStatus.SUSPENDED) {
      await this.tenantsService.update(tenantId, {
        status: TenantStatus.ACTIVE,
      });
    }

    // Add monthly credits on subscription renewal (not first invoice)
    if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
      const credits = this.getPlanMonthlyCredits(tenant.plan);
      if (credits > 0) {
        await this.walletService.addCredits(
          tenantId,
          credits,
          TransactionType.SUBSCRIPTION_RENEWAL,
          invoice.id,
          {
            plan: tenant.plan,
            reason: `Monthly renewal credits for ${tenant.plan} plan`,
            billingPeriod: invoice.period_start
              ? new Date(invoice.period_start * 1000).toISOString()
              : undefined,
          }
        );
        this.logger.log(
          `Added ${credits} renewal credits for tenant ${tenantId} on ${tenant.plan} plan`
        );
      }
    }

    // Send payment success email
    await this.sendPaymentSuccessEmail(tenant.billingEmail || '', {
      planName: tenant.plan,
      amount: (invoice.total / 100).toFixed(2),
      invoiceNumber: invoice.number || invoice.id,
      date: new Date().toLocaleDateString(),
    });
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    let tenantId = invoice.subscription_details?.metadata?.tenantId || invoice.metadata?.tenantId;

    // If tenantId not in metadata, look up from customer
    if (!tenantId && customerId) {
      const tenant = await this.tenantsService.findByStripeCustomerId(customerId);
      if (tenant) {
        tenantId = tenant.id;
      }
    }

    if (!tenantId) {
      this.logger.warn('Invoice payment failed without tenantId');
      return;
    }

    this.logger.log(`Handling invoice payment failed for tenant ${tenantId}`);

    // Store invoice with failed status
    await this.storeInvoice(invoice, tenantId);

    // Get tenant info
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for failed payment: ${tenantId}`);
      return;
    }

    // Increment failed payment count
    const failedCount = (tenant.failedPaymentCount || 0) + 1;
    const now = new Date();

    // Grace period: 3 days before suspension
    const GRACE_PERIOD_DAYS = 3;
    const shouldSuspend = failedCount >= 3; // After 3 failed attempts

    if (shouldSuspend) {
      // Suspend account after grace period
      await this.tenantsService.update(tenantId, {
        status: TenantStatus.SUSPENDED,
        failedPaymentCount: failedCount,
        paymentFailedAt: tenant.paymentFailedAt || now,
      });
      this.logger.warn(`Tenant ${tenantId} suspended after ${failedCount} failed payment attempts`);
    } else {
      // Set to grace period
      await this.tenantsService.update(tenantId, {
        status: TenantStatus.GRACE_PERIOD,
        failedPaymentCount: failedCount,
        paymentFailedAt: tenant.paymentFailedAt || now,
      });
      this.logger.log(`Tenant ${tenantId} in grace period (attempt ${failedCount}/3)`);
    }

    // Send appropriate email based on attempt number
    if (tenant?.billingEmail) {
      await this.sendPaymentRetryEmail(tenant.billingEmail, {
        planName: tenant.plan,
        amount: (invoice.total / 100).toFixed(2),
        invoiceNumber: invoice.number || invoice.id,
        date: new Date().toLocaleDateString(),
        retryUrl: `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001')}/settings/billing`,
        attemptNumber: failedCount,
        isFinalWarning: failedCount === 2,
        isSuspended: shouldSuspend,
      });
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private async storeInvoice(stripeInvoice: Stripe.Invoice, tenantId: string): Promise<Invoice> {
    let invoice = await this.invoiceRepository.findOne({
      where: { stripeInvoiceId: stripeInvoice.id },
    });

    const invoiceData = {
      tenantId,
      stripeInvoiceId: stripeInvoice.id,
      stripeCustomerId: stripeInvoice.customer as string,
      stripeSubscriptionId: stripeInvoice.subscription as string | null,
      status: this.mapInvoiceStatus(stripeInvoice.status),
      amount: stripeInvoice.total / 100,
      amountPaid: stripeInvoice.amount_paid / 100,
      currency: stripeInvoice.currency.toUpperCase(),
      invoiceNumber: stripeInvoice.number,
      invoiceUrl: stripeInvoice.hosted_invoice_url,
      pdfUrl: stripeInvoice.invoice_pdf,
      dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
      paidAt: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : null,
      periodStart: stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000) : null,
      periodEnd: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
      lineItems: stripeInvoice.lines?.data.map((line) => ({
        description: line.description || '',
        amount: line.amount / 100,
        quantity: line.quantity || 1,
      })),
    };

    if (invoice) {
      Object.assign(invoice, invoiceData);
    } else {
      invoice = this.invoiceRepository.create(invoiceData);
    }

    return this.invoiceRepository.save(invoice);
  }

  private mapInvoiceStatus(stripeStatus: string | null): InvoiceStatus {
    switch (stripeStatus) {
      case 'draft':
        return InvoiceStatus.DRAFT;
      case 'open':
        return InvoiceStatus.OPEN;
      case 'paid':
        return InvoiceStatus.PAID;
      case 'void':
        return InvoiceStatus.VOID;
      case 'uncollectible':
        return InvoiceStatus.UNCOLLECTIBLE;
      default:
        return InvoiceStatus.DRAFT;
    }
  }

  private getDefaultLimits(plan: SubscriptionPlan) {
    const limits: Record<SubscriptionPlan, typeof defaultLimits> = {
      [SubscriptionPlan.FREE]: {
        maxContacts: 500,
        maxCampaignsPerMonth: 3,
        maxEmailsPerMonth: 1000,
        maxSmsPerMonth: 100,
        maxUsersPerTenant: 2,
      },
      [SubscriptionPlan.STARTER]: {
        maxContacts: 5000,
        maxCampaignsPerMonth: 20,
        maxEmailsPerMonth: 25000,
        maxSmsPerMonth: 1000,
        maxUsersPerTenant: 5,
      },
      [SubscriptionPlan.GROWTH]: {
        maxContacts: 25000,
        maxCampaignsPerMonth: 100,
        maxEmailsPerMonth: 100000,
        maxSmsPerMonth: 10000,
        maxUsersPerTenant: 15,
      },
      [SubscriptionPlan.PRO]: {
        maxContacts: 50000,
        maxCampaignsPerMonth: -1, // unlimited
        maxEmailsPerMonth: 250000,
        maxSmsPerMonth: 25000,
        maxUsersPerTenant: 25,
      },
      [SubscriptionPlan.ENTERPRISE]: {
        maxContacts: -1,
        maxCampaignsPerMonth: -1,
        maxEmailsPerMonth: -1,
        maxSmsPerMonth: -1,
        maxUsersPerTenant: -1,
      },
    };

    const defaultLimits = {
      maxContacts: 500,
      maxCampaignsPerMonth: 3,
      maxEmailsPerMonth: 1000,
      maxSmsPerMonth: 100,
      maxUsersPerTenant: 2,
    };

    return limits[plan] || defaultLimits;
  }

  private getPlanMonthlyCredits(plan: SubscriptionPlan): number {
    const credits: Record<SubscriptionPlan, number> = {
      [SubscriptionPlan.FREE]: 100,
      [SubscriptionPlan.STARTER]: 1000,
      [SubscriptionPlan.GROWTH]: 10000,
      [SubscriptionPlan.PRO]: 25000,
      [SubscriptionPlan.ENTERPRISE]: 50000,
    };

    return credits[plan] || 0;
  }

  private async sendPaymentSuccessEmail(
    email: string,
    data: { planName: string; amount: string; invoiceNumber: string; date: string }
  ): Promise<void> {
    if (!email || !this.emailService.isReady()) {
      this.logger.warn('Cannot send payment success email: email service not ready or no email');
      return;
    }

    try {
      const senderEmail = this.configService.get<string>(
        'email.ses.senderEmail',
        'noreply@example.com'
      );
      const senderName = this.configService.get<string>('email.ses.fromName', 'Marketing Platform');

      await this.emailService.sendEmail({
        to: email,
        from: senderEmail,
        fromName: senderName,
        subject: `Payment Received - ${data.planName} Plan`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">✅ Payment Successful</h2>
            <p>Thank you for your payment! Your subscription has been renewed.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Plan</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${data.planName}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Amount</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">$${data.amount}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Invoice</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${data.invoiceNumber}</td></tr>
              <tr><td style="padding: 10px;"><strong>Date</strong></td><td style="padding: 10px;">${data.date}</td></tr>
            </table>
            <p>Your monthly SMS credits have been added to your account.</p>
            <p style="color: #666; font-size: 12px;">If you have any questions, please contact support.</p>
          </div>
        `,
        text: `Payment Successful - ${data.planName} Plan\n\nAmount: $${data.amount}\nInvoice: ${data.invoiceNumber}\nDate: ${data.date}\n\nYour monthly SMS credits have been added to your account.`,
      });

      this.logger.log(`Payment success email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send payment success email to ${email}:`, error);
    }
  }

  private async sendPaymentFailedEmail(
    email: string,
    data: {
      planName: string;
      amount: string;
      invoiceNumber: string;
      date: string;
      retryUrl: string;
    }
  ): Promise<void> {
    if (!email || !this.emailService.isReady()) {
      this.logger.warn('Cannot send payment failed email: email service not ready or no email');
      return;
    }

    try {
      const senderEmail = this.configService.get<string>(
        'email.ses.senderEmail',
        'noreply@example.com'
      );
      const senderName = this.configService.get<string>('email.ses.fromName', 'Marketing Platform');

      await this.emailService.sendEmail({
        to: email,
        from: senderEmail,
        fromName: senderName,
        subject: `⚠️ Payment Failed - Action Required`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">⚠️ Payment Failed</h2>
            <p>We were unable to process your payment for the ${data.planName} plan.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Plan</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${data.planName}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Amount</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">$${data.amount}</td></tr>
              <tr><td style="padding: 10px;"><strong>Date</strong></td><td style="padding: 10px;">${data.date}</td></tr>
            </table>
            <p>Your account has been temporarily suspended. Please update your payment method to continue using our services.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${data.retryUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Update Payment Method</a>
            </p>
            <p style="color: #666; font-size: 12px;">If you believe this is an error, please contact support.</p>
          </div>
        `,
        text: `Payment Failed\n\nWe were unable to process your payment for the ${data.planName} plan.\n\nAmount: $${data.amount}\nDate: ${data.date}\n\nPlease update your payment method: ${data.retryUrl}`,
      });

      this.logger.log(`Payment failed email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send payment failed email to ${email}:`, error);
    }
  }

  private async sendPaymentRetryEmail(
    email: string,
    data: {
      planName: string;
      amount: string;
      invoiceNumber: string;
      date: string;
      retryUrl: string;
      attemptNumber: number;
      isFinalWarning: boolean;
      isSuspended: boolean;
    }
  ): Promise<void> {
    if (!email || !this.emailService.isReady()) {
      this.logger.warn('Cannot send payment retry email: email service not ready or no email');
      return;
    }

    try {
      const senderEmail = this.configService.get<string>(
        'email.ses.senderEmail',
        'noreply@example.com'
      );
      const senderName = this.configService.get<string>('email.ses.fromName', 'Marketing Platform');

      let subject: string;
      let heading: string;
      let message: string;
      let urgency: string;

      if (data.isSuspended) {
        subject = '🚨 Account Suspended - Payment Failed';
        heading = '🚨 Account Suspended';
        message = `Your account has been suspended after ${data.attemptNumber} failed payment attempts.`;
        urgency = 'Your account is now suspended and you cannot access our services.';
      } else if (data.isFinalWarning) {
        subject = '⚠️ Final Warning - Payment Failed';
        heading = '⚠️ Final Warning';
        message = `This is your final warning. We've attempted to charge your payment method ${data.attemptNumber} times.`;
        urgency = 'Your account will be suspended if the next payment attempt fails.';
      } else {
        subject = '⚠️ Payment Failed - Please Update Payment Method';
        heading = '⚠️ Payment Failed';
        message = `We were unable to process your payment for the ${data.planName} plan (Attempt ${data.attemptNumber}/3).`;
        urgency = 'Please update your payment method to avoid service interruption.';
      }

      await this.emailService.sendEmail({
        to: email,
        from: senderEmail,
        fromName: senderName,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${data.isSuspended ? '#dc2626' : '#ef4444'};">${heading}</h2>
            <p>${message}</p>
            <div style="background-color: ${data.isSuspended ? '#fee2e2' : '#fef3c7'}; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: ${data.isSuspended ? '#991b1b' : '#92400e'}; font-weight: 600;">
                ${urgency}
              </p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Plan</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${data.planName}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Amount</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">$${data.amount}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Attempt</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${data.attemptNumber}/3</td></tr>
              <tr><td style="padding: 10px;"><strong>Date</strong></td><td style="padding: 10px;">${data.date}</td></tr>
            </table>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${data.retryUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Update Payment Method</a>
            </p>
            <p style="color: #666; font-size: 12px;">If you believe this is an error, please contact support immediately.</p>
          </div>
        `,
        text: `${heading}\n\n${message}\n\n${urgency}\n\nPlan: ${data.planName}\nAmount: $${data.amount}\nAttempt: ${data.attemptNumber}/3\nDate: ${data.date}\n\nUpdate payment method: ${data.retryUrl}`,
      });

      this.logger.log(`Payment retry email sent to ${email} (attempt ${data.attemptNumber})`);
    } catch (error) {
      this.logger.error(`Failed to send payment retry email to ${email}:`, error);
    }
  }

  private async sendTrialExpiringEmail(
    email: string,
    data: { planName: string; trialEndsAt: string; upgradeUrl: string }
  ): Promise<void> {
    if (!email || !this.emailService.isReady()) {
      this.logger.warn('Cannot send trial expiring email: email service not ready or no email');
      return;
    }

    try {
      const senderEmail = this.configService.get<string>(
        'email.ses.senderEmail',
        'noreply@example.com'
      );
      const senderName = this.configService.get<string>('email.ses.fromName', 'Marketing Platform');

      await this.emailService.sendEmail({
        to: email,
        from: senderEmail,
        fromName: senderName,
        subject: '⏰ Your Trial is Ending Soon',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">⏰ Your Trial is Ending Soon</h2>
            <p>Your trial period will end on <strong>${data.trialEndsAt}</strong>.</p>
            <p>To continue enjoying our services without interruption, please upgrade to a paid plan.</p>
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">
                <strong>What happens when your trial ends?</strong><br>
                • Your account will be downgraded to the Free plan<br>
                • Some features will be limited<br>
                • Your data will be preserved
              </p>
            </div>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${data.upgradeUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Upgrade Now</a>
            </p>
            <p style="color: #666; font-size: 12px;">Thank you for trying our platform!</p>
          </div>
        `,
        text: `Your Trial is Ending Soon\n\nYour trial period will end on ${data.trialEndsAt}.\n\nUpgrade now: ${data.upgradeUrl}`,
      });

      this.logger.log(`Trial expiring email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send trial expiring email to ${email}:`, error);
    }
  }

  private async sendRefundEmail(
    email: string,
    data: { amount: string; credits: number; reason?: string }
  ): Promise<void> {
    if (!email || !this.emailService.isReady()) {
      this.logger.warn('Cannot send refund email: email service not ready or no email');
      return;
    }

    try {
      const senderEmail = this.configService.get<string>(
        'email.ses.senderEmail',
        'noreply@example.com'
      );
      const senderName = this.configService.get<string>('email.ses.fromName', 'Marketing Platform');

      await this.emailService.sendEmail({
        to: email,
        from: senderEmail,
        fromName: senderName,
        subject: 'Refund Processed',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">💰 Refund Processed</h2>
            <p>A refund has been processed for your account.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Amount</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">$${data.amount}</td></tr>
              <tr><td style="padding: 10px;"><strong>Credits Deducted</strong></td><td style="padding: 10px;">${data.credits}</td></tr>
            </table>
            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
            <p>The refund will appear in your account within 5-10 business days.</p>
            <p style="color: #666; font-size: 12px;">If you have any questions, please contact support.</p>
          </div>
        `,
        text: `Refund Processed\n\nAmount: $${data.amount}\nCredits Deducted: ${data.credits}\n${data.reason ? `Reason: ${data.reason}\n` : ''}\nThe refund will appear in your account within 5-10 business days.`,
      });

      this.logger.log(`Refund email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send refund email to ${email}:`, error);
    }
  }

  async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn('Trial will end without tenantId metadata');
      return;
    }

    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant || !tenant.billingEmail) {
      return;
    }

    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toLocaleDateString()
      : 'soon';

    await this.sendTrialExpiringEmail(tenant.billingEmail, {
      planName: tenant.plan,
      trialEndsAt: trialEnd,
      upgradeUrl: `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001')}/settings/billing`,
    });
  }

  async handleRefund(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId = charge.payment_intent as string;
    if (!paymentIntentId) {
      this.logger.warn('Refund without payment intent');
      return;
    }

    // Find the transaction by payment intent ID
    const transaction = await this.walletService['transactionRepository'].findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!transaction) {
      this.logger.warn(`No transaction found for refunded payment intent: ${paymentIntentId}`);
      return;
    }

    const creditsToDeduct = Math.abs(Number(transaction.amount));
    const refundAmount = (charge.amount_refunded / 100).toFixed(2);

    // Deduct credits
    await this.walletService.addCredits(
      transaction.tenantId,
      -creditsToDeduct,
      TransactionType.REFUND,
      charge.id,
      {
        paymentIntentId,
        refundAmount: charge.amount_refunded,
        reason: 'Stripe refund',
      }
    );

    // Send refund email
    const tenant = await this.tenantsService.findById(transaction.tenantId);
    if (tenant?.billingEmail) {
      await this.sendRefundEmail(tenant.billingEmail, {
        amount: refundAmount,
        credits: creditsToDeduct,
        reason: 'Payment refunded',
      });
    }

    this.logger.log(
      `Refund processed: ${creditsToDeduct} credits deducted from tenant ${transaction.tenantId}`
    );
  }

  async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const tenant = await this.tenantsService.findByStripeCustomerId(customerId);

    if (!tenant || !tenant.billingEmail) {
      return;
    }

    // Send reminder email about upcoming charge
    const amount = (invoice.total / 100).toFixed(2);
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date * 1000).toLocaleDateString()
      : 'soon';

    this.logger.log(`Upcoming invoice for tenant ${tenant.id}: $${amount} due ${dueDate}`);
    // Could send email notification here if desired
  }
}
