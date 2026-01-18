import { Controller, Get, Post, Put, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators';
import { WalletService } from '../services/wallet.service';
import {
  CreateTopUpSessionDto,
  UpdateWalletSettingsDto,
  WalletResponseDto,
  TransactionQueryDto,
  TransactionListResponseDto,
} from '../dto/wallet.dto';

@ApiTags('Billing - Wallet')
@Controller('billing/wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance and settings' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getWallet(@CurrentUser() user: any): Promise<WalletResponseDto> {
    return this.walletService.getWallet(user.tenantId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update wallet settings' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async updateSettings(
    @CurrentUser() user: any,
    @Body() dto: UpdateWalletSettingsDto
  ): Promise<WalletResponseDto> {
    return this.walletService.updateWalletSettings(user.tenantId, dto);
  }

  @Post('topup')
  @ApiOperation({ summary: 'Create top-up checkout session' })
  @ApiResponse({
    status: 201,
    schema: { properties: { url: { type: 'string' }, sessionId: { type: 'string' } } },
  })
  async createTopUpSession(
    @CurrentUser() user: any,
    @Body() dto: CreateTopUpSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    return this.walletService.createTopUpSession(user.tenantId, user.stripeCustomerId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiResponse({ status: 200, type: TransactionListResponseDto })
  async getTransactions(
    @CurrentUser() user: any,
    @Query() query: TransactionQueryDto
  ): Promise<TransactionListResponseDto> {
    return this.walletService.getTransactions(user.tenantId, query);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get available balance' })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        balance: { type: 'number' },
        available: { type: 'number' },
        reserved: { type: 'number' },
        currency: { type: 'string' },
      },
    },
  })
  async getBalance(@CurrentUser() user: any): Promise<{
    balance: number;
    available: number;
    reserved: number;
    currency: string;
  }> {
    const wallet = await this.walletService.getWallet(user.tenantId);
    return {
      balance: wallet.balance,
      available: wallet.availableBalance,
      reserved: wallet.reservedBalance,
      currency: wallet.currency,
    };
  }
}
