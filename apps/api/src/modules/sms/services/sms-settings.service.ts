import { EncryptionService } from '@/common/services/encryption.service';
import { SubscriptionPlan, Tenant } from '@/modules/tenants/entities/tenant.entity';
import { TwilioProviderFactory } from '@/providers/sms/twilio-provider.factory';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { SenderType, TenantSmsSettings } from '../entities/tenant-sms-settings.entity';

export interface ConfigureByocDto {
  accountSid: string;
  authToken: string;
  messagingServiceSid?: string;
}

export interface UpdateSmsSettingsDto {
  defaultSenderType?: SenderType;
  defaultPhoneNumberId?: string;
  defaultSenderIdId?: string;
  maxSmsPerMinute?: number;
  maxSmsPerDay?: number;
  webhookUrl?: string;
  internationalSmsEnabled?: boolean;
}

export interface ByocVerificationResult {
  valid: boolean;
  balance?: number;
  accountName?: string;
  errors: string[];
}

// Plan-based SMS rate limits
const PLAN_SMS_LIMITS: Record<SubscriptionPlan, { perMinute: number; perDay: number }> = {
  [SubscriptionPlan.FREE]: { perMinute: 10, perDay: 100 },
  [SubscriptionPlan.STARTER]: { perMinute: 30, perDay: 1000 },
  [SubscriptionPlan.GROWTH]: { perMinute: 60, perDay: 5000 },
  [SubscriptionPlan.PRO]: { perMinute: 100, perDay: 10000 },
  [SubscriptionPlan.ENTERPRISE]: { perMinute: 1000, perDay: 100000 },
};

@Injectable()
export class SmsSettingsService {
  private readonly logger = new Logger(SmsSettingsService.name);

  constructor(
    @InjectRepository(TenantSmsSettings)
    private readonly settingsRepository: Repository<TenantSmsSettings>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly encryptionService: EncryptionService,
    private readonly twilioProviderFactory: TwilioProviderFactory
  ) {}

