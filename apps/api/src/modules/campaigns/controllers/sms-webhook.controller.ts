import { WebhookTwilioMessage } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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
}
