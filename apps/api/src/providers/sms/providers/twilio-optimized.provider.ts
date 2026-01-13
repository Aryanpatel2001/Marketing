import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import Twilio from 'twilio';
import {
  DeliveryStatus,
  PhoneValidationResult,
  SendSmsOptions,
  SmsProvider,
  SmsResult,
} from './sms-provider.interface';

/**
 * Optimized Twilio Provider with HTTP connection pooling
 * Designed for high-throughput SMS sending (10K+ messages/minute)
 */
@Injectable()
export class TwilioOptimizedProvider extends SmsProvider {
  readonly name = 'twilio-optimized';
  private readonly logger = new Logger(TwilioOptimizedProvider.name);

  private twilioClient: Twilio.Twilio | null = null;
  private readonly isConfigured: boolean;
  private readonly accountSid: string | null;
  private readonly authToken: string | null;
  private readonly phoneNumber: string | null;
  private readonly messagingServiceSid: string | null;

  // HTTP Agent with keep-alive for connection reuse
  private readonly httpAgent: https.Agent;
  private readonly httpAgentConfig = {
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100, // Max concurrent connections
    maxFreeSockets: 20, // Max idle connections to keep
    timeout: 30000, // Socket timeout
    scheduling: 'fifo' as const,
  };

  // Metrics
  private metrics = {
    totalSent: 0,
    totalFailed: 0,
    totalRetries: 0,
    avgResponseTimeMs: 0,
    lastResetAt: new Date(),
  };

  constructor(private readonly configService: ConfigService) {
    super();

    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') || null;
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || null;
    this.phoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || null;
    this.messagingServiceSid =
      this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID') || null;

    this.isConfigured = !!(this.accountSid && this.authToken);

    // Create optimized HTTP agent
    this.httpAgent = new https.Agent(this.httpAgentConfig);

    if (this.isConfigured) {
      this.initializeClient();
    } else {
      this.logger.warn(
        'Twilio Optimized Provider not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
      );
    }
  }

  private initializeClient(): void {
    try {
      // Create Twilio client with custom HTTP agent
      this.twilioClient = Twilio(this.accountSid!, this.authToken!, {
        httpClient: undefined, // Will use default with our agent
        lazyLoading: true,
        autoRetry: true,
        maxRetries: 3,
      });

      // Configure the underlying HTTP client to use our agent
      // Note: Twilio SDK uses axios internally
      const axiosInstance = (this.twilioClient as any).httpClient?.axios;
      if (axiosInstance) {
        axiosInstance.defaults.httpsAgent = this.httpAgent;
        axiosInstance.defaults.timeout = 30000;
      }

      this.logger.log(
        `Twilio Optimized Provider initialized with connection pooling ` +
          `(maxSockets: ${this.httpAgentConfig.maxSockets})`
      );
    } catch (error: any) {
      this.logger.error(`Failed to initialize Twilio client: ${error.message}`);
    }
  }

  /**
   * Send SMS with optimized connection handling
   */
  async sendSms(options: SendSmsOptions): Promise<SmsResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Twilio provider not configured or initialized',
      };
    }

    const startTime = Date.now();

    try {
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

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(true, responseTime);

      this.logger.debug(`SMS sent: ${message.sid} to ${options.to} (${responseTime}ms)`);

      return {
        success: true,
        messageId: message.sid,
        externalId: message.sid,
        segments: message.numSegments ? parseInt(message.numSegments) : 1,
        cost: message.price ? parseFloat(message.price) : undefined,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(false, responseTime);

      this.logger.warn(`SMS send failed to ${options.to}: ${error.message} (${responseTime}ms)`);

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send multiple SMS messages in rapid succession (for batch operations)
   */
  async sendBatch(
    messages: Array<{ to: string; message: string; from?: string; statusCallback?: string }>
  ): Promise<SmsResult[]> {
    if (!this.isReady()) {
      return messages.map(() => ({
        success: false,
        error: 'Twilio provider not configured or initialized',
      }));
    }

    const results: SmsResult[] = [];

    // Send all messages without waiting (fire-and-forget with tracking)
    const promises = messages.map(async (msg) => {
      return this.sendSms({
        to: msg.to,
        message: msg.message,
        from: msg.from,
        statusCallback: msg.statusCallback,
      });
    });

    // Wait for all to complete
    const settledResults = await Promise.allSettled(promises);

    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          success: false,
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    return results;
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
   * Validate a phone number (uses libphonenumber-js, no API call)
   */
  async validatePhoneNumber(
    phone: string,
    defaultCountry?: string
  ): Promise<PhoneValidationResult> {
    // Import dynamically to avoid bundling issues
    const { parsePhoneNumber, PhoneNumber } = await import('libphonenumber-js');

    try {
      const phoneNumber = parsePhoneNumber(phone, defaultCountry as any);

      if (!phoneNumber?.isValid()) {
        return {
          valid: false,
          reason: 'Invalid phone number format',
        };
      }

      const type = phoneNumber.getType();
      if (type && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(type)) {
        this.logger.debug(`Phone number ${phone} is type ${type}, may not support SMS`);
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
   * Check if provider is ready
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
   * Get connection pool stats
   */
  getConnectionStats(): {
    activeSockets: number;
    freeSockets: number;
    pendingRequests: number;
    maxSockets: number;
  } {
    const agentStatus = this.httpAgent as any;
    return {
      activeSockets: Object.values(agentStatus.sockets || {}).flat().length,
      freeSockets: Object.values(agentStatus.freeSockets || {}).flat().length,
      pendingRequests: Object.values(agentStatus.requests || {}).flat().length,
      maxSockets: this.httpAgentConfig.maxSockets,
    };
  }

  /**
   * Get provider metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalSent: 0,
      totalFailed: 0,
      totalRetries: 0,
      avgResponseTimeMs: 0,
      lastResetAt: new Date(),
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(success: boolean, responseTimeMs: number): void {
    if (success) {
      this.metrics.totalSent++;
    } else {
      this.metrics.totalFailed++;
    }

    // Update rolling average response time
    const total = this.metrics.totalSent + this.metrics.totalFailed;
    this.metrics.avgResponseTimeMs =
      (this.metrics.avgResponseTimeMs * (total - 1) + responseTimeMs) / total;
  }

  /**
   * Map Twilio status to standard status
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
   * Gracefully shutdown the HTTP agent
   */
  async shutdown(): Promise<void> {
    this.httpAgent.destroy();
    this.logger.log('Twilio Optimized Provider HTTP agent destroyed');
  }
}
