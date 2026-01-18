import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators';
import { SubscriptionService } from '../services/subscription.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  CreateCheckoutSessionDto,
  SubscriptionResponseDto,
  PlanResponseDto,
  InvoiceResponseDto,
  InvoiceListResponseDto,
} from '../dto/subscription.dto';

@ApiTags('Billing - Subscriptions')
@Controller('billing/subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({ status: 200, type: [PlanResponseDto] })
  async getPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionService.getAllPlans();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current subscription' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async getSubscription(@CurrentUser() user: any): Promise<SubscriptionResponseDto | null> {
    return this.subscriptionService.getSubscription(user.tenantId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new subscription' })
  @ApiResponse({ status: 201, type: SubscriptionResponseDto })
  async createSubscription(
    @CurrentUser() user: any,
    @Body() dto: CreateSubscriptionDto
  ): Promise<SubscriptionResponseDto> {
    await this.subscriptionService.createSubscription(user.tenantId, user.stripeCustomerId, dto);
    const subscription = await this.subscriptionService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Failed to retrieve created subscription');
    }
    return subscription;
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update subscription (change plan)' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async updateSubscription(
    @CurrentUser() user: any,
    @Body() dto: UpdateSubscriptionDto
  ): Promise<SubscriptionResponseDto> {
    await this.subscriptionService.updateSubscription(user.tenantId, dto);
    const subscription = await this.subscriptionService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async cancelSubscription(
    @CurrentUser() user: any,
    @Body() dto: CancelSubscriptionDto
  ): Promise<SubscriptionResponseDto> {
    await this.subscriptionService.cancelSubscription(user.tenantId, dto);
    const subscription = await this.subscriptionService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  @Post('reactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reactivate cancelled subscription' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async reactivateSubscription(@CurrentUser() user: any): Promise<SubscriptionResponseDto> {
    await this.subscriptionService.reactivateSubscription(user.tenantId);
    const subscription = await this.subscriptionService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiResponse({
    status: 201,
    schema: { properties: { url: { type: 'string' }, sessionId: { type: 'string' } } },
  })
  async createCheckoutSession(
    @CurrentUser() user: any,
    @Body() dto: CreateCheckoutSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    return this.subscriptionService.createCheckoutSession(
      user.tenantId,
      user.stripeCustomerId,
      dto
    );
  }

  @Post('onboarding-checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create Stripe checkout session for onboarding (new user plan selection)',
  })
  @ApiResponse({
    status: 201,
    schema: { properties: { url: { type: 'string' }, sessionId: { type: 'string' } } },
  })
  async createOnboardingCheckoutSession(
    @CurrentUser() user: any,
    @Body() dto: CreateCheckoutSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    return this.subscriptionService.createOnboardingCheckoutSession(
      user.tenantId,
      user.stripeCustomerId,
      dto
    );
  }

  @Post('billing-portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  @ApiResponse({
    status: 201,
    schema: { properties: { url: { type: 'string' } } },
  })
  async createBillingPortalSession(@CurrentUser() user: any): Promise<{ url: string }> {
    return this.subscriptionService.createBillingPortalSession(user.stripeCustomerId);
  }

  // ==================== INVOICES ====================

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get invoice history' })
  @ApiResponse({ status: 200, type: InvoiceListResponseDto })
  async getInvoices(
    @CurrentUser() user: any,
    @Query('limit') limit?: number
  ): Promise<InvoiceListResponseDto> {
    const invoices = await this.subscriptionService.getInvoices(user.stripeCustomerId, limit || 20);
    return {
      data: invoices,
      total: invoices.length,
    };
  }

  @Get('invoices/:invoiceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get single invoice' })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  async getInvoice(
    @CurrentUser() user: any,
    @Param('invoiceId') invoiceId: string
  ): Promise<InvoiceResponseDto> {
    return this.subscriptionService.getInvoice(user.stripeCustomerId, invoiceId);
  }
}
