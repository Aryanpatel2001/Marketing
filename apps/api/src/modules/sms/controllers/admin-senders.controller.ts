import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SmsSenderStatus } from '../entities/sms-sender.entity';
import { AdminUpdateSenderStatusDto, SmsSenderResponseDto } from '../dto/sender.dto';
import { SenderService } from '../services/sender.service';

@ApiTags('Admin - SMS Senders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@Controller('admin/sms/senders')
export class AdminSendersController {
  constructor(private readonly senderService: SenderService) {}

  // ============================================
  // Get Pending Sender IDs
  // ============================================

  @Get('pending')
  @ApiOperation({ summary: 'Get all pending sender ID requests' })
  @ApiResponse({
    status: 200,
    description: 'List of pending sender IDs',
    type: [SmsSenderResponseDto],
  })
  async getPendingSenderIds(): Promise<SmsSenderResponseDto[]> {
    const senders = await this.senderService.getPendingSenderIds();
    return senders.map((s) => this.toResponseDto(s));
  }

  // ============================================
  // Approve Sender ID
  // ============================================

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a sender ID request' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender ID approved',
    type: SmsSenderResponseDto,
  })
  async approveSenderId(
    @Param('id') senderId: string,
    @Body() dto: { adminNotes?: string }
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.adminUpdateSenderStatus(
      senderId,
      SmsSenderStatus.ACTIVE,
      dto.adminNotes
    );
    return this.toResponseDto(sender);
  }

  // ============================================
  // Reject Sender ID
  // ============================================

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a sender ID request' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender ID rejected',
    type: SmsSenderResponseDto,
  })
  async rejectSenderId(
    @Param('id') senderId: string,
    @Body() dto: { rejectionReason: string; adminNotes?: string }
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.adminUpdateSenderStatus(
      senderId,
      SmsSenderStatus.FAILED,
      dto.adminNotes,
      dto.rejectionReason
    );
    return this.toResponseDto(sender);
  }

  // ============================================
  // Update Sender Status
  // ============================================

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update sender status (suspend, activate, etc.)' })
  @ApiParam({ name: 'id', description: 'Sender ID' })
  @ApiResponse({
    status: 200,
    description: 'Sender status updated',
    type: SmsSenderResponseDto,
  })
  async updateSenderStatus(
    @Param('id') senderId: string,
    @Body() dto: AdminUpdateSenderStatusDto
  ): Promise<SmsSenderResponseDto> {
    const sender = await this.senderService.adminUpdateSenderStatus(
      senderId,
      dto.status as SmsSenderStatus,
      dto.adminNotes,
      dto.rejectionReason
    );
    return this.toResponseDto(sender);
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
