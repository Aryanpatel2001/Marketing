import { CurrentTenant } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';

import { ComplianceService } from '../services/compliance.service';
import {
  ComplianceRegion,
  ComplianceStatus,
  US10DLCBrandStatus,
  US10DLCCampaignStatus,
} from '../entities/tenant-compliance-status.entity';

// ============================================
// DTOs with Validation
// ============================================

class ValidateMessageDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

class ValidateCampaignDto {
  @IsString({ each: true })
  @IsNotEmpty()
  phoneNumbers: string[];
}

class UpdateComplianceModeDto {
  @IsEnum(['strict', 'warn', 'off'])
  mode: 'strict' | 'warn' | 'off';
}

class UpdateUS10DLCStatusDto {
  @IsEnum(US10DLCBrandStatus)
  @IsOptional()
  brandStatus?: US10DLCBrandStatus;

  @IsString()
  @IsOptional()
  brandSid?: string;

  @IsString()
  @IsOptional()
  brandName?: string;

  @IsEnum(US10DLCCampaignStatus)
  @IsOptional()
  campaignStatus?: US10DLCCampaignStatus;

  @IsString()
  @IsOptional()
  campaignSid?: string;

  @IsString()
  @IsOptional()
  messagingServiceSid?: string;
}

// ============================================
// Response DTOs
// ============================================

class ComplianceSummaryResponse {
  us: {
    status: ComplianceStatus;
    isCompliant: boolean;
    details: string;
  };
  eu: {
    status: ComplianceStatus;
    isCompliant: boolean;
    details: string;
  };
  mode: string;
}

class US10DLCStatusResponse {
  brandStatus: US10DLCBrandStatus;
  brandName?: string;
  campaignStatus: US10DLCCampaignStatus;
  isCompliant: boolean;
  trustHubUrl: string;
  errors: string[];
}

// ============================================
// Controller
// ============================================

