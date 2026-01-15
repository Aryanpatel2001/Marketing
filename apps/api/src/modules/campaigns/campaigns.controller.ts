import { CurrentTenant, CurrentUser } from '@/common/decorators';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, FilterCampaignsDto, UpdateCampaignDto } from './dto';
import { CampaignEvent } from './entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from './entities/campaign-message.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignSendService } from './services/campaign-send.service';

@ApiTags('Campaigns')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly campaignSendService: CampaignSendService
  ) {}

  // ==================== CRUD ====================

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCampaignDto
  ): Promise<Campaign> {
    return this.campaignsService.create(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all campaigns with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Returns paginated campaigns' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: FilterCampaignsDto
  ): Promise<PaginatedResponseDto<Campaign>> {
    return this.campaignsService.findAll(tenantId, query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get campaigns overview statistics' })
  @ApiResponse({ status: 200, description: 'Returns campaign stats overview' })
  async getOverview(@CurrentTenant() tenantId: string) {
    return this.campaignsService.getOverview(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns the campaign' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignsService.findOne(tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign updated successfully' })
  @ApiResponse({ status: 400, description: 'Can only update draft campaigns' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto
  ): Promise<Campaign> {
    return this.campaignsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a campaign (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Campaign deleted successfully' })
  @ApiResponse({ status: 400, description: 'Can only delete draft or cancelled campaigns' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.campaignsService.remove(tenantId, id);
  }

  // ==================== ACTIONS ====================

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Campaign duplicated successfully' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async duplicate(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignsService.duplicate(tenantId, id, userId);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a campaign for later' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        scheduledAt: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 datetime',
          example: '2026-01-15T10:00:00Z',
        },
      },
      required: ['scheduledAt'],
    },
  })
  @ApiResponse({ status: 200, description: 'Campaign scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid schedule or campaign not in draft' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async schedule(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { scheduledAt: string }
  ): Promise<Campaign> {
    return this.campaignsService.schedule(tenantId, id, new Date(body.scheduledAt));
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a sending campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign paused successfully' })
  @ApiResponse({ status: 400, description: 'Campaign is not sending' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async pause(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignsService.pause(tenantId, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign resumed successfully' })
  @ApiResponse({ status: 400, description: 'Campaign is not paused' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async resume(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignsService.resume(tenantId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Campaign cannot be cancelled in current status' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async cancel(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignsService.cancel(tenantId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Start sending a campaign immediately' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign sending started' })
  @ApiResponse({ status: 400, description: 'Campaign cannot be sent in current status' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async send(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Campaign> {
    return this.campaignSendService.sendCampaign(tenantId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test email for the campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address to send test to',
          example: 'test@example.com',
        },
      },
      required: ['email'],
    },
  })
  @ApiResponse({ status: 200, description: 'Test email sent' })
  @ApiResponse({ status: 400, description: 'Invalid email or campaign type' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async sendTest(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { email: string }
  ): Promise<{ success: boolean; error?: string }> {
    return this.campaignSendService.sendTestEmail(tenantId, id, body.email);
  }

  @Post(':id/test/sms')
  @ApiOperation({ summary: 'Send a test SMS for the campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number to send test to (E.164 format)',
          example: '+1234567890',
        },
      },
      required: ['phone'],
    },
  })
  @ApiResponse({ status: 200, description: 'Test SMS sent' })
  @ApiResponse({ status: 400, description: 'Invalid phone or campaign type' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async sendTestSms(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { phone: string }
  ): Promise<{ success: boolean; error?: string }> {
    return this.campaignSendService.sendTestSms(tenantId, id, body.phone);
  }

  // ==================== STATS & ANALYTICS ====================

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get campaign statistics' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns campaign statistics' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getStats(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getStats(tenantId, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get campaign messages (recipients)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: MessageStatus })
  @ApiResponse({ status: 200, description: 'Returns campaign messages' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getMessages(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: MessageStatus
  ): Promise<PaginatedResponseDto<CampaignMessage>> {
    return this.campaignsService.getMessages(tenantId, id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Get campaign events timeline' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Returns campaign events' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getEvents(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<PaginatedResponseDto<CampaignEvent>> {
    return this.campaignsService.getEvents(tenantId, id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/activity-stats')
  @ApiOperation({ summary: 'Get campaign activity stats for charting' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({
    name: 'interval',
    required: false,
    enum: ['hour', 'day'],
    description: 'Time interval for grouping',
  })
  @ApiResponse({ status: 200, description: 'Returns time-series activity data' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getActivityStats(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('interval') interval: 'hour' | 'day' = 'hour'
  ) {
    return this.campaignsService.getActivityStats(tenantId, id, interval);
  }
}
