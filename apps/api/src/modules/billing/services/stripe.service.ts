import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (!secretKey) {
      this.logger.warn('Stripe secret key not configured. Payment features will be disabled.');
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
    this.logger.log('Stripe client initialized');
  }

  isConfigured(): boolean {
    return !!this.stripe;
  }

  // ==================== CUSTOMERS ====================

  async createCustomer(params: {
    email: string;
    name: string;
    tenantId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        tenantId: params.tenantId,
        ...params.metadata,
      },
    });
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.stripe.customers.retrieve(customerId);
  }

  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, params);
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    return this.stripe.customers.del(customerId);
  }

  // ==================== SUBSCRIPTIONS ====================

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    trialDays?: number;
    metadata?: Record<string, string>;
    paymentMethodId?: string;
  }): Promise<Stripe.Subscription> {
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: params.customerId,
      items: [{ price: params.priceId }],
      metadata: params.metadata,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    };

    if (params.trialDays && params.trialDays > 0) {
      subscriptionParams.trial_period_days = params.trialDays;
    }

    if (params.paymentMethodId) {
      subscriptionParams.default_payment_method = params.paymentMethodId;
    }

    return this.stripe.subscriptions.create(subscriptionParams);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'default_payment_method'],
    });
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<Stripe.Subscription> {
    if (cancelAtPeriodEnd) {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  async changeSubscriptionPlan(
    subscriptionId: string,
    newPriceId: string,
    prorate: boolean = true
  ): Promise<Stripe.Subscription> {
    const subscription = await this.getSubscription(subscriptionId);
    const currentItemId = subscription.items.data[0].id;

    return this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: currentItemId,
          price: newPriceId,
        },
      ],
      proration_behavior: prorate ? 'create_prorations' : 'none',
    });
  }

  // ==================== CHECKOUT SESSIONS ====================

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    mode: 'subscription' | 'payment';
    trialDays?: number;
    metadata?: Record<string, string>;
    paymentMethodCollection?: 'always' | 'if_required';
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: params.customerId,
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      mode: params.mode,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      // Always collect payment method for subscriptions (required for trials)
      payment_method_collection: params.paymentMethodCollection || 'always',
    };

    if (params.mode === 'subscription') {
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
        metadata: params.metadata,
      };

      if (params.trialDays && params.trialDays > 0) {
        subscriptionData.trial_period_days = params.trialDays;
      }

      sessionParams.subscription_data = subscriptionData;
    }

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  async createTopUpCheckoutSession(params: {
    customerId: string;
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      customer: params.customerId,
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: 'Wallet Top-Up',
              description: `Add ${params.currency} ${params.amount.toFixed(2)} to your wallet`,
            },
            unit_amount: Math.round(params.amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        type: 'wallet_topup',
        amount: params.amount.toString(),
        ...params.metadata,
      },
    });
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'payment_intent'],
    });
  }

  // ==================== PAYMENT METHODS ====================

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const result = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    return result.data;
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

  // ==================== PAYMENT INTENTS ====================

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    customerId: string;
    metadata?: Record<string, string>;
    paymentMethodId?: string;
    confirm?: boolean;
  }): Promise<Stripe.PaymentIntent> {
    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(params.amount * 100),
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      metadata: params.metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (params.paymentMethodId) {
      intentParams.payment_method = params.paymentMethodId;
      intentParams.confirm = params.confirm ?? false;
    }

    return this.stripe.paymentIntents.create(intentParams);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async confirmPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.confirm(paymentIntentId);
  }

  // ==================== INVOICES ====================

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.retrieve(invoiceId);
  }

  async listInvoices(customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> {
    const result = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return result.data;
  }

  async getUpcomingInvoice(customerId: string): Promise<Stripe.UpcomingInvoice | null> {
    try {
      return await this.stripe.invoices.retrieveUpcoming({
        customer: customerId,
      });
    } catch (error) {
      if (error.code === 'invoice_upcoming_none') {
        return null;
      }
      throw error;
    }
  }

  // ==================== BILLING PORTAL ====================

  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
  }

  // ==================== WEBHOOKS ====================

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret not configured');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  // ==================== PRODUCTS & PRICES ====================

  async getProduct(productId: string): Promise<Stripe.Product> {
    return this.stripe.products.retrieve(productId);
  }

  async getPrice(priceId: string): Promise<Stripe.Price> {
    return this.stripe.prices.retrieve(priceId);
  }

  async listPrices(productId: string): Promise<Stripe.Price[]> {
    const result = await this.stripe.prices.list({
      product: productId,
      active: true,
    });
    return result.data;
  }

  // ==================== REFUNDS ====================

  async createRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: Stripe.RefundCreateParams.Reason;
  }): Promise<Stripe.Refund> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: params.paymentIntentId,
      reason: params.reason,
    };

    if (params.amount) {
      refundParams.amount = Math.round(params.amount * 100);
    }

    return this.stripe.refunds.create(refundParams);
  }
}
