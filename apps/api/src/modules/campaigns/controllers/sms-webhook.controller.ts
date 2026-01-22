import { InboundSmsMessage, WebhookTwilioMessage } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { validateRequest } from 'twilio';
import { Public } from '@/common/decorators';

@ApiTags('Webhooks')
@Controller('sms/webhook')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);
  private readonly authToken: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly queueService: QueueService,
    private readonly configService: ConfigService
  ) {
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Validate Twilio webhook signature to prevent spoofing
   */
  private validateTwilioSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    if (!this.authToken) {
      this.logger.warn('Twilio auth token not configured - skipping signature validation');
      return !this.isProduction; // Only skip in non-production
    }

    if (!signature) {
      this.logger.warn('Missing Twilio signature header');
      return false;
    }

    try {
      return validateRequest(this.authToken, signature, url, params);
    } catch (error) {
      this.logger.error(`Twilio signature validation error: ${error}`);
      return false;
    }
  }

  /**
   * Build the webhook URL from the request for signature validation
   */
  private getWebhookUrl(req: Request): string {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${req.originalUrl}`;
  }

  @Post('delivery')
  @Public()
  @ApiOperation({ summary: 'Handle SMS delivery status updates from Twilio' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiResponse({ status: 401, description: 'Invalid Twilio signature' })
  async handleDeliveryStatus(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string,
    @Query('tenantId') tenantId?: string,
    @Query('campaignId') campaignId?: string
  ): Promise<{ status: 'ok' }> {
    // Validate Twilio signature to prevent webhook spoofing
    const webhookUrl = this.getWebhookUrl(req);
    if (!this.validateTwilioSignature(signature, webhookUrl, body)) {
      this.logger.error(`Invalid Twilio signature for delivery webhook from ${req.ip}`);
      throw new UnauthorizedException('Invalid Twilio signature');
    }

    this.logger.debug(`Received Twilio Status Callback: ${JSON.stringify(body)}`);

    // Basic validation
    if (!body || !body.MessageSid) {
      throw new BadRequestException('Invalid webhook payload: Missing MessageSid');
    }

    // Validate MessageStatus is a known status
    const validStatuses = [
      'queued',
      'sending',
      'sent',
      'delivered',
      'undelivered',
      'failed',
      'canceled',
    ];
    const status = body.MessageStatus || body.SmsStatus;
    if (status && !validStatuses.includes(status.toLowerCase())) {
      this.logger.warn(`Unknown message status received: ${status}`);
    }

    // Map Twilio payload to our internal message structure
    const message: WebhookTwilioMessage = {
      messageSid: body.MessageSid,
      messageStatus: status,
      errorCode: body.ErrorCode,
      errorMessage: body.ErrorMessage,
      from: body.From,
      to: body.To,
      timestamp: new Date(),
      tenantId: tenantId,
      campaignId: campaignId,
      payload: body,
    };

    // Push to queue for async processing
    await this.queueService.publishTwilioWebhook(message);

    return { status: 'ok' };
  }

  @Post('inbound')
  @Public()
  @ApiOperation({ summary: 'Handle inbound SMS messages from Twilio' })
  @ApiResponse({ status: 200, description: 'Inbound SMS received' })
  @ApiResponse({ status: 401, description: 'Invalid Twilio signature' })
  async handleInboundSms(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string,
    @Query('tenantId') tenantId?: string,
    @Res() res?: Response
  ): Promise<void> {
    // Validate Twilio signature to prevent webhook spoofing
    const webhookUrl = this.getWebhookUrl(req);
    if (!this.validateTwilioSignature(signature, webhookUrl, body)) {
      this.logger.error(`Invalid Twilio signature for inbound webhook from ${req.ip}`);
      res?.status(401).send('Invalid Twilio signature');
      return;
    }

    this.logger.debug(`Received inbound SMS: ${JSON.stringify(body)}`);

    // Basic validation - Twilio inbound messages have different fields
    if (!body || !body.MessageSid || !body.From || !body.Body) {
      this.logger.warn('Invalid inbound SMS payload');
      res?.status(400).send('Invalid payload');
      return;
    }

    // Validate media URLs are from Twilio's domain (security check)
    const mediaUrls: string[] = [];
    const numMedia = parseInt(body.NumMedia, 10) || 0;
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = body[`MediaUrl${i}`];
      if (mediaUrl) {
        // Validate URL is from Twilio's media domain
        try {
          const url = new URL(mediaUrl);
          if (url.hostname.endsWith('.twilio.com') || url.hostname.endsWith('.twilio.media')) {
            mediaUrls.push(mediaUrl);
          } else {
            this.logger.warn(`Rejected non-Twilio media URL: ${url.hostname}`);
          }
        } catch {
          this.logger.warn(`Invalid media URL received: ${mediaUrl}`);
        }
      }
    }

    // Map Twilio inbound payload to our message structure
    const message: InboundSmsMessage = {
      messageSid: body.MessageSid,
      from: body.From,
      to: body.To,
      body: body.Body,
      numMedia,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      timestamp: new Date(),
      tenantId: tenantId,
      payload: body,
    };

    // Push to queue for async processing
    await this.queueService.publishInboundSms(message);

    // Return TwiML response (empty response means no auto-reply)
    // Twilio expects XML response for inbound SMS
    res?.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
}
