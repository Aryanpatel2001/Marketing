import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { WalletService } from '../services/wallet.service';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { TenantSubscription } from '../entities/tenant-subscription.entity';

@ApiTags('Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    private readonly eventEmitter: EventEmitter2
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: any;

    try {
      // Use rawBody for Stripe signature verification (requires rawBody: true in NestFactory.create)
      const rawBody = (req as any).rawBody as Buffer;
      if (!rawBody) {
        this.logger.error('Raw body not available for webhook verification');
        throw new BadRequestException('Raw body not available');
      }
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    try {
      switch (event.type) {
        // Customer events
        case 'customer.created':
          await this.handleCustomerCreated(event.data.object);
          break;

        case 'customer.updated':
          this.logger.debug(`Customer updated: ${event.data.object.id}`);
          break;

        // Subscription events
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        // Invoice events
        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        // Checkout events
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;

        // Payment Intent events
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        default:
          this.logger.debug(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Error handling webhook ${event.type}: ${error.message}`, error.stack);
      // Don't throw - return 200 to prevent Stripe from retrying
    }

    return { received: true };
  }

  // ==================== CUSTOMER HANDLERS ====================

  private async handleCustomerCreated(customer: any): Promise<void> {
    this.logger.log(`Customer created: ${customer.id}, email: ${customer.email}`);
    // Customer is already created in our system during registration
    // This webhook confirms the customer was successfully created in Stripe
    // We can use this to sync any additional customer data if needed
    const tenantId = customer.metadata?.tenantId;
    if (tenantId) {
      this.logger.log(`Stripe customer ${customer.id} linked to tenant ${tenantId}`);
    }
  }

  // ==================== SUBSCRIPTION HANDLERS ====================

  private async handleSubscriptionCreated(subscription: any): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}`);
    await this.subscriptionService.handleSubscriptionCreated(subscription);
  }

  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
    await this.subscriptionService.handleSubscriptionUpdated(subscription);
  }

  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);
    await this.subscriptionService.handleSubscriptionDeleted(subscription);
  }

  // ==================== INVOICE HANDLERS ====================

  private async handleInvoicePaid(stripeInvoice: any): Promise<void> {
    this.logger.log(`Invoice paid: ${stripeInvoice.id}, amount: ${stripeInvoice.amount_paid}`);

    try {
      // Get tenant from subscription
      const subscription = await this.subscriptionRepository.findOne({
        where: { stripeSubscriptionId: stripeInvoice.subscription },
      });

      if (!subscription) {
        this.logger.warn(`No subscription found for invoice ${stripeInvoice.id}`);
        return;
      }

      // Check if invoice already exists
      let invoice = await this.invoiceRepository.findOne({
        where: { stripeInvoiceId: stripeInvoice.id },
      });

      if (!invoice) {
        // Create invoice record
        invoice = this.invoiceRepository.create({
          tenantId: subscription.tenantId,
          stripeInvoiceId: stripeInvoice.id,
          stripeCustomerId: stripeInvoice.customer,
          invoiceNumber: stripeInvoice.number || `INV-${Date.now()}`,
          status: InvoiceStatus.PAID,
          subtotal: stripeInvoice.subtotal / 100,
          tax: (stripeInvoice.tax || 0) / 100,
          total: stripeInvoice.total / 100,
          amountPaid: stripeInvoice.amount_paid / 100,
          amountDue: 0,
          currency: stripeInvoice.currency.toUpperCase(),
          issuedAt: new Date(stripeInvoice.created * 1000),
          dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
          paidAt: new Date(),
          periodStart: stripeInvoice.period_start
            ? new Date(stripeInvoice.period_start * 1000)
            : null,
          periodEnd: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdf: stripeInvoice.invoice_pdf,
          metadata: {
            lines: stripeInvoice.lines?.data?.map((line: any) => ({
              description: line.description,
              amount: line.amount / 100,
              quantity: line.quantity,
            })),
          },
        });

        await this.invoiceRepository.save(invoice);
        this.logger.log(`Created invoice record for ${stripeInvoice.id}`);
      } else {
        // Update existing invoice
        invoice.status = InvoiceStatus.PAID;
        invoice.amountPaid = stripeInvoice.amount_paid / 100;
        invoice.amountDue = 0;
        invoice.paidAt = new Date();
        await this.invoiceRepository.save(invoice);
        this.logger.log(`Updated invoice record for ${stripeInvoice.id}`);
      }

      // Emit event for email notification
      this.eventEmitter.emit('invoice.paid', {
        tenantId: subscription.tenantId,
        invoiceId: invoice.id,
        stripeInvoiceId: stripeInvoice.id,
        amount: stripeInvoice.amount_paid / 100,
        invoiceUrl: stripeInvoice.hosted_invoice_url,
        pdfUrl: stripeInvoice.invoice_pdf,
      });
    } catch (error: any) {
      this.logger.error(`Failed to handle invoice paid: ${error.message}`);
    }
  }

  private async handleInvoicePaymentFailed(stripeInvoice: any): Promise<void> {
    this.logger.warn(`Invoice payment failed: ${stripeInvoice.id}`);

    try {
      // Get subscription
      const subscription = await this.subscriptionRepository.findOne({
        where: { stripeSubscriptionId: stripeInvoice.subscription },
      });

      if (!subscription) {
        this.logger.warn(`No subscription found for failed invoice ${stripeInvoice.id}`);
        return;
      }

      // Update or create invoice record
      let invoice = await this.invoiceRepository.findOne({
        where: { stripeInvoiceId: stripeInvoice.id },
      });

      if (!invoice) {
        invoice = this.invoiceRepository.create({
          tenantId: subscription.tenantId,
          stripeInvoiceId: stripeInvoice.id,
          stripeCustomerId: stripeInvoice.customer,
          invoiceNumber: stripeInvoice.number || `INV-${Date.now()}`,
          status: InvoiceStatus.FAILED,
          subtotal: stripeInvoice.subtotal / 100,
          tax: (stripeInvoice.tax || 0) / 100,
          total: stripeInvoice.total / 100,
          amountPaid: 0,
          amountDue: stripeInvoice.amount_due / 100,
          currency: stripeInvoice.currency.toUpperCase(),
          issuedAt: new Date(stripeInvoice.created * 1000),
          dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
          periodStart: stripeInvoice.period_start
            ? new Date(stripeInvoice.period_start * 1000)
            : null,
          periodEnd: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          metadata: {
            failureReason: stripeInvoice.last_finalization_error?.message || 'Payment failed',
            attemptCount: stripeInvoice.attempt_count,
          },
        });
      } else {
        invoice.status = InvoiceStatus.FAILED;
        invoice.metadata = {
          ...(invoice.metadata || {}),
          failureReason: stripeInvoice.last_finalization_error?.message || 'Payment failed',
          attemptCount: stripeInvoice.attempt_count,
          lastAttemptAt: new Date().toISOString(),
        };
      }

      await this.invoiceRepository.save(invoice);

      // Emit event for payment failed notification
      this.eventEmitter.emit('invoice.payment_failed', {
        tenantId: subscription.tenantId,
        invoiceId: invoice.id,
        stripeInvoiceId: stripeInvoice.id,
        amount: stripeInvoice.amount_due / 100,
        attemptCount: stripeInvoice.attempt_count,
        nextAttempt: stripeInvoice.next_payment_attempt
          ? new Date(stripeInvoice.next_payment_attempt * 1000)
          : null,
      });

      this.logger.warn(
        `Invoice payment failed for tenant ${subscription.tenantId}, attempt ${stripeInvoice.attempt_count}`
      );
    } catch (error: any) {
      this.logger.error(`Failed to handle invoice payment failed: ${error.message}`);
    }
  }

  // ==================== CHECKOUT HANDLERS ====================

  private async handleCheckoutSessionCompleted(session: any): Promise<void> {
    this.logger.log(`Checkout session completed: ${session.id}, mode: ${session.mode}`);

    const metadata = session.metadata || {};

    // Handle wallet top-up
    if (metadata.type === 'wallet_topup') {
      const tenantId = metadata.tenantId;
      const amount = parseFloat(metadata.amount);

      if (tenantId && amount > 0) {
        await this.walletService.processTopUp(
          tenantId,
          amount,
          session.payment_intent as string | undefined,
          undefined,
          { sessionId: session.id }
        );
        this.logger.log(`Wallet topped up for tenant ${tenantId}: $${amount}`);
      }
      return;
    }

    // Handle onboarding subscription checkout
    if (metadata.type === 'onboarding' && session.mode === 'subscription' && session.subscription) {
      const tenantId = metadata.tenantId;
      const planTier = metadata.planTier;

      this.logger.log(
        `Onboarding checkout completed for tenant ${tenantId}, plan: ${planTier}, subscription: ${session.subscription}`
      );

      // The subscription.created webhook will handle creating the subscription record
      // But we emit an event for any additional onboarding logic
      this.eventEmitter.emit('onboarding.completed', {
        tenantId,
        planTier,
        stripeSubscriptionId: session.subscription,
        stripeCustomerId: session.customer,
        sessionId: session.id,
      });

      return;
    }

    // Handle regular subscription checkout
    if (session.mode === 'subscription' && session.subscription) {
      this.logger.log(`Subscription created via checkout: ${session.subscription}`);
      // Subscription webhook will handle the rest
    }
  }

  // ==================== PAYMENT INTENT HANDLERS ====================

  private async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);

    const metadata = paymentIntent.metadata || {};

    // Handle wallet top-up via payment intent
    if (metadata.type === 'wallet_topup') {
      const tenantId = metadata.tenantId;
      const amount = paymentIntent.amount / 100;

      if (tenantId && amount > 0) {
        await this.walletService.processTopUp(
          tenantId,
          amount,
          paymentIntent.id,
          paymentIntent.latest_charge,
          metadata
        );
      }
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    this.logger.warn(
      `Payment intent failed: ${paymentIntent.id}, error: ${paymentIntent.last_payment_error?.message}`
    );

    const metadata = paymentIntent.metadata || {};
    const tenantId = metadata.tenantId;

    if (tenantId) {
      // Emit event for payment failed notification
      this.eventEmitter.emit('payment.failed', {
        tenantId,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency?.toUpperCase(),
        errorMessage: paymentIntent.last_payment_error?.message || 'Payment failed',
        errorCode: paymentIntent.last_payment_error?.code,
        type: metadata.type || 'unknown',
      });

      this.logger.log(`Emitted payment.failed event for tenant ${tenantId}`);
    }
  }
}
