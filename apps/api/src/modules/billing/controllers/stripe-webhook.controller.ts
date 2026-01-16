import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../../../common/decorators';
import { TransactionType } from '../entities/wallet-transaction.entity';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { WalletService } from '../services/wallet.service';

@ApiTags('Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  // Simple in-memory idempotency cache
  private processedEvents = new Map<string, number>();
  private readonly IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService
  ) {
    // Clean up old events periodically
    setInterval(() => this.cleanupProcessedEvents(), 60 * 1000);
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    if (!request.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;

    try {
      event = this.stripeService.verifyWebhookSignature(request.rawBody, signature);
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new BadRequestException('Invalid webhook signature');
    }

    // Idempotency check
    if (this.isEventProcessed(event.id)) {
      this.logger.debug(`Skipping duplicate event: ${event.id}`);
      return { received: true };
    }

    this.markEventProcessed(event.id);

    this.logger.log(`Processing Stripe webhook event: ${event.type} (${event.id})`);

    try {
      await this.processEvent(event);
    } catch (error) {
      this.logger.error(`Error processing webhook event ${event.type}:`, error);
      // Still return 200 to prevent Stripe from retrying
      // The error is logged for investigation
    }

    return { received: true };
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      // ============================================
      // Checkout Events
      // ============================================
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      // ============================================
      // Subscription Events
      // ============================================
      case 'customer.subscription.created':
        await this.subscriptionService.handleSubscriptionCreated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.updated':
        await this.subscriptionService.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.deleted':
        await this.subscriptionService.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.trial_will_end':
        await this.subscriptionService.handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      // ============================================
      // Invoice Events
      // ============================================
      case 'invoice.paid':
        await this.subscriptionService.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.subscriptionService.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice
        );
        break;

      case 'invoice.upcoming':
        await this.subscriptionService.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
        break;

      // ============================================
      // Payment Intent Events (Credit Purchases)
      // ============================================
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      // ============================================
      // Refund Events
      // ============================================
      case 'charge.refunded':
        await this.subscriptionService.handleRefund(event.data.object as Stripe.Charge);
        break;

      // ============================================
      // Customer Events
      // ============================================
      case 'customer.updated':
        // Log for now, could sync billing email changes
        this.logger.debug(`Customer updated: ${(event.data.object as Stripe.Customer).id}`);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn('Checkout completed without tenantId metadata');
      return;
    }

    this.logger.log(`Checkout completed for tenant ${tenantId}, mode: ${session.mode}`);

    if (session.mode === 'subscription') {
      // Subscription is handled by customer.subscription.created event
      this.logger.debug('Subscription checkout - waiting for subscription.created event');
    } else if (session.mode === 'payment') {
      // One-time payment (could be credit purchase via checkout)
      const credits = parseInt(session.metadata?.credits || '0', 10);
      if (credits > 0) {
        await this.walletService.addCredits(
          tenantId,
          credits,
          TransactionType.CREDIT_PURCHASE,
          session.payment_intent as string,
          {
            checkoutSessionId: session.id,
            package: session.metadata?.package,
          }
        );
        this.logger.log(`Added ${credits} credits for tenant ${tenantId} from checkout`);
      }
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const tenantId = paymentIntent.metadata?.tenantId;
    const type = paymentIntent.metadata?.type;

    if (!tenantId) {
      this.logger.debug('Payment intent without tenantId - might be subscription payment');
      return;
    }

    if (type === 'credit_purchase') {
      const credits = parseInt(paymentIntent.metadata?.credits || '0', 10);
      if (credits > 0) {
        try {
          await this.walletService.addCredits(
            tenantId,
            credits,
            TransactionType.CREDIT_PURCHASE,
            paymentIntent.id,
            {
              package: paymentIntent.metadata?.package,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
            }
          );
          this.logger.log(`Added ${credits} credits for tenant ${tenantId} from payment intent`);
        } catch (error) {
          this.logger.error(`Failed to add credits for tenant ${tenantId}:`, error);
        }
      }
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const tenantId = paymentIntent.metadata?.tenantId;
    if (!tenantId) {
      return;
    }

    this.logger.warn(
      `Payment intent failed for tenant ${tenantId}: ${paymentIntent.last_payment_error?.message}`
    );

    // Could send notification to user here
  }

  // ============================================
  // Idempotency Helpers
  // ============================================

  private isEventProcessed(eventId: string): boolean {
    const timestamp = this.processedEvents.get(eventId);
    if (!timestamp) return false;

    const now = Date.now();
    if (now - timestamp > this.IDEMPOTENCY_TTL_MS) {
      this.processedEvents.delete(eventId);
      return false;
    }

    return true;
  }

  private markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  private cleanupProcessedEvents(): void {
    const now = Date.now();
    for (const [eventId, timestamp] of this.processedEvents.entries()) {
      if (now - timestamp > this.IDEMPOTENCY_TTL_MS) {
        this.processedEvents.delete(eventId);
      }
    }
  }
}
