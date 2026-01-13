import { EncryptionService } from '@/common/services/encryption.service';
import { TenantSmsSettings } from '@/modules/sms/entities/tenant-sms-settings.entity';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Twilio from 'twilio';
import { Repository } from 'typeorm';

export interface TenantTwilioClient {
  client: Twilio.Twilio;
  isShared: boolean;
  messagingServiceSid?: string;
  accountSid: string;
}

interface CachedClient {
  client: Twilio.Twilio;
  accountSid: string;
  messagingServiceSid?: string;
  expiresAt: number;
}

@Injectable()
export class TwilioProviderFactory {
  private readonly logger = new Logger(TwilioProviderFactory.name);

  // Cache for tenant-specific clients (BYOC)
  private readonly clientCache: Map<string, CachedClient> = new Map();
  private readonly cacheTtlMs = 30 * 60 * 1000; // 30 minutes

  // Shared platform client
  private readonly sharedClient: Twilio.Twilio | null = null;
  private readonly sharedAccountSid: string | null;
  private readonly sharedMessagingServiceSid: string | null;
  private readonly sharedPhoneNumber: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    @InjectRepository(TenantSmsSettings)
    private readonly settingsRepository: Repository<TenantSmsSettings>
  ) {
    // Initialize shared platform client
    this.sharedAccountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') || null;
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || null;
    this.sharedMessagingServiceSid =
      this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID') || null;
    this.sharedPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || null;

    if (this.sharedAccountSid && authToken) {
      try {
        this.sharedClient = Twilio(this.sharedAccountSid, authToken);
        this.logger.log('Shared Twilio client initialized');
      } catch (error: any) {
        this.logger.error(`Failed to initialize shared Twilio client: ${error.message}`);
      }
    } else {
      this.logger.warn('Shared Twilio credentials not configured');
    }

    // Set up periodic cache cleanup
    setInterval(() => this.cleanExpiredCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Get the shared platform Twilio client
   */
  getSharedClient(): TenantTwilioClient | null {
    if (!this.sharedClient || !this.sharedAccountSid) {
      return null;
    }

    return {
      client: this.sharedClient,
      isShared: true,
      accountSid: this.sharedAccountSid,
      messagingServiceSid: this.sharedMessagingServiceSid || undefined,
    };
  }

  /**
   * Get the shared phone number (for trial accounts or shared pool)
   */
  getSharedPhoneNumber(): string | null {
    return this.sharedPhoneNumber;
  }

  /**
   * Get Twilio client for a specific tenant
   * Returns BYOC client if configured, otherwise shared client
   */
  async getClientForTenant(tenantId: string): Promise<TenantTwilioClient | null> {
    // Check if tenant has BYOC credentials
    const settings = await this.settingsRepository.findOne({
      where: { tenantId },
    });

    // If no settings or BYOC not enabled, return shared client
    if (!settings || !settings.byocEnabled) {
      return this.getSharedClient();
    }

    // Check if BYOC credentials are configured
    if (!settings.twilioAccountSidEnc || !settings.twilioAuthTokenEnc) {
      this.logger.warn(`Tenant ${tenantId} has BYOC enabled but no credentials configured`);
      return this.getSharedClient();
    }

    // Check cache first
    const cached = this.clientCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        client: cached.client,
        isShared: false,
        accountSid: cached.accountSid,
        messagingServiceSid: cached.messagingServiceSid,
      };
    }

    // Decrypt credentials and create new client
    try {
      if (!this.encryptionService.isAvailable()) {
        this.logger.error('Encryption service not available for BYOC decryption');
        return this.getSharedClient();
      }

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

      // Create tenant-specific client
      const client = Twilio(accountSid, authToken);

      // Cache the client
      const cachedEntry: CachedClient = {
        client,
        accountSid,
        messagingServiceSid: settings.twilioMessagingServiceSid || undefined,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
      this.clientCache.set(tenantId, cachedEntry);

      this.logger.debug(`Created BYOC Twilio client for tenant ${tenantId}`);

      return {
        client,
        isShared: false,
        accountSid,
        messagingServiceSid: settings.twilioMessagingServiceSid || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create BYOC client for tenant ${tenantId}: ${error.message}`);
      // Fall back to shared client
      return this.getSharedClient();
    }
  }

  /**
   * Invalidate cached client for a tenant
   * Call this when BYOC credentials are updated
   */
  invalidateCache(tenantId: string): void {
    this.clientCache.delete(tenantId);
    this.logger.debug(`Invalidated Twilio client cache for tenant ${tenantId}`);
  }

  /**
   * Verify BYOC credentials for a tenant
   */
  async verifyByocCredentials(
    accountSid: string,
    authToken: string
  ): Promise<{
    valid: boolean;
    balance?: number;
    accountName?: string;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const client = Twilio(accountSid, authToken);

      // Verify by fetching account details
      const account = await client.api.v2010.accounts(accountSid).fetch();

      if (account.status !== 'active') {
        errors.push(`Account status is ${account.status}, not active`);
      }

      // Get balance
      const balance = await client.balance.fetch();
      const balanceAmount = parseFloat(balance.balance);

      if (balanceAmount < 5) {
        errors.push(`Low balance: $${balanceAmount.toFixed(2)}`);
      }

      return {
        valid: account.status === 'active',
        balance: balanceAmount,
        accountName: account.friendlyName,
        errors,
      };
    } catch (error: any) {
      this.logger.error(`BYOC credential verification failed: ${error.message}`);
      errors.push(`Credential verification failed: ${error.message}`);

      return {
        valid: false,
        errors,
      };
    }
  }

  /**
   * Clean expired entries from cache
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [tenantId, cached] of this.clientCache.entries()) {
      if (cached.expiresAt < now) {
        this.clientCache.delete(tenantId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired Twilio client(s) from cache`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ tenantId: string; expiresIn: number }> } {
    const now = Date.now();
    const entries = Array.from(this.clientCache.entries()).map(([tenantId, cached]) => ({
      tenantId,
      expiresIn: Math.max(0, Math.round((cached.expiresAt - now) / 1000)),
    }));

    return {
      size: this.clientCache.size,
      entries,
    };
  }
}
