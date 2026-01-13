import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../../common/decorators';
import { WalletService } from '../services/wallet.service';
import { StripeService } from '../services/stripe.service';
import { TenantsService } from '../../tenants/tenants.service';
import { WalletBalanceDto, WalletTransactionDto, FilterTransactionsDto } from '../dto/wallet.dto';
import {
  PurchaseCreditsDto,
  PurchaseCreditsResponseDto,
  CreditPackageDto,
  CreditPackage,
} from '../dto/purchase-credits.dto';

@ApiTags('Wallet')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly stripeService: StripeService,
    private readonly tenantsService: TenantsService
  ) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance and credit information' })
  @ApiResponse({ status: 200, description: 'Wallet balance', type: WalletBalanceDto })
  async getBalance(@CurrentTenant() tenantId: string): Promise<WalletBalanceDto> {
    return this.walletService.getBalance(tenantId);
  }

  @Get('packages')
  @ApiOperation({ summary: 'Get available credit packages' })
  @ApiResponse({ status: 200, description: 'List of credit packages', type: [CreditPackageDto] })
  async getCreditPackages(): Promise<CreditPackageDto[]> {
    return this.stripeService.getCreditPackages();
  }

  @Post('credits')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create payment intent for credit purchase' })
  @ApiResponse({
    status: 200,
    description: 'Payment intent created',
    type: PurchaseCreditsResponseDto,
  })
  async purchaseCredits(
    @CurrentTenant() tenantId: string,
    @Body() dto: PurchaseCreditsDto
  ): Promise<PurchaseCreditsResponseDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant?.stripeCustomerId) {
      throw new Error('Stripe customer not found. Please complete account setup.');
    }

    const { credits, price } = this.stripeService.getCreditPackagePrice(
      dto.package,
      dto.customAmount
    );

    const paymentIntent = await this.stripeService.createPaymentIntent({
      customerId: tenant.stripeCustomerId,
      amount: price,
      currency: 'usd',
      metadata: {
        tenantId,
        type: 'credit_purchase',
        credits: credits.toString(),
        package: dto.package,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret || '',
      paymentIntentId: paymentIntent.id,
      amount: price,
      credits,
      currency: 'USD',
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by transaction type' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Transaction history' })
  async getTransactions(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterTransactionsDto
  ): Promise<{ data: WalletTransactionDto[]; total: number; page: number; limit: number }> {
    const result = await this.walletService.getTransactionHistory(tenantId, filters);

    return {
      data: result.data.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceBefore: Number(t.balanceBefore),
        balanceAfter: Number(t.balanceAfter),
        description: t.description || undefined,
        referenceType: t.referenceType || undefined,
        referenceId: t.referenceId || undefined,
        createdAt: t.createdAt,
        metadata: t.metadata || undefined,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Post('check-balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if wallet has sufficient balance for an amount' })
  @ApiResponse({ status: 200, description: 'Balance check result' })
  async checkBalance(
    @CurrentTenant() tenantId: string,
    @Body() body: { amount: number }
  ): Promise<{ sufficient: boolean; available: number; required: number }> {
    const balance = await this.walletService.getBalance(tenantId);

    return {
      sufficient: balance.availableCredits >= body.amount,
      available: balance.availableCredits,
      required: body.amount,
    };
  }
}
