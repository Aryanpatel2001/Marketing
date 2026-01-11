import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parsePhoneNumber } from 'libphonenumber-js';
import {
  PhoneValidationResult,
  RetryOptions,
  SendSmsOptions,
  SmsProvider,
  SmsResult,
} from './providers/sms-provider.interface';
import { TwilioProvider } from './providers/twilio.provider';

export interface SegmentCalculation {
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
  charactersPerSegment: number;
  totalCharacters: number;
  remainingCharacters: number;
}

export interface CostEstimate {
  estimatedCost: number;
  costPerSms: number;
  segments: number;
  country: string;
  currency: string;
}

export interface BulkSendOptions {
  delayMs?: number; // Delay between messages
  batchSize?: number; // Number of messages to send in parallel
  rateLimit?: number; // Max messages per second
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly providers: Map<string, SmsProvider>;
  private readonly defaultProvider: SmsProvider;
  private readonly isConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly twilioProvider: TwilioProvider
  ) {
    // Initialize providers map
    this.providers = new Map([['twilio', this.twilioProvider]]);

    // Set default provider
    this.defaultProvider = this.twilioProvider;
    this.isConfigured = this.defaultProvider.isReady();

    if (this.isConfigured) {
      this.logger.log('SMS Service initialized successfully');
    } else {
      this.logger.warn('SMS Service not configured. Configure at least one SMS provider.');
    }
  }

  /**
   * Send a single SMS message
   */
  async sendSms(options: SendSmsOptions, retryOptions?: RetryOptions): Promise<SmsResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'SMS service not configured',
      };
    }

    // Validate phone number
    const validation = this.validatePhoneNumber(options.to);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid phone number: ${validation.reason}`,
      };
    }

    // Use formatted phone number (validation ensures it exists)
    const formattedOptions = {
      ...options,
      to: validation.formatted || options.to,
    };

    // Send via default provider
    return this.defaultProvider.sendSms(formattedOptions, retryOptions);
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSms(messages: SendSmsOptions[], options?: BulkSendOptions): Promise<SmsResult[]> {
    if (!this.isReady()) {
      throw new Error('SMS service not configured');
    }

    const delayMs = options?.delayMs ?? 100;
    const batchSize = options?.batchSize ?? 10;
    const _rateLimit = options?.rateLimit ?? 10; // messages per second

    const results: SmsResult[] = [];
    const batches: SendSmsOptions[][] = [];

    // Split into batches
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    // Process batches
    for (const batch of batches) {
      const batchPromises = batch.map((msg) => this.sendSms(msg));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Apply rate limiting delay
      if (delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    return results;
  }

  /**
   * Validate a phone number
   */
  validatePhoneNumber(phone: string, defaultCountry?: string): PhoneValidationResult {
    try {
      const phoneNumber = parsePhoneNumber(phone, defaultCountry);

      if (!phoneNumber.isValid()) {
        return {
          valid: false,
          reason: 'Invalid phone number format',
        };
      }

      const type = phoneNumber.getType();

      // Check if it's likely a mobile number
      if (type && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(type)) {
        this.logger.warn(`Phone number ${phone} is type ${type}, may not support SMS`);
      }

      return {
        valid: true,
        formatted: phoneNumber.format('E.164'),
        country: phoneNumber.country,
        type: type || 'unknown',
      };
    } catch (error: any) {
      return {
        valid: false,
        reason: error.message || 'Failed to parse phone number',
      };
    }
  }

  /**
   * Calculate SMS segments for a message
   * GSM-7: 160 chars for single, 153 for concatenated
   * UCS-2 (Unicode): 70 chars for single, 67 for concatenated
   */
  calculateSegments(message: string): SegmentCalculation {
    // GSM 7-bit character set
    /* eslint-disable no-useless-escape */
    const gsmCharset =
      /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\^{}\\\[~\]|€]*$/;
    /* eslint-enable no-useless-escape */

    const isGsm = gsmCharset.test(message);
    const encoding: 'GSM-7' | 'UCS-2' = isGsm ? 'GSM-7' : 'UCS-2';

    // Single segment limits
    const singleSegmentLimit = isGsm ? 160 : 70;
    // Concatenated segment limits (header takes space)
    const concatSegmentLimit = isGsm ? 153 : 67;

    const messageLength = message.length;

    let segments: number;
    let charactersPerSegment: number;
    let remainingCharacters: number;

    if (messageLength <= singleSegmentLimit) {
      segments = 1;
      charactersPerSegment = singleSegmentLimit;
      remainingCharacters = singleSegmentLimit - messageLength;
    } else {
      segments = Math.ceil(messageLength / concatSegmentLimit);
      charactersPerSegment = concatSegmentLimit;
      remainingCharacters = segments * concatSegmentLimit - messageLength;
    }

    return {
      segments,
      encoding,
      charactersPerSegment,
      totalCharacters: messageLength,
      remainingCharacters,
    };
  }

  /**
   * Estimate cost for sending an SMS
   * Note: Actual costs vary by country and provider
   */
  async estimateCost(message: string, phoneNumber: string): Promise<CostEstimate> {
    const validation = this.validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      throw new Error(`Invalid phone number: ${validation.reason}`);
    }

    const segments = this.calculateSegments(message);
    const country = validation.country || 'US';

    // Default pricing (approximate, should be loaded from config or database)
    const pricingMap: Record<string, number> = {
      US: 0.0079,
      CA: 0.0079,
      GB: 0.04,
      IN: 0.0065,
      AU: 0.08,
      // Add more countries as needed
    };

    const costPerSms = pricingMap[country] || 0.01; // Default fallback
    const estimatedCost = costPerSms * segments.segments;

    return {
      estimatedCost,
      costPerSms,
      segments: segments.segments,
      country,
      currency: 'USD',
    };
  }

  /**
   * Check if SMS service is ready
   */
  isReady(): boolean {
    return this.isConfigured && this.defaultProvider.isReady();
  }

  /**
   * Check credentials for all configured providers
   */
  async checkCredentials(): Promise<{
    success: boolean;
    providers: Record<string, any>;
  }> {
    const providerResults: Record<string, any> = {};

    for (const [name, provider] of this.providers.entries()) {
      try {
        const result = await provider.checkCredentials();
        providerResults[name] = result;
      } catch (error: any) {
        providerResults[name] = {
          success: false,
          error: error.message,
        };
      }
    }

    const allSuccess = Object.values(providerResults).every((r: any) => r.success);

    return {
      success: allSuccess,
      providers: providerResults,
    };
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: string): SmsProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
