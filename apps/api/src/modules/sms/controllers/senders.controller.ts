import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SmsService } from '@/providers/sms/sms.service';
import {
  AddExistingNumberDto,
  AvailableNumberDto,
  CalculateSegmentsDto,
  ListSendersQueryDto,
  PlanLimitsResponseDto,
  PurchaseNumberDto,
  RegisterSenderIdDto,
  SmsSenderResponseDto,
  SearchAvailableNumbersDto,
  UpdateSenderDto,
  ValidatePhoneDto,
} from '../dto/sender.dto';
import { SenderService } from '../services/sender.service';

@ApiTags('SMS Senders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('sms')
export class SendersController {
  constructor(
    private readonly senderService: SenderService,
    private readonly smsService: SmsService
  ) {}

  // ============================================
  // Utility Endpoints (Phone Validation, Segments)
  // ============================================

  @Post('validate-phone')
  @ApiOperation({ summary: 'Validate a phone number' })
  @ApiResponse({ status: 200, description: 'Phone validation result' })
  async validatePhone(@Body() dto: ValidatePhoneDto) {
    return this.smsService.validatePhoneNumber(dto.phoneNumber, dto.countryCode);
  }

  @Post('calculate-segments')
  @ApiOperation({ summary: 'Calculate SMS segments and encoding' })
  @ApiResponse({ status: 200, description: 'Segment calculation result' })
  async calculateSegments(@Body() dto: CalculateSegmentsDto) {
    return this.smsService.calculateSegments(dto.message);
  }

  // ============================================
  // Search & Purchase Phone Numbers
  // ============================================

  @Get('senders/available-numbers')
  @ApiOperation({ summary: 'Search available phone numbers to purchase' })
  @ApiResponse({
    status: 200,
    description: 'List of available phone numbers',
    type: [AvailableNumberDto],
  })
  async searchAvailableNumbers(
    @CurrentTenant() tenantId: string,
    @Query() query: SearchAvailableNumbersDto
  ): Promise<AvailableNumberDto[]> {
    return this.senderService.searchAvailableNumbers(tenantId, query);
  }

  @Post('senders/purchase-number')
  @ApiOperation({ summary: 'Purchase a phone number' })
  @ApiResponse({
    status: 201,
    description: 'Phone number purchased successfully',
    type: SmsSenderResponseDto,
  })
  async purchaseNumber(
    @CurrentTenant() tenantId: string,
    @Body() dto: PurchaseNumberDto
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.purchaseNumber(tenantId, dto);
    return this.toResponseDto(sender);
  }

  // ============================================
  // Add Existing Number (Trial Account Support)
  // ============================================

  @Post('senders/add-existing')
  @ApiOperation({
    summary: 'Add an existing phone number (for Twilio trial accounts)',
    description:
      'Use this endpoint to register your Twilio trial number without purchasing. This is useful for testing and development.',
  })
  @ApiResponse({
    status: 201,
    description: 'Phone number added successfully',
    type: SmsSenderResponseDto,
  })
  async addExistingNumber(
    @CurrentTenant() tenantId: string,
    @Body() dto: AddExistingNumberDto
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.addExistingNumber(tenantId, dto);
    return this.toResponseDto(sender);
  }

  @Post('senders/setup-trial')
  @ApiOperation({
    summary: 'Auto-setup trial number from environment',
    description:
      'Automatically registers the TWILIO_PHONE_NUMBER from environment variables as a sender for the current tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Trial number set up successfully',
    type: SmsSenderResponseDto,
  })
  async setupTrialNumber(
    @CurrentTenant() tenantId: string
  ): Promise<SmsSenderResponseDto | { message: string }> {
    const sender = await this.senderService.setupTrialNumberFromEnv(tenantId);
    if (!sender) {
      return { message: 'No TWILIO_PHONE_NUMBER configured in environment' };
    }
    return this.toResponseDto(sender);
  }

  // ============================================
  // Register Sender ID (Enterprise Only)
  // ============================================

  @Post('senders/sender-id')
  @ApiOperation({ summary: 'Register a new Sender ID (Enterprise only)' })
  @ApiResponse({
    status: 201,
    description: 'Sender ID registered, pending approval',
    type: SmsSenderResponseDto,
  })
  async registerSenderId(
    @CurrentTenant() tenantId: string,
    @Body() dto: RegisterSenderIdDto
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.registerSenderId(tenantId, dto);
    return this.toResponseDto(sender);
  }

  // ============================================
  // List & Get Senders
  // ============================================

  @Get('senders')
  @ApiOperation({ summary: 'List all SMS senders for the tenant' })
  @ApiResponse({
    status: 200,
    description: 'List of senders',
    type: [SmsSenderResponseDto],
  })
  async listSenders(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSendersQueryDto
  ): Promise<{ data: SmsSenderResponseDto[]; total: number; page: number; limit: number }> {
    const result = await this.senderService.listSenders(tenantId, query);
    return {
      ...result,
      data: result.data.map((s) => this.toResponseDto(s)),
    };
  }

  @Get('senders/limits')
  @ApiOperation({ summary: 'Get plan limits for SMS senders' })
  @ApiResponse({
    status: 200,
    description: 'Plan limits information',
    type: PlanLimitsResponseDto,
  })
  async getPlanLimits(@CurrentTenant() tenantId: string): Promise<PlanLimitsResponseDto> {
    return this.senderService.getPlanLimits(tenantId);
  }

  @Get('senders/default')
  @ApiOperation({ summary: 'Get the default sender for the tenant' })
  @ApiResponse({
    status: 200,
    description: 'Default sender',
    type: SmsSenderResponseDto,
  })
  async getDefaultSender(@CurrentTenant() tenantId: string): Promise<SmsSenderResponseDto | null> {
    const sender = await this.senderService.getDefaultSender(tenantId);
    return sender ? this.toResponseDto(sender) : null;
  }

  @Get('senders/:id')
  @ApiOperation({ summary: 'Get a specific sender by ID' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender details',
    type: SmsSenderResponseDto,
  })
  async getSender(
    @CurrentTenant() tenantId: string,
    @Param('id') senderId: string
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.getSender(tenantId, senderId);
    return this.toResponseDto(sender);
  }

  // ============================================
  // Update & Delete Senders
  // ============================================

  @Patch('senders/:id')
  @ApiOperation({ summary: 'Update a sender' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender updated',
    type: SmsSenderResponseDto,
  })
  async updateSender(
    @CurrentTenant() tenantId: string,
    @Param('id') senderId: string,
    @Body() dto: UpdateSenderDto
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.updateSender(tenantId, senderId, dto);
    return this.toResponseDto(sender);
  }

  @Post('senders/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a sender as default' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender set as default',
    type: SmsSenderResponseDto,
  })
  async setDefaultSender(
    @CurrentTenant() tenantId: string,
    @Param('id') senderId: string
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.setDefaultSender(tenantId, senderId);
    return this.toResponseDto(sender);
  }

  @Delete('senders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Release/delete a sender' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({ status: 204, description: 'Sender released successfully' })
  async releaseSender(
    @CurrentTenant() tenantId: string,
    @Param('id') senderId: string
  ): Promise<void> {
    await this.senderService.releaseSender(tenantId, senderId);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private toResponseDto(sender: any): SmsSenderResponseDto {
    return {
      id: sender.id,
      type: sender.type,
      phoneNumber: sender.phoneNumber,
      senderId: sender.senderId,
      countryCode: sender.countryCode,
      senderIdCountries: sender.senderIdCountries,
      friendlyName: sender.friendlyName,
      status: sender.status,
      monthlyPrice: sender.monthlyPrice ? Number(sender.monthlyPrice) : undefined,
      isDefault: sender.isDefault,
      messagesSent: sender.messagesSent,
      deliveryRate: Number(sender.deliveryRate) || 0,
      lastUsedAt: sender.lastUsedAt,
      capabilities: sender.capabilities,
      purchasedAt: sender.purchasedAt,
      renews_at: sender.renewsAt,
      createdAt: sender.createdAt,
      updatedAt: sender.updatedAt,
    };
  }
}
