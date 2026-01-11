import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
  GetAccountSendingEnabledCommand,
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
} from '@aws-sdk/client-ses';

export interface SendEmailOptions {
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retriesUsed?: number;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

// Error types that should be retried
const RETRYABLE_ERROR_CODES = [
  'Throttling',
  'ThrottlingException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'InternalServerError',
  'RequestTimeout',
  'RequestTimeoutException',
  'TooManyRequestsException',
];

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sesClient: SESClient | null = null;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (region && accessKeyId && secretAccessKey) {
      this.sesClient = new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
      this.logger.log('AWS SES client initialized');
    } else {
      this.isConfigured = false;
      this.logger.warn('AWS SES not configured - emails will be simulated');
    }
  }

  /**
   * Send email with automatic retry on transient failures
   */
  async sendEmail(
    options: SendEmailOptions,
    retryOptions?: RetryOptions
  ): Promise<SendEmailResult> {
    const maxRetries = retryOptions?.maxRetries ?? 3;
    const baseDelayMs = retryOptions?.baseDelayMs ?? 1000;
    const maxDelayMs = retryOptions?.maxDelayMs ?? 30000;

    const { to, from, fromName, replyTo, subject, html, text } = options;

    // Build the "from" address
    const fromAddress = fromName ? `${fromName} <${from}>` : from;

    this.logger.debug(`Sending email to ${to} from ${fromAddress}`);

    // If SES is not configured, simulate the send
    if (!this.isConfigured || !this.sesClient) {
      this.logger.log(`[SIMULATED] Email sent to ${to}: ${subject}`);
      return {
        success: true,
        messageId: `simulated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        retriesUsed: 0,
      };
    }

    const params: SendEmailCommandInput = {
      Source: fromAddress,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Charset: 'UTF-8',
          Data: subject,
        },
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: html,
          },
          ...(text && {
            Text: {
              Charset: 'UTF-8',
              Data: text,
            },
          }),
        },
      },
      ...(replyTo && {
        ReplyToAddresses: [replyTo],
      }),
    };

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const command = new SendEmailCommand(params);
        const response = await this.sesClient.send(command);

        if (attempt > 0) {
          this.logger.log(
            `Email sent successfully to ${to} on retry ${attempt}, MessageId: ${response.MessageId}`
          );
        } else {
          this.logger.log(`Email sent successfully to ${to}, MessageId: ${response.MessageId}`);
        }

        return {
          success: true,
          messageId: response.MessageId,
          retriesUsed: attempt,
        };
      } catch (error: any) {
        lastError = error;
        retryCount = attempt;

        // Check if error is retryable
        const errorCode = error.name || error.code || '';
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt >= maxRetries) {
          // Don't retry non-retryable errors or if we've exhausted retries
          this.logger.error(
            `Failed to send email to ${to} after ${attempt + 1} attempt(s): ${error.message}`,
            error.stack
          );
          break;
        }

        // Calculate exponential backoff with jitter
        const delayMs = this.calculateBackoff(attempt, baseDelayMs, maxDelayMs);

        this.logger.warn(
          `Email to ${to} failed (${errorCode}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        );

        await this.delay(delayMs);
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      retriesUsed: retryCount,
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const errorCode = error.name || error.code || '';
    const errorMessage = error.message || '';

    // Check if error code is in our retryable list
    if (RETRYABLE_ERROR_CODES.some((code) => errorCode.includes(code))) {
      return true;
    }

    // Check for network-related errors
    if (
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('socket hang up') ||
      errorMessage.includes('network')
    ) {
      return true;
    }

    // Check for HTTP 5xx errors or rate limit errors
    const httpCode = error.$metadata?.httpStatusCode;
    if (httpCode && (httpCode >= 500 || httpCode === 429)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    // Exponential backoff: base * 2^attempt
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

    // Add random jitter (0-25% of the delay)
    const jitter = exponentialDelay * Math.random() * 0.25;

    // Cap at max delay
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }

  async sendBulkEmails(
    emails: SendEmailOptions[],
    options?: { delayMs?: number; batchSize?: number }
  ): Promise<SendEmailResult[]> {
    const results: SendEmailResult[] = [];
    const delayMs = options?.delayMs || 100; // 100ms delay between emails (10/sec rate)
    const batchSize = options?.batchSize || 10;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map((email) => this.sendEmail(email))
      );

      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < emails.length) {
        await this.delay(delayMs * batchSize);
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Comprehensive AWS SES credentials check
   * Returns detailed status of configuration, credentials, and verified identities
   */
  async checkCredentials(): Promise<{
    success: boolean;
    configured: boolean;
    credentialsValid: boolean;
    sendingEnabled: boolean;
    senderEmailVerified: boolean;
    region: string | null;
    configuredSenderEmail: string | null;
    verifiedIdentities: string[];
    sandboxMode: boolean;
    errors: string[];
    recommendations: string[];
  }> {
    const errors: string[] = [];
    const recommendations: string[] = [];
    const region = this.configService.get<string>('AWS_REGION') || null;
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const configuredSenderEmail = this.configService.get<string>('SES_FROM_EMAIL') || null;

    const result = {
      success: false,
      configured: false,
      credentialsValid: false,
      sendingEnabled: false,
      senderEmailVerified: false,
      region,
      configuredSenderEmail,
      verifiedIdentities: [] as string[],
      sandboxMode: true,
      errors,
      recommendations,
    };

    // Check 1: Basic configuration
    if (!region) {
      errors.push('AWS_REGION is not configured');
      recommendations.push('Set AWS_REGION in your .env file (e.g., us-east-1)');
    }

    if (!accessKeyId) {
      errors.push('AWS_ACCESS_KEY_ID is not configured');
      recommendations.push('Set AWS_ACCESS_KEY_ID from your AWS IAM user credentials');
    } else if (accessKeyId === 'your_aws_access_key' || accessKeyId.length < 16) {
      errors.push('AWS_ACCESS_KEY_ID appears to be a placeholder or invalid');
      recommendations.push('Replace with your actual AWS Access Key ID (starts with AKIA...)');
    }

    if (!secretAccessKey) {
      errors.push('AWS_SECRET_ACCESS_KEY is not configured');
      recommendations.push('Set AWS_SECRET_ACCESS_KEY from your AWS IAM user credentials');
    } else if (secretAccessKey === 'your_aws_secret_key' || secretAccessKey.length < 20) {
      errors.push('AWS_SECRET_ACCESS_KEY appears to be a placeholder or invalid');
      recommendations.push('Replace with your actual AWS Secret Access Key');
    }

    if (!configuredSenderEmail) {
      errors.push('SES_FROM_EMAIL is not configured');
      recommendations.push('Set SES_FROM_EMAIL to a verified email address in AWS SES');
    } else if (configuredSenderEmail.includes('yourdomain.com') || configuredSenderEmail.includes('example.com')) {
      errors.push('SES_FROM_EMAIL appears to be a placeholder');
      recommendations.push('Replace SES_FROM_EMAIL with your actual verified sender email');
    }

    result.configured = errors.length === 0;

    if (!result.configured || !this.sesClient) {
      return result;
    }

    // Check 2: Validate credentials by calling AWS SES API
    try {
      // Try to get account sending status - this validates credentials
      const sendingStatusCmd = new GetAccountSendingEnabledCommand({});
      const sendingStatus = await this.sesClient.send(sendingStatusCmd);

      result.credentialsValid = true;
      result.sendingEnabled = sendingStatus.Enabled || false;

      if (!result.sendingEnabled) {
        errors.push('SES sending is disabled for this account');
        recommendations.push('Enable sending in AWS SES console or request production access');
      }
    } catch (error: any) {
      result.credentialsValid = false;

      if (error.name === 'InvalidClientTokenId' || error.message?.includes('security token')) {
        errors.push('AWS credentials are invalid - security token rejected');
        recommendations.push('Verify your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correct');
        recommendations.push('Make sure the IAM user has not been deleted or disabled');
        recommendations.push('Check if the access key has been rotated or revoked');
      } else if (error.name === 'SignatureDoesNotMatch') {
        errors.push('AWS credentials signature mismatch');
        recommendations.push('Your AWS_SECRET_ACCESS_KEY may be incorrect');
        recommendations.push('Regenerate the access key in AWS IAM console');
      } else if (error.name === 'AccessDeniedException' || error.name === 'AccessDenied') {
        errors.push('AWS credentials lack SES permissions');
        recommendations.push('Attach the AmazonSESFullAccess policy to your IAM user');
        result.credentialsValid = true; // Credentials work but lack permissions
      } else if (error.message?.includes('getaddrinfo') || error.message?.includes('ENOTFOUND')) {
        errors.push('Cannot connect to AWS - network error');
        recommendations.push('Check your internet connection');
        recommendations.push('Verify AWS_REGION is correct');
      } else {
        errors.push(`AWS API error: ${error.message}`);
      }

      return result;
    }

    // Check 3: Get verified identities
    try {
      const listIdentitiesCmd = new ListIdentitiesCommand({ IdentityType: 'EmailAddress' });
      const identitiesResponse = await this.sesClient.send(listIdentitiesCmd);
      const emailIdentities = identitiesResponse.Identities || [];

      // Also get domain identities
      const listDomainsCmd = new ListIdentitiesCommand({ IdentityType: 'Domain' });
      const domainsResponse = await this.sesClient.send(listDomainsCmd);
      const domainIdentities = domainsResponse.Identities || [];

      const allIdentities = [...emailIdentities, ...domainIdentities];

      if (allIdentities.length > 0) {
        // Verify which identities are actually verified
        const verifyCmd = new GetIdentityVerificationAttributesCommand({
          Identities: allIdentities,
        });
        const verifyResponse = await this.sesClient.send(verifyCmd);

        result.verifiedIdentities = allIdentities.filter((identity) => {
          const status = verifyResponse.VerificationAttributes?.[identity];
          return status?.VerificationStatus === 'Success';
        });
      }

      // Check if sender email is verified
      if (configuredSenderEmail) {
        const senderDomain = configuredSenderEmail.split('@')[1];
        result.senderEmailVerified =
          result.verifiedIdentities.includes(configuredSenderEmail) ||
          result.verifiedIdentities.includes(senderDomain);

        if (!result.senderEmailVerified) {
          errors.push(`Sender email "${configuredSenderEmail}" is not verified in SES`);
          recommendations.push(`Verify ${configuredSenderEmail} in AWS SES console`);
          recommendations.push('Or verify the domain ' + senderDomain + ' for sending from any email on that domain');
        }
      }

      // Determine sandbox mode (if only a few verified identities and no domains)
      result.sandboxMode = domainIdentities.length === 0 && emailIdentities.length < 10;

      if (result.sandboxMode) {
        recommendations.push('Your SES account appears to be in sandbox mode');
        recommendations.push('Request production access to send to any email address');
        recommendations.push('In sandbox mode, you can only send to verified emails');
      }

    } catch (error: any) {
      this.logger.warn(`Could not fetch verified identities: ${error.message}`);
      // Don't fail the whole check for this
    }

    // Final success determination
    result.success = result.credentialsValid && result.sendingEnabled && result.senderEmailVerified;

    if (result.success) {
      recommendations.length = 0; // Clear recommendations if everything is working
      recommendations.push('AWS SES is properly configured and ready to send emails');
    }

    return result;
  }
}
