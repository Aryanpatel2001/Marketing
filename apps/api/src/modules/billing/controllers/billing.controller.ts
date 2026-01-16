import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantsService } from '../../tenants/tenants.service';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
  CreatePortalSessionDto,
} from '../dto/create-checkout-session.dto';
import {
  InvoiceDto,
  PaymentMethodDto,
  SubscriptionDto,
  SubscriptionPlanInfoDto,
} from '../dto/subscription.dto';
import { InvoiceFilters, InvoiceService } from '../services/invoice.service';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';

@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly invoiceService: InvoiceService,
    private readonly stripeService: StripeService,
    private readonly tenantsService: TenantsService
  ) {}

  // ============================================
  // Subscription Endpoints
  // ============================================

  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription details' })
  @ApiResponse({ status: 200, description: 'Subscription details', type: SubscriptionDto })
  async getSubscription(@CurrentTenant() tenantId: string): Promise<SubscriptionDto> {
    return this.subscriptionService.getCurrentSubscription(tenantId);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get available subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'List of available plans',
    type: [SubscriptionPlanInfoDto],
  })
  async getAvailablePlans(): Promise<SubscriptionPlanInfoDto[]> {
    return this.subscriptionService.getAvailablePlans();
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current usage statistics' })
  @ApiResponse({ status: 200, description: 'Usage statistics' })
  async getUsageStats(@CurrentTenant() tenantId: string) {
    return this.subscriptionService.getUsageStats(tenantId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session for subscription' })
  @ApiResponse({
    status: 201,
    description: 'Checkout session created',
    type: CheckoutSessionResponseDto,
  })
  async createCheckoutSession(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCheckoutSessionDto
  ): Promise<CheckoutSessionResponseDto> {
    return this.subscriptionService.createCheckoutSession(tenantId, dto);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  @ApiResponse({ status: 200, description: 'Portal session URL' })
  async createPortalSession(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePortalSessionDto
  ): Promise<{ url: string }> {
    return this.subscriptionService.createBillingPortalSession(tenantId, dto);
  }

  // ============================================
  // Invoice Endpoints
  // ============================================

  @Get('invoices')
  @ApiOperation({ summary: 'Get invoice history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of invoices' })
  async getInvoices(
    @CurrentTenant() tenantId: string,
    @Query() filters: InvoiceFilters
  ): Promise<{ data: InvoiceDto[]; total: number; page: number; limit: number }> {
    return this.invoiceService.getInvoices(tenantId, filters);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'Invoice details', type: InvoiceDto })
  async getInvoice(
    @CurrentTenant() tenantId: string,
    @Param('id') invoiceId: string
  ): Promise<InvoiceDto> {
    return this.invoiceService.getInvoiceById(tenantId, invoiceId);
  }

  @Post('invoices/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync invoices from Stripe' })
  @ApiResponse({ status: 200, description: 'Invoices synced' })
  async syncInvoices(@CurrentTenant() tenantId: string): Promise<{ message: string }> {
    await this.invoiceService.syncInvoicesFromStripe(tenantId);
    return { message: 'Invoices synced successfully' };
  }

  // ============================================
  // Payment Method Endpoints
  // ============================================

  @Get('payment-methods')
  @ApiOperation({ summary: 'Get saved payment methods' })
  @ApiResponse({ status: 200, description: 'List of payment methods', type: [PaymentMethodDto] })
  async getPaymentMethods(@CurrentTenant() tenantId: string): Promise<PaymentMethodDto[]> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant?.stripeCustomerId) {
      return [];
    }

    const methods = await this.stripeService.listPaymentMethods(tenant.stripeCustomerId);
    const customer = await this.stripeService.getCustomer(tenant.stripeCustomerId);
    const defaultMethodId = customer?.invoice_settings?.default_payment_method;

    return methods.map((method) => ({
      id: method.id,
      stripePaymentMethodId: method.id,
      type: method.type,
      isDefault: method.id === defaultMethodId,
      brand: method.card?.brand,
      lastFour: method.card?.last4,
      expMonth: method.card?.exp_month,
      expYear: method.card?.exp_year,
    }));
  }

  @Post('payment-methods/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, description: 'Default payment method set' })
  async setDefaultPaymentMethod(
    @CurrentTenant() tenantId: string,
    @Param('id') paymentMethodId: string
  ): Promise<{ message: string }> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant?.stripeCustomerId) {
      throw new Error('Stripe customer not found');
    }

    await this.stripeService.setDefaultPaymentMethod(tenant.stripeCustomerId, paymentMethodId);
    return { message: 'Default payment method updated' };
  }

  @Delete('payment-methods/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, description: 'Payment method removed' })
  async removePaymentMethod(
    @CurrentTenant() tenantId: string,
    @Param('id') paymentMethodId: string
  ): Promise<{ message: string }> {
    await this.stripeService.detachPaymentMethod(paymentMethodId);
    return { message: 'Payment method removed' };
  }
}
