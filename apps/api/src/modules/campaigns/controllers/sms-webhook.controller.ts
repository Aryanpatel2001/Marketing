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
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Webhooks')
@Controller('sms/webhook')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(private readonly queueService: QueueService) {}

  @Post('delivery')
  @ApiOperation({ summary: 'Handle SMS delivery status updates from Twilio' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async handleDeliveryStatus(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string,
    @Query('tenantId') tenantId?: string,
    @Query('campaignId') campaignId?: string
  ): Promise<{ status: 'ok' }> {
    // Log for debugging
    this.logger.debug(`Received Twilio Status Callback: ${JSON.stringify(body)}`);

    // Basic validation
    if (!body || !body.MessageSid) {
      throw new BadRequestException('Invalid webhook payload: Missing MessageSid');
    }

    // Map Twilio payload to our internal message structure
    // Twilio sends Form-UrlEncoded data mostly
    const message: WebhookTwilioMessage = {
      messageSid: body.MessageSid,
      messageStatus: body.MessageStatus || body.SmsStatus,
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
  @ApiOperation({ summary: 'Handle inbound SMS messages from Twilio' })
  @ApiResponse({ status: 200, description: 'Inbound SMS received' })
  async handleInboundSms(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string,
    @Query('tenantId') tenantId?: string,
    @Res() res?: Response
  ): Promise<void> {
    this.logger.debug(`Received inbound SMS: ${JSON.stringify(body)}`);

    // Basic validation - Twilio inbound messages have different fields
    if (!body || !body.MessageSid || !body.From || !body.Body) {
      this.logger.warn('Invalid inbound SMS payload');
      res?.status(400).send('Invalid payload');
      return;
    }

    // Extract media URLs if present
    const mediaUrls: string[] = [];
    const numMedia = parseInt(body.NumMedia, 10) || 0;
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = body[`MediaUrl${i}`];
      if (mediaUrl) {
        mediaUrls.push(mediaUrl);
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