@ApiTags('SMS Compliance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('sms/compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // ============================================
  // Overall Compliance Status
  // ============================================

  @Get('status')
  @ApiOperation({ summary: 'Get compliance status summary for all regions' })
  @ApiResponse({ status: 200, description: 'Compliance summary', type: ComplianceSummaryResponse })
  async getComplianceStatus(@CurrentTenant() tenantId: string): Promise<ComplianceSummaryResponse> {
    return this.complianceService.getComplianceSummary(tenantId);
  }

  @Get('status/:region')
  @ApiOperation({ summary: 'Get compliance status for a specific region' })
  @ApiParam({ name: 'region', enum: ComplianceRegion })
  @ApiResponse({ status: 200, description: 'Region compliance status' })
  async getRegionStatus(
    @CurrentTenant() tenantId: string,
    @Param('region') region: ComplianceRegion
  ): Promise<{ region: ComplianceRegion; status: ComplianceStatus; isCompliant: boolean }> {
    if (!Object.values(ComplianceRegion).includes(region)) {
      throw new BadRequestException(`Invalid region: ${region}`);
    }

    const compliance = await this.complianceService.getComplianceStatus(tenantId);
    const status = compliance.getRegionStatus(region);

    return {
      region,
      status,
      isCompliant: status === ComplianceStatus.APPROVED,
    };
  }

  @Patch('mode')
  @ApiOperation({ summary: 'Update compliance enforcement mode' })
  @ApiResponse({ status: 200, description: 'Updated compliance status' })
  async updateComplianceMode(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateComplianceModeDto
  ): Promise<{ mode: string; message: string }> {
    await this.complianceService.updateComplianceMode(tenantId, dto.mode);

    const modeMessages = {
      strict: 'Strict mode: Non-compliant messages will be blocked',
      warn: 'Warning mode: Non-compliant messages will show warnings but still send',
      off: 'Compliance disabled: No compliance checks will be performed',
    };

    return {
      mode: dto.mode,
      message: modeMessages[dto.mode],
    };
  }

  // ============================================
  // Message Validation
  // ============================================

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate if a message can be sent to a phone number' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateMessage(@CurrentTenant() tenantId: string, @Body() dto: ValidateMessageDto) {
    return this.complianceService.validateSingleMessage(tenantId, dto.phoneNumber);
  }

  @Post('validate/campaign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate compliance for a campaign with multiple recipients' })
  @ApiResponse({ status: 200, description: 'Campaign validation result' })
  async validateCampaign(@CurrentTenant() tenantId: string, @Body() dto: ValidateCampaignDto) {
    if (!dto.phoneNumbers || dto.phoneNumbers.length === 0) {
      throw new BadRequestException('At least one phone number is required');
    }

    if (dto.phoneNumbers.length > 10000) {
      throw new BadRequestException('Maximum 10,000 phone numbers per validation');
    }

    return this.complianceService.validateCampaign(tenantId, dto.phoneNumbers);
  }

  // ============================================
  // US 10DLC
  // ============================================

  @Get('us/status')
  @ApiOperation({ summary: 'Get US 10DLC compliance status' })
  @ApiResponse({ status: 200, description: 'US 10DLC status', type: US10DLCStatusResponse })
  async getUS10DLCStatus(@CurrentTenant() tenantId: string): Promise<US10DLCStatusResponse> {
    return this.complianceService.getUS10DLCStatus(tenantId);
  }

  @Get('us/guide')
  @ApiOperation({ summary: 'Get US 10DLC setup guide and Trust Hub link' })
  @ApiResponse({ status: 200, description: 'Setup guide' })
  async getUS10DLCGuide(@CurrentTenant() tenantId: string) {
    const status = await this.complianceService.getUS10DLCStatus(tenantId);

    return {
      trustHubUrl: status.trustHubUrl,
      steps: [
        {
          step: 1,
          title: 'Create a Brand',
          description: 'Register your business identity in Twilio Trust Hub',
          status: status.brandStatus === US10DLCBrandStatus.APPROVED ? 'completed' : 'pending',
        },
        {
          step: 2,
          title: 'Register a Campaign',
          description: 'Register your messaging use case (e.g., Marketing, Notifications)',
          status:
            status.campaignStatus === US10DLCCampaignStatus.VERIFIED ? 'completed' : 'pending',
        },
        {
          step: 3,
          title: 'Link Phone Numbers',
          description: 'Associate your phone numbers with the campaign',
          status: status.isCompliant ? 'completed' : 'pending',
        },
      ],
      estimatedTime: '1-5 business days',
      documentation: 'https://www.twilio.com/docs/sms/a2p-10dlc',
    };
  }

  @Post('us/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh US 10DLC status from Twilio' })
  @ApiResponse({ status: 200, description: 'Refreshed status' })
  async refreshUS10DLCStatus(@CurrentTenant() tenantId: string) {
    const compliance = await this.complianceService.refreshUS10DLCStatus(tenantId);
    return {
      brandStatus: compliance.usBrandStatus,
      campaignStatus: compliance.usCampaignStatus,
      lastCheckedAt: compliance.usLastCheckedAt,
    };
  }

  @Patch('us/status')
  @ApiOperation({ summary: 'Manually update US 10DLC status (admin/webhook)' })
  @ApiResponse({ status: 200, description: 'Updated status' })
  async updateUS10DLCStatus(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateUS10DLCStatusDto
  ) {
    const compliance = await this.complianceService.updateUS10DLCStatus(
      tenantId,
      dto.brandStatus,
      dto.brandSid,
      dto.brandName,
      dto.campaignStatus,
      dto.campaignSid,
      dto.messagingServiceSid
    );

    return {
      brandStatus: compliance.usBrandStatus,
      campaignStatus: compliance.usCampaignStatus,
      isCompliant: compliance.isUSCompliant,
    };
  }

  // ============================================
  // EU GDPR
  // ============================================

  @Get('eu/status')
  @ApiOperation({ summary: 'Get EU GDPR compliance status' })
  @ApiResponse({ status: 200, description: 'EU compliance status' })
  async getEUStatus(@CurrentTenant() tenantId: string) {
    const compliance = await this.complianceService.getComplianceStatus(tenantId);

    return {
      consentTrackingEnabled: compliance.euConsentTrackingEnabled,
      senderIdRegistered: compliance.euSenderIdRegistered,
      senderIds: compliance.euSenderIds,
      isCompliant: compliance.isEUCompliant,
    };
  }
}
