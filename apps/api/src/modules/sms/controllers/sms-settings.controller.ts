import { CurrentTenant } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SenderType, TenantSmsSettings } from '../entities/tenant-sms-settings.entity';
import {
  ConfigureByocDto,
  SmsSettingsService,
  UpdateSmsSettingsDto,
} from '../services/sms-settings.service';

// Response DTOs
class SmsSettingsResponseDto {
  id: string;
  tenantId: string;
  defaultSenderType: SenderType;
  defaultPhoneNumberId: string | null;
  defaultSenderIdId: string | null;
  byocEnabled: boolean;
  byocVerifiedAt: Date | null;
  hasByocCredentials: boolean;
  maxSmsPerMinute: number;
  maxSmsPerDay: number;
  webhookUrl: string | null;
  webhookSecret: string | null;
  internationalSmsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class RateLimitsResponseDto {
  maxPerMinute: number;
  maxPerDay: number;
  current: {
    perMinute: number;
    perDay: number;
  };
  plan: string;
}

class ByocConfigResultDto {
  success: boolean;
  accountName?: string;
  balance?: number;
  errors: string[];
}

class ByocVerificationResultDto {
  valid: boolean;
  balance?: number;
  accountName?: string;
  errors: string[];
}

@ApiTags('SMS Settings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('sms/settings')
export class SmsSettingsController {
  constructor(private readonly smsSettingsService: SmsSettingsService) {}

  // ============================================
  // Get Settings
  // ============================================

  @Get()
  @ApiOperation({ summary: 'Get SMS settings for the tenant' })
  @ApiResponse({
    status: 200,
    description: 'SMS settings',
    type: SmsSettingsResponseDto,
  })
  async getSettings(@CurrentTenant() tenantId: string): Promise<SmsSettingsResponseDto> {
    const settings = await this.smsSettingsService.getSettings(tenantId);
    return this.toResponseDto(settings);
  }

  // ============================================
  // Update Settings
  // ============================================

  @Patch()
  @ApiOperation({ summary: 'Update SMS settings' })
  @ApiResponse({
    status: 200,
    description: 'Updated SMS settings',
    type: SmsSettingsResponseDto,
  })
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateSmsSettingsDto
  ): Promise<SmsSettingsResponseDto> {
    const settings = await this.smsSettingsService.updateSettings(tenantId, dto);
    return this.toResponseDto(settings);
  }

  // ============================================
  // Rate Limits
  // ============================================

  @Get('rate-limits')
  @ApiOperation({ summary: 'Get rate limits based on plan' })
  @ApiResponse({
    status: 200,
    description: 'Rate limits information',
    type: RateLimitsResponseDto,
  })
  async getRateLimits(@CurrentTenant() tenantId: string): Promise<RateLimitsResponseDto> {
    return this.smsSettingsService.getRateLimitsForPlan(tenantId);
  }

  // ============================================
  // BYOC (Bring Your Own Credentials) - Enterprise Only
  // ============================================

  @Post('byoc')
  @ApiOperation({
    summary: 'Configure BYOC Twilio credentials (Enterprise only)',
    description:
      'Configure your own Twilio credentials for SMS sending. This feature is only available on the Enterprise plan.',
  })
  @ApiResponse({
    status: 200,
    description: 'BYOC configuration result',
    type: ByocConfigResultDto,
  })
  async configureByoc(
    @CurrentTenant() tenantId: string,
    @Body() dto: ConfigureByocDto
  ): Promise<ByocConfigResultDto> {
    return this.smsSettingsService.configureByoc(tenantId, dto);
  }

  @Post('byoc/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify BYOC credentials',
    description:
      'Verify that your configured BYOC Twilio credentials are valid and check the account balance.',
  })
  @ApiResponse({
    status: 200,
    description: 'BYOC verification result',
    type: ByocVerificationResultDto,
  })
  async verifyByocCredentials(
    @CurrentTenant() tenantId: string
  ): Promise<ByocVerificationResultDto> {
    return this.smsSettingsService.verifyByocCredentials(tenantId);
  }

  @Delete('byoc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable BYOC and revert to shared pool',
    description:
      'Removes your BYOC Twilio credentials and reverts to using the shared platform pool for SMS sending.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated SMS settings after disabling BYOC',
    type: SmsSettingsResponseDto,
  })
  async disableByoc(@CurrentTenant() tenantId: string): Promise<SmsSettingsResponseDto> {
    const settings = await this.smsSettingsService.disableByoc(tenantId);
    return this.toResponseDto(settings);
  }

  // ============================================
  // Webhook Configuration
  // ============================================

  @Post('webhook/regenerate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate webhook secret',
    description:
      'Generate a new webhook secret for signature verification. The old secret will be invalidated immediately.',
  })
  @ApiResponse({
    status: 200,
    description: 'New webhook secret',
  })
  async regenerateWebhookSecret(
    @CurrentTenant() tenantId: string
  ): Promise<{ webhookSecret: string }> {
    const secret = await this.smsSettingsService.regenerateWebhookSecret(tenantId);
    return { webhookSecret: secret };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private toResponseDto(settings: TenantSmsSettings): SmsSettingsResponseDto {
    return {
      id: settings.id,
      tenantId: settings.tenantId,
      defaultSenderType: settings.defaultSenderType,
      defaultPhoneNumberId: settings.defaultPhoneNumberId,
      defaultSenderIdId: settings.defaultSenderIdId,
      byocEnabled: settings.byocEnabled,
      byocVerifiedAt: settings.byocVerifiedAt,
      hasByocCredentials: !!(settings.twilioAccountSidEnc && settings.twilioAuthTokenEnc),
      maxSmsPerMinute: settings.maxSmsPerMinute,
      maxSmsPerDay: settings.maxSmsPerDay,
      webhookUrl: settings.webhookUrl,
      webhookSecret: settings.webhookSecret,
      internationalSmsEnabled: settings.internationalSmsEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
