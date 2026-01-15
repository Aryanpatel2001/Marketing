import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CountryCode, parsePhoneNumber, PhoneNumber } from 'libphonenumber-js';
import Twilio from 'twilio';
import {
  DeliveryStatus,
  PhoneValidationResult,
  RetryOptions,
  SendSmsOptions,
  SmsProvider,
  SmsResult,
} from './sms-provider.interface';

// Error types that should be retried
const RETRYABLE_ERROR_CODES = [
  '30001', // Queue overflow
  '30002', // Account suspended
  '30003', // Unreachable destination
  '30004', // Message blocked
  '30005', // Unknown destination
  '30006', // Landline or unreachable
  '63007', // Spam detected
  '63016', // Carrier violation
];

@Injectable()
export class TwilioProvider extends SmsProvider {
  readonly name = 'twilio';
  private readonly logger = new Logger(TwilioProvider.name);
  private twilioClient: Twilio.Twilio | null = null;
  private readonly isConfigured: boolean;
  private readonly accountSid: string | null;
  private readonly authToken: string | null;
  private readonly phoneNumber: string | null;
  private readonly messagingServiceSid: string | null;

  constructor(private readonly configService: ConfigService) {
    super();

    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') || null;
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || null;
    this.phoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || null;
    this.messagingServiceSid =
      this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID') || null;

    this.isConfigured = !!(this.accountSid && this.authToken);

    if (this.isConfigured) {
      try {
        this.twilioClient = Twilio(this.accountSid!, this.authToken!);
        this.logger.log('Twilio SMS provider initialized successfully');
      } catch (error: any) {
        this.logger.error(`Failed to initialize Twilio client: ${error.message}`);
      }
    } else {
      this.logger.warn(
        'Twilio SMS provider not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
      );
    }
  }

  /**
   * Send an SMS message with automatic retry on transient failures
   */
  async sendSms(options: SendSmsOptions, retryOptions?: RetryOptions): Promise<SmsResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Twilio provider not configured or initialized',
      };
    }

    const maxRetries = retryOptions?.maxRetries ?? 3;
    const baseDelayMs = retryOptions?.baseDelayMs ?? 1000;
    const maxDelayMs = retryOptions?.maxDelayMs ?? 30000;

    let lastError: string = '';
    let retriesUsed = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Sending SMS to ${options.to} (attempt ${attempt}/${maxRetries})`);

        const messageParams: any = {
          body: options.message,
          to: options.to,
          statusCallback: options.statusCallback,
        };

        // Use messaging service SID if available, otherwise use phone number
        if (this.messagingServiceSid) {
          messageParams.messagingServiceSid = this.messagingServiceSid;
        } else if (options.from || this.phoneNumber) {
          messageParams.from = options.from || this.phoneNumber;
        } else {
          return {
            success: false,
            error: 'No sender ID or messaging service configured',
          };
        }

        const message = await this.twilioClient!.messages.create(messageParams);

        this.logger.log(`SMS sent successfully: ${message.sid} to ${options.to}`);

        return {
          success: true,
          messageId: message.sid,
          externalId: message.sid,
          segments: message.numSegments ? parseInt(message.numSegments) : 1,
          cost: message.price ? parseFloat(message.price) : undefined,
          retriesUsed: attempt - 1,
        };
      } catch (error: any) {
        lastError = error.message || 'Unknown error';
        retriesUsed = attempt;

        this.logger.warn(`SMS send attempt ${attempt} failed: ${lastError} (code: ${error.code})`);

        // Check if error is retryable
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delayMs = this.calculateBackoff(attempt, baseDelayMs, maxDelayMs);
          this.logger.debug(`Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
          continue;
        }

        // Not retryable or max retries reached
        break;
      }
    }

    return {
      success: false,
      error: lastError,
      retriesUsed,
    };
  }

  /**
   * Get delivery status for a message
   */
  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    if (!this.isReady()) {
      throw new Error('Twilio provider not configured');
    }

    try {
      const message = await this.twilioClient!.messages(messageId).fetch();

      return {
        status: this.mapTwilioStatus(message.status),
        errorCode: message.errorCode?.toString(),
        errorMessage: message.errorMessage || undefined,
        timestamp: message.dateUpdated || message.dateSent,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get delivery status for ${messageId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a phone number
   */
  async validatePhoneNumber(
    phone: string,
    defaultCountry?: string
  ): Promise<PhoneValidationResult> {
    try {
      const phoneNumber: PhoneNumber = parsePhoneNumber(phone, defaultCountry as CountryCode);

      if (!phoneNumber.isValid()) {
        return {
          valid: false,
          reason: 'Invalid phone number format',
        };
      }

      // Check if it's a mobile number (preferred for SMS)
      const type = phoneNumber.getType();
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
   * Check if the provider is ready
   */
  isReady(): boolean {
    return this.isConfigured && this.twilioClient !== null;
  }

  /**
   * Check Twilio credentials and account status
   */
  async checkCredentials(): Promise<{
    success: boolean;
    configured: boolean;
    credentialsValid: boolean;
    balance?: number;
    errors: string[];
    recommendations: string[];
  }> {
    const errors: string[] = [];
    const recommendations: string[] = [];

    if (!this.isConfigured) {
      errors.push('Twilio credentials not configured');
      recommendations.push('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables');
      return {
        success: false,
        configured: false,
        credentialsValid: false,
        errors,
        recommendations,
      };
    }

    try {
      // Fetch account details to verify credentials
      const account = await this.twilioClient!.api.v2010.accounts(this.accountSid!).fetch();

      this.logger.log(`Twilio account verified: ${account.friendlyName} (${account.status})`);

      // Get balance
      const balance = await this.twilioClient!.balance.fetch();
      const balanceAmount = parseFloat(balance.balance);

      if (balanceAmount < 10) {
        recommendations.push(`Low balance: $${balanceAmount.toFixed(2)}. Consider adding funds.`);
      }

      // Check if phone number or messaging service is configured
      if (!this.phoneNumber && !this.messagingServiceSid) {
        errors.push('No sender phone number or messaging service configured');
        recommendations.push('Set TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
      }

      return {
        success: true,
        configured: true,
        credentialsValid: true,
        balance: balanceAmount,
        errors,
        recommendations,
      };
    } catch (error: any) {
      this.logger.error(`Twilio credentials check failed: ${error.message}`);
      errors.push(`Credentials validation failed: ${error.message}`);

      return {
        success: false,
        configured: true,
        credentialsValid: false,
        errors,
        recommendations,
      };
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.code) return false;

    const errorCode = error.code.toString();
    return RETRYABLE_ERROR_CODES.includes(errorCode);
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = exponentialDelay * Math.random() * 0.25;
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }

  /**
   * Map Twilio status to our standard status
   */
  private mapTwilioStatus(twilioStatus: string): DeliveryStatus['status'] {
    switch (twilioStatus) {
      case 'queued':
      case 'accepted':
        return 'queued';
      case 'sending':
      case 'sent':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'undelivered':
        return 'undelivered';
      case 'failed':
      default:
        return 'failed';
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
