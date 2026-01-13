import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionPlan } from '../../tenants/entities/tenant.entity';
import { BillingInterval, CheckoutPlan } from '../dto/create-checkout-session.dto';
import { CreditPackage } from '../dto/purchase-credits.dto';

export interface CreateCheckoutParams {
  tenantId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode: 'subscription' | 'payment';
  metadata?: Record<string, string>;
}

export interface CreatePaymentIntentParams {
  customerId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);
  private readonly webhookSecret: string;
  private readonly priceIds: Record<string, string>;
  private readonly creditPricing: {
    pricePerCredit: number;
    packages: Array<{ id: CreditPackage; credits: number; price: number }>;
  };

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (!secretKey) {
      this.logger.warn('Stripe secret key not configured');
    }

    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2023-10-16',
    });

    this.webhookSecret = this.configService.get<string>('stripe.webhookSecret') || '';

    // Map app plans to Stripe price IDs:
    // - App's "Starter" ($29) → Stripe's "Pro" price ID (STRIPE_PRICE_PRO_MONTHLY)
    // - App's "Pro" ($99) → Stripe's "Enterprise" price ID (STRIPE_PRICE_ENTERPRISE_MONTHLY)
    this.priceIds = {
      starterMonthly: this.configService.get<string>('stripe.prices.proMonthly') || '', // $29
      starterYearly: this.configService.get<string>('stripe.prices.proMonthly') || '',
      growthMonthly: this.configService.get<string>('stripe.prices.growthMonthly') || '',
      growthYearly: this.configService.get<string>('stripe.prices.growthYearly') || '',
      proMonthly: this.configService.get<string>('stripe.prices.enterpriseMonthly') || '', // $99
      proYearly: this.configService.get<string>('stripe.prices.enterpriseMonthly') || '',
    };

    this.creditPricing = {
      pricePerCredit: this.configService.get<number>('stripe.creditPricing.pricePerCredit') || 0.05,
      packages: [
        { id: CreditPackage.PACK_100, credits: 100, price: 500 },
        { id: CreditPackage.PACK_500, credits: 500, price: 2000 },
        { id: CreditPackage.PACK_1000, credits: 1000, price: 3500 },
        { id: CreditPackage.PACK_5000, credits: 5000, price: 15000 },
      ],
    };
  }

  // ============================================
  // Customer Management
  // ============================================

  async createCustomer(tenantId: string, email: string, name: string): Promise<Stripe.Customer> {
    this.logger.log(`Creating Stripe customer for tenant ${tenantId}`);

    return this.stripe.customers.create({
      email,
      name,
      metadata: {
        tenantId,
      },
    });
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }
      return customer as Stripe.Customer;
    } catch (error) {
      this.logger.error(`Failed to get customer ${customerId}:`, error);
      return null;
    }
  }

  async updateCustomer(
    customerId: string,
    data: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, data);
  }

  // ============================================
  // Subscription Management
  // ============================================

  async createCheckoutSession(params: CreateCheckoutParams): Promise<Stripe.Checkout.Session> {
    this.logger.log(`Creating checkout session for tenant ${params.tenantId}`);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: params.customerId,
      mode: params.mode,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        tenantId: params.tenantId,
        ...params.metadata,
      },
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
    };

    if (params.mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          tenantId: params.tenantId,
        },
      };
    }

    if (params.mode === 'payment') {
      sessionParams.payment_intent_data = {
        metadata: {
          tenantId: params.tenantId,
          ...params.metadata,
        },
      };
    }

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      this.logger.error(`Failed to get subscription ${subscriptionId}:`, error);
      return null;
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately = false
  ): Promise<Stripe.Subscription> {
    if (immediately) {
      return this.stripe.subscriptions.cancel(subscriptionId);
    }

    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  // ============================================
  // Payment Methods
  // ============================================

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const methods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    return methods.data;
  }

  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  // ============================================
  // One-time Payments (Credits)
  // ============================================

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      customer: params.customerId,
      metadata: params.metadata || {},
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  // ============================================
  // Invoices
  // ============================================

  async listInvoices(customerId: string, limit = 10): Promise<Stripe.Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return invoices.data;
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice | null> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      this.logger.error(`Failed to get invoice ${invoiceId}:`, error);
      return null;
    }
  }

  // ============================================
  // Webhooks
  // ============================================

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  // ============================================
  // Price Mapping
  // ============================================

  getPriceId(plan: CheckoutPlan, interval: BillingInterval): string {
    const key = `${plan}${interval === BillingInterval.MONTHLY ? 'Monthly' : 'Yearly'}`;
    const priceId = this.priceIds[key];

    if (!priceId) {
      throw new BadRequestException(`Price not configured for ${plan} ${interval}`);
    }

    return priceId;
  }

  getPlanFromPriceId(priceId: string): SubscriptionPlan {
    for (const [key, value] of Object.entries(this.priceIds)) {
      if (value === priceId) {
        if (key.startsWith('starter')) return SubscriptionPlan.STARTER;
        if (key.startsWith('growth')) return SubscriptionPlan.GROWTH;
        if (key.startsWith('pro')) return SubscriptionPlan.PRO;
      }
    }
    return SubscriptionPlan.FREE;
  }

  // ============================================
  // Credit Packages
  // ============================================

  getCreditPackages() {
    const basePrice = this.creditPricing.pricePerCredit * 100; // Convert to cents

    return this.creditPricing.packages.map((pkg) => {
      const pricePerCredit = pkg.price / pkg.credits;
      const discountPercent = Math.round((1 - pricePerCredit / basePrice) * 100);

      return {
        id: pkg.id,
        credits: pkg.credits,
        price: pkg.price,
        currency: 'USD',
        pricePerCredit,
        discountPercent: Math.max(0, discountPercent),
      };
    });
  }

  getCreditPackagePrice(
    packageId: CreditPackage,
    customAmount?: number
  ): { credits: number; price: number } {
    if (packageId === CreditPackage.CUSTOM) {
      if (!customAmount || customAmount < 100) {
        throw new BadRequestException('Custom amount must be at least 100 credits');
      }
      // Custom pricing at base rate (no discount)
      const price = Math.round(customAmount * this.creditPricing.pricePerCredit * 100);
      return { credits: customAmount, price };
    }

    const pkg = this.creditPricing.packages.find((p) => p.id === packageId);
    if (!pkg) {
      throw new BadRequestException('Invalid credit package');
    }

    return { credits: pkg.credits, price: pkg.price };
  }
}