  /**
   * Get tenant SMS settings (create default if not exists)
   */
  async getSettings(tenantId: string): Promise<TenantSmsSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { tenantId },
    });

    if (!settings) {
      // Create default settings
      settings = await this.createDefaultSettings(tenantId);
    }

    return settings;
  }

  /**
   * Create default settings for a tenant
   */
  private async createDefaultSettings(tenantId: string): Promise<TenantSmsSettings> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planLimits = PLAN_SMS_LIMITS[tenant.plan] || PLAN_SMS_LIMITS[SubscriptionPlan.FREE];

    const settings = this.settingsRepository.create({
      tenantId,
      defaultSenderType: SenderType.SHARED,
      byocEnabled: false,
      maxSmsPerMinute: planLimits.perMinute,
      maxSmsPerDay: planLimits.perDay,
      internationalSmsEnabled: tenant.plan === SubscriptionPlan.ENTERPRISE,
    });

    const savedSettings = await this.settingsRepository.save(settings);
    this.logger.log(`Created default SMS settings for tenant ${tenantId}`);

    return savedSettings;
  }

  /**
   * Update SMS settings
   */
  async updateSettings(tenantId: string, dto: UpdateSmsSettingsDto): Promise<TenantSmsSettings> {
    const settings = await this.getSettings(tenantId);

    // Validate sender type transitions
    if (dto.defaultSenderType) {
      await this.validateSenderTypeChange(tenantId, dto.defaultSenderType);
      settings.defaultSenderType = dto.defaultSenderType;
    }

    if (dto.defaultPhoneNumberId !== undefined) {
      settings.defaultPhoneNumberId = dto.defaultPhoneNumberId;
    }

    if (dto.defaultSenderIdId !== undefined) {
      settings.defaultSenderIdId = dto.defaultSenderIdId;
    }

    // Validate and apply rate limits
    if (dto.maxSmsPerMinute !== undefined || dto.maxSmsPerDay !== undefined) {
      await this.validateRateLimits(tenantId, dto.maxSmsPerMinute, dto.maxSmsPerDay);
      if (dto.maxSmsPerMinute !== undefined) {
        settings.maxSmsPerMinute = dto.maxSmsPerMinute;
      }
      if (dto.maxSmsPerDay !== undefined) {
        settings.maxSmsPerDay = dto.maxSmsPerDay;
      }
    }

    if (dto.webhookUrl !== undefined) {
      settings.webhookUrl = dto.webhookUrl;
      // Generate new webhook secret if URL is set
      if (dto.webhookUrl) {
        settings.webhookSecret = this.generateWebhookSecret();
      }
    }

    if (dto.internationalSmsEnabled !== undefined) {
      // Only Enterprise can enable international SMS
      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
      if (dto.internationalSmsEnabled && tenant?.plan !== SubscriptionPlan.ENTERPRISE) {
        throw new ForbiddenException('International SMS is only available on Enterprise plan');
      }
      settings.internationalSmsEnabled = dto.internationalSmsEnabled;
    }

    return this.settingsRepository.save(settings);
  }

  /**
   * Configure BYOC credentials (Enterprise only)
   */
  async configureByoc(
    tenantId: string,
    dto: ConfigureByocDto
  ): Promise<{
    success: boolean;
    accountName?: string;
    balance?: number;
    errors: string[];
  }> {
    // Check if Enterprise plan
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.plan !== SubscriptionPlan.ENTERPRISE) {
      throw new ForbiddenException('BYOC is only available on Enterprise plan');
    }

    // Check if encryption is available
    if (!this.encryptionService.isAvailable()) {
      throw new BadRequestException(
        'Encryption service not configured. Contact support to enable BYOC.'
      );
    }

    // Verify credentials before storing
    const verification = await this.twilioProviderFactory.verifyByocCredentials(
      dto.accountSid,
      dto.authToken
    );

    if (!verification.valid) {
      return {
        success: false,
        errors: verification.errors,
      };
    }

    // Get or create settings
    const settings = await this.getSettings(tenantId);

    // Encrypt credentials with a shared IV
    const _iv = crypto.randomBytes(12).toString('hex');

    const sidEncrypted = this.encryptionService.encrypt(dto.accountSid);
    const tokenEncrypted = this.encryptionService.encrypt(dto.authToken);

    // Store encrypted credentials
    settings.byocEnabled = true;
    settings.twilioAccountSidEnc = sidEncrypted.encrypted;
    settings.twilioAuthTokenEnc = tokenEncrypted.encrypted;
    settings.twilioEncryptionIv = sidEncrypted.iv; // Use the IV from first encryption
    settings.twilioSidTag = sidEncrypted.tag;
    settings.twilioTokenTag = tokenEncrypted.tag;
    settings.twilioMessagingServiceSid = dto.messagingServiceSid || null;
    settings.byocVerifiedAt = new Date();
    settings.defaultSenderType = SenderType.BYOC;

    await this.settingsRepository.save(settings);

    // Invalidate any cached client
    this.twilioProviderFactory.invalidateCache(tenantId);

    this.logger.log(`BYOC credentials configured for tenant ${tenantId}`);

    return {
      success: true,
      accountName: verification.accountName,
      balance: verification.balance,
      errors: [],
    };
  }

  /**
   * Verify existing BYOC credentials
   */
  async verifyByocCredentials(tenantId: string): Promise<ByocVerificationResult> {
    const settings = await this.getSettings(tenantId);

    if (!settings.byocEnabled || !settings.twilioAccountSidEnc || !settings.twilioAuthTokenEnc) {
      return {
        valid: false,
        errors: ['BYOC is not configured'],
      };
    }

    try {
      // Decrypt credentials
      const accountSid = this.encryptionService.decrypt({
        encrypted: settings.twilioAccountSidEnc,
        iv: settings.twilioEncryptionIv!,
        tag: settings.twilioSidTag!,
      });

      const authToken = this.encryptionService.decrypt({
        encrypted: settings.twilioAuthTokenEnc,
        iv: settings.twilioEncryptionIv!,
        tag: settings.twilioTokenTag!,
      });

      // Verify with Twilio
      const verification = await this.twilioProviderFactory.verifyByocCredentials(
        accountSid,
        authToken
      );

      if (verification.valid) {
        // Update verification timestamp
        settings.byocVerifiedAt = new Date();
        await this.settingsRepository.save(settings);
      }

      return verification;
    } catch (error: any) {
      this.logger.error(
        `Failed to verify BYOC credentials for tenant ${tenantId}: ${error.message}`
      );
      return {
        valid: false,
        errors: ['Failed to decrypt or verify credentials'],
      };
    }
  }

  /**
   * Disable BYOC and revert to shared pool
   */
  async disableByoc(tenantId: string): Promise<TenantSmsSettings> {
    const settings = await this.getSettings(tenantId);

    if (!settings.byocEnabled) {
      throw new BadRequestException('BYOC is not enabled');
    }

    // Clear encrypted credentials
    settings.byocEnabled = false;
    settings.twilioAccountSidEnc = null;
    settings.twilioAuthTokenEnc = null;
    settings.twilioEncryptionIv = null;
    settings.twilioSidTag = null;
    settings.twilioTokenTag = null;
    settings.twilioMessagingServiceSid = null;
    settings.byocVerifiedAt = null;
    settings.defaultSenderType = SenderType.SHARED;

    const updatedSettings = await this.settingsRepository.save(settings);

    // Invalidate cached client
    this.twilioProviderFactory.invalidateCache(tenantId);

    this.logger.log(`BYOC disabled for tenant ${tenantId}`);

    return updatedSettings;
  }

  /**
   * Get rate limits for a tenant based on plan
   */
  async getRateLimitsForPlan(tenantId: string): Promise<{
    maxPerMinute: number;
    maxPerDay: number;
    current: { perMinute: number; perDay: number };
    plan: SubscriptionPlan;
  }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const settings = await this.getSettings(tenantId);
    const planLimits = PLAN_SMS_LIMITS[tenant.plan] || PLAN_SMS_LIMITS[SubscriptionPlan.FREE];

    return {
      maxPerMinute: planLimits.perMinute,
      maxPerDay: planLimits.perDay,
      current: {
        perMinute: settings.maxSmsPerMinute,
        perDay: settings.maxSmsPerDay,
      },
      plan: tenant.plan,
    };
  }

  /**
   * Validate rate limit changes against plan limits
   */
  private async validateRateLimits(
    tenantId: string,
    perMinute?: number,
    perDay?: number
  ): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planLimits = PLAN_SMS_LIMITS[tenant.plan] || PLAN_SMS_LIMITS[SubscriptionPlan.FREE];

    if (perMinute !== undefined && perMinute > planLimits.perMinute) {
      throw new BadRequestException(
        `Rate limit ${perMinute}/min exceeds plan limit of ${planLimits.perMinute}/min`
      );
    }

    if (perDay !== undefined && perDay > planLimits.perDay) {
      throw new BadRequestException(
        `Rate limit ${perDay}/day exceeds plan limit of ${planLimits.perDay}/day`
      );
    }
  }

  /**
   * Validate sender type change based on plan
   */
  private async validateSenderTypeChange(tenantId: string, senderType: SenderType): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // BYOC requires Enterprise plan
    if (senderType === SenderType.BYOC && tenant.plan !== SubscriptionPlan.ENTERPRISE) {
      throw new ForbiddenException('BYOC is only available on Enterprise plan');
    }

    // Sender IDs require Enterprise plan
    if (senderType === SenderType.SENDER_ID && tenant.plan !== SubscriptionPlan.ENTERPRISE) {
      throw new ForbiddenException('Sender IDs are only available on Enterprise plan');
    }
  }

  /**
   * Generate a webhook secret
   */
  private generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateWebhookSecret(tenantId: string): Promise<string> {
    const settings = await this.getSettings(tenantId);

    if (!settings.webhookUrl) {
      throw new BadRequestException('No webhook URL configured');
    }

    settings.webhookSecret = this.generateWebhookSecret();
    await this.settingsRepository.save(settings);

    return settings.webhookSecret;
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(
    tenantId: string
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const settings = await this.getSettings(tenantId);

    if (!settings.webhookUrl) {
      throw new BadRequestException('No webhook URL configured');
    }

    const testPayload = {
      type: 'test',
      timestamp: new Date().toISOString(),
      tenantId,
      data: {
        message: 'This is a test webhook from your SMS settings',
        messageSid: 'TEST_' + Date.now(),
        status: 'delivered',
      },
    };

    try {
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': settings.webhookSecret || '',
          'X-Webhook-Signature': this.generateWebhookSignature(
            testPayload,
            settings.webhookSecret || ''
          ),
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        this.logger.log(`Webhook test successful for tenant ${tenantId}`);
        return { success: true, statusCode: response.status };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error: any) {
      this.logger.error(`Webhook test failed for tenant ${tenantId}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate webhook signature for payload
   */
  private generateWebhookSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return 'sha256=' + hmac.digest('hex');
  }

  /**
   * Get opt-out handling configuration
   */
  async getOptOutConfig(tenantId: string): Promise<{
    keywords: string[];
    autoReplyEnabled: boolean;
    autoReplyMessage: string;
  }> {
    const settings = await this.getSettings(tenantId);
    const metadata = settings.metadata || {};

    return {
      keywords: (metadata.optOutKeywords as string[]) || [
        'STOP',
        'UNSUBSCRIBE',
        'CANCEL',
        'END',
        'QUIT',
      ],
      autoReplyEnabled: (metadata.optOutAutoReplyEnabled as boolean) ?? true,
      autoReplyMessage:
        (metadata.optOutAutoReplyMessage as string) ||
        'You have been unsubscribed and will no longer receive SMS messages from us. Reply START to resubscribe.',
    };
  }

  /**
   * Update opt-out handling configuration
   */
  async updateOptOutConfig(
    tenantId: string,
    config: { autoReplyEnabled?: boolean; autoReplyMessage?: string }
  ): Promise<void> {
    const settings = await this.getSettings(tenantId);
    const metadata = settings.metadata || {};

    if (config.autoReplyEnabled !== undefined) {
      metadata.optOutAutoReplyEnabled = config.autoReplyEnabled;
    }

    if (config.autoReplyMessage !== undefined) {
      metadata.optOutAutoReplyMessage = config.autoReplyMessage;
    }

    settings.metadata = metadata;
    await this.settingsRepository.save(settings);

    this.logger.log(`Updated opt-out config for tenant ${tenantId}`);
  }
}
