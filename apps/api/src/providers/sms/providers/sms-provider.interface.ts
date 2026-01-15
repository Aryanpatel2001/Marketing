export interface SendSmsOptions {
  to: string; // E.164 format: +1234567890
  from?: string; // Sender ID or phone number
  message: string;
  statusCallback?: string; // Webhook URL for delivery receipts
  metadata?: Record<string, string>;
}

export interface SmsResult {
  success: boolean;
  messageId?: string; // Provider's message ID
  externalId?: string; // Provider's external tracking ID
  segments?: number;
  cost?: number;
  error?: string;
  retriesUsed?: number;
}

export interface DeliveryStatus {
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  errorCode?: string;
  errorMessage?: string;
  timestamp?: Date;
  carrier?: string;
  countryCode?: string;
}

export interface PhoneValidationResult {
  valid: boolean;
  formatted?: string; // E.164 format
  country?: string;
  type?: string; // mobile, fixed-line, etc.
  reason?: string;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export abstract class SmsProvider {
  abstract readonly name: string;

  /**
   * Send an SMS message
   */
  abstract sendSms(options: SendSmsOptions, retryOptions?: RetryOptions): Promise<SmsResult>;

  /**
   * Get delivery status for a message
   */
  abstract getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;

  /**
   * Validate a phone number
   */
  abstract validatePhoneNumber(
    phone: string,
    defaultCountry?: string
  ): Promise<PhoneValidationResult>;

  /**
   * Check if the provider is ready to send messages
   */
  abstract isReady(): boolean;

  /**
   * Check provider credentials and configuration
   */
  abstract checkCredentials(): Promise<{
    success: boolean;
    configured: boolean;
    credentialsValid: boolean;
    balance?: number;
    errors: string[];
    recommendations: string[];
  }>;
}
