import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators';
import { UsageService } from '../services/usage.service';
import { PricingService } from '../services/pricing.service';
import {
  UsageResponseDto,
  CostEstimateRequestDto,
  CostEstimateResponseDto,
  UsageSummaryDto,
} from '../dto/usage.dto';

@ApiTags('Billing - Usage')
@Controller('billing/usage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UsageController {
  constructor(
    private readonly usageService: UsageService,
    private readonly pricingService: PricingService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current usage and quotas' })
  @ApiResponse({ status: 200, type: UsageResponseDto })
  async getUsage(@CurrentUser() user: any): Promise<UsageResponseDto> {
    return this.usageService.getCurrentUsage(user.tenantId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get usage summary with subscription and wallet info' })
  @ApiResponse({ status: 200, type: UsageSummaryDto })
  async getUsageSummary(@CurrentUser() user: any): Promise<UsageSummaryDto> {
    return this.usageService.getUsageSummary(user.tenantId);
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimate cost for sending messages' })
  @ApiResponse({ status: 200, type: CostEstimateResponseDto })
  async estimateCost(
    @CurrentUser() user: any,
    @Body() dto: CostEstimateRequestDto
  ): Promise<CostEstimateResponseDto> {
    return this.usageService.estimateCost(user.tenantId, dto);
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Get pricing table' })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        sms: { type: 'object', additionalProperties: { type: 'number' } },
        email: { type: 'number' },
        whatsapp: {
          type: 'object',
          properties: {
            message: { type: 'number' },
            conversation: { type: 'number' },
          },
        },
      },
    },
  })
  async getPricing(): Promise<{
    sms: Record<string, number>;
    email: number;
    whatsapp: { message: number; conversation: number };
  }> {
    return this.pricingService.getPricingTable();
  }
}
