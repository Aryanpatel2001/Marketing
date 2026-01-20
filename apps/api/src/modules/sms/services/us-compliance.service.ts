import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TwilioProviderFactory } from '@/providers/sms/twilio-provider.factory';
import {
  TenantComplianceStatus,
  US10DLCBrandStatus,
  US10DLCCampaignStatus,
} from '../entities/tenant-compliance-status.entity';
import { SmsSender } from '../entities/sms-sender.entity';

// ============================================
// Types & Interfaces
// ============================================

export interface RegisterBrandDto {
  legalName: string;
  ein?: string; // Tax ID
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  website?: string;
  businessType: 'sole_proprietor' | 'partnership' | 'corporation' | 'llc' | 'non_profit';
  businessIndustry?: string;
  contactEmail: string;
  contactPhone: string;
}

export interface RegisterCampaignDto {
  name: string;
  description: string;
  useCase: 'MARKETING' | 'MIXED' | 'CUSTOMER_CARE' | '2FA' | 'NOTIFICATIONS' | 'POLLING';
  sampleMessages: string[]; // 3-5 samples required
  optInDescription: string;
  optInKeywords?: string[];
  optOutKeywords?: string[];
  helpKeywords?: string[];
  messageFlow?: string;
  embeddedLink?: boolean;
  embeddedPhone?: boolean;
  numberPool?: boolean;
  ageGated?: boolean;
  directLending?: boolean;
}

export interface BrandRegistrationResult {
  success: boolean;
  brandSid?: string;
  brandStatus: US10DLCBrandStatus;
  trustScore?: number;
  errors?: string[];
  trustHubUrl: string;
}

export interface CampaignRegistrationResult {
  success: boolean;
  campaignSid?: string;
  campaignStatus: US10DLCCampaignStatus;
  messagingServiceSid?: string;
  errors?: string[];
}

export interface LinkNumberResult {
  success: boolean;
  phoneNumber: string;
  messagingServiceSid?: string;
  errors?: string[];
}

@Injectable()
export class UsComplianceService {
  private readonly logger = new Logger(UsComplianceService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(TenantComplianceStatus)
    private readonly complianceRepository: Repository<TenantComplianceStatus>,
    @InjectRepository(SmsSender)
    private readonly senderRepository: Repository<SmsSender>,
    private readonly configService: ConfigService,
    private readonly twilioFactory: TwilioProviderFactory
  ) {
    this.enabled = this.configService.get<boolean>('US_10DLC_ENABLED', true);
    this.logger.log(`US 10DLC compliance service initialized: enabled=${this.enabled}`);
  }

  // ============================================
  // Brand Registration
  // ============================================

  /**
   * Register a brand with Twilio Trust Hub for 10DLC
   */
  async registerBrand(tenantId: string, dto: RegisterBrandDto): Promise<BrandRegistrationResult> {
    if (!this.enabled) {
      return {
        success: false,
        brandStatus: US10DLCBrandStatus.UNREGISTERED,
        errors: ['US 10DLC is not enabled'],
        trustHubUrl: '',
      };
    }

    const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
    if (!twilioClient) {
      return {
        success: false,
        brandStatus: US10DLCBrandStatus.UNREGISTERED,
        errors: ['Twilio not configured for this tenant'],
        trustHubUrl: this.getTrustHubUrl(),
      };
    }

    try {
      // Step 1: Create a Customer Profile for Trust Hub
      const customerProfile = await twilioClient.client.trusthub.v1.customerProfiles.create({
        friendlyName: dto.legalName,
        email: dto.contactEmail,
        policySid: 'RNdfbf3fae0e1107f8aded0e7cead80bf5', // A2P 10DLC policy SID
      });

      this.logger.log(`Created customer profile: ${customerProfile.sid}`);

      // Step 2: Create the Brand Registration
      const brandRegistration = await twilioClient.client.messaging.v1.brandRegistrations.create({
        customerProfileBundleSid: customerProfile.sid,
        a2PProfileBundleSid: customerProfile.sid,
      });

      this.logger.log(`Created brand registration: ${brandRegistration.sid}`);

      // Step 3: Update local compliance status
      const compliance = await this.getOrCreateCompliance(tenantId);
      compliance.usBrandSid = brandRegistration.sid;
      compliance.usBrandName = dto.legalName;
      compliance.usBrandStatus = this.mapBrandStatus(brandRegistration.status);
      compliance.usRegisteredAt = new Date();
      compliance.usLastCheckedAt = new Date();
      await this.complianceRepository.save(compliance);

      return {
        success: true,
        brandSid: brandRegistration.sid,
        brandStatus: compliance.usBrandStatus,
        trustScore: brandRegistration.identityStatus === 'VERIFIED' ? 100 : 50,
        trustHubUrl: this.getTrustHubUrl(twilioClient.accountSid),
      };
    } catch (error: any) {
      this.logger.error(`Failed to register brand: ${error.message}`);

      // If Twilio API fails, update status to pending for manual registration
      const compliance = await this.getOrCreateCompliance(tenantId);
      compliance.usBrandStatus = US10DLCBrandStatus.PENDING;
      compliance.usRejectionReason = error.message;
      await this.complianceRepository.save(compliance);

      return {
        success: false,
        brandStatus: US10DLCBrandStatus.PENDING,
        errors: [error.message],
        trustHubUrl: this.getTrustHubUrl(),
      };
    }
  }

  /**
   * Get current brand status from Twilio
   */
  async getBrandStatus(tenantId: string): Promise<{
    status: US10DLCBrandStatus;
    brandSid?: string;
    brandName?: string;
    trustScore?: number;
    errors: string[];
  }> {
    const compliance = await this.getOrCreateCompliance(tenantId);

    if (!compliance.usBrandSid) {
      return {
        status: US10DLCBrandStatus.UNREGISTERED,
        errors: ['No brand registered'],
      };
    }

    try {
      const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
      if (!twilioClient) {
        return {
          status: compliance.usBrandStatus,
          brandSid: compliance.usBrandSid,
          brandName: compliance.usBrandName || undefined,
          errors: ['Cannot refresh - Twilio not configured'],
        };
      }

      const brandRegistration = await twilioClient.client.messaging.v1
        .brandRegistrations(compliance.usBrandSid)
        .fetch();

      // Update local status
      const newStatus = this.mapBrandStatus(brandRegistration.status);
      if (newStatus !== compliance.usBrandStatus) {
        compliance.usBrandStatus = newStatus;
        compliance.usLastCheckedAt = new Date();
        await this.complianceRepository.save(compliance);
      }

      return {
        status: compliance.usBrandStatus,
        brandSid: compliance.usBrandSid,
        brandName: compliance.usBrandName || undefined,
        trustScore: brandRegistration.identityStatus === 'VERIFIED' ? 100 : 50,
        errors: [],
      };
    } catch (error: any) {
      this.logger.error(`Failed to get brand status: ${error.message}`);
      return {
        status: compliance.usBrandStatus,
        brandSid: compliance.usBrandSid,
        brandName: compliance.usBrandName || undefined,
        errors: [error.message],
      };
    }
  }

  // ============================================
  // Campaign Registration
  // ============================================

  /**
   * Register a 10DLC campaign with Twilio
   */
  async registerCampaign(
    tenantId: string,
    dto: RegisterCampaignDto
  ): Promise<CampaignRegistrationResult> {
    const compliance = await this.getOrCreateCompliance(tenantId);

    if (compliance.usBrandStatus !== US10DLCBrandStatus.APPROVED) {
      return {
        success: false,
        campaignStatus: US10DLCCampaignStatus.UNREGISTERED,
        errors: ['Brand must be approved before registering a campaign'],
      };
    }

    const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
    if (!twilioClient) {
      return {
        success: false,
        campaignStatus: US10DLCCampaignStatus.UNREGISTERED,
        errors: ['Twilio not configured for this tenant'],
      };
    }

    try {
      // Step 1: Create Messaging Service if not exists
      let messagingServiceSid = compliance.usMessagingServiceSid;

      if (!messagingServiceSid) {
        const messagingService = await twilioClient.client.messaging.v1.services.create({
          friendlyName: `${dto.name} - 10DLC`,
          inboundRequestUrl: this.configService.get<string>('SMS_INBOUND_WEBHOOK_URL'),
          statusCallback: this.configService.get<string>('SMS_STATUS_CALLBACK_URL'),
          useInboundWebhookOnNumber: true,
        });

        messagingServiceSid = messagingService.sid;
        compliance.usMessagingServiceSid = messagingServiceSid;
        await this.complianceRepository.save(compliance);

        this.logger.log(`Created messaging service: ${messagingServiceSid}`);
      }

      // Step 2: Register the campaign
      const usAppToPersonUseCase = await twilioClient.client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson.create({
          brandRegistrationSid: compliance.usBrandSid!,
          description: dto.description,
          messageFlow: dto.messageFlow || dto.optInDescription,
          messageSamples: dto.sampleMessages,
          usAppToPersonUsecase: dto.useCase,
          hasEmbeddedLinks: dto.embeddedLink || false,
          hasEmbeddedPhone: dto.embeddedPhone || false,
          optInMessage: `Reply YES to subscribe. ${dto.optInDescription}`,
          optOutMessage: 'Reply STOP to unsubscribe.',
          helpMessage: 'Reply HELP for assistance.',
          optInKeywords: dto.optInKeywords || ['START', 'YES', 'SUBSCRIBE'],
          optOutKeywords: dto.optOutKeywords || ['STOP', 'UNSUBSCRIBE', 'CANCEL'],
          helpKeywords: dto.helpKeywords || ['HELP', 'INFO'],
        });

      this.logger.log(`Created campaign: ${usAppToPersonUseCase.sid}`);

      // Step 3: Update local compliance status
      compliance.usCampaignSid = usAppToPersonUseCase.sid;
      compliance.usCampaignStatus = this.mapCampaignStatus(usAppToPersonUseCase.campaignStatus);
      compliance.usLastCheckedAt = new Date();
      await this.complianceRepository.save(compliance);

      return {
        success: true,
        campaignSid: usAppToPersonUseCase.sid,
        campaignStatus: compliance.usCampaignStatus,
        messagingServiceSid: messagingServiceSid || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register campaign: ${error.message}`);
      return {
        success: false,
        campaignStatus: US10DLCCampaignStatus.FAILED,
        errors: [error.message],
      };
    }
  }

  // ============================================
  // Number Linking
  // ============================================

  /**
   * Link a phone number to the 10DLC campaign messaging service
   */
  async linkNumberToCampaign(tenantId: string, senderId: string): Promise<LinkNumberResult> {
    const compliance = await this.getOrCreateCompliance(tenantId);

    if (!compliance.usMessagingServiceSid) {
      return {
        success: false,
        phoneNumber: '',
        errors: ['No messaging service configured. Register a campaign first.'],
      };
    }

    const sender = await this.senderRepository.findOne({
      where: { id: senderId, tenantId },
    });

    if (!sender || !sender.phoneNumber) {
      return {
        success: false,
        phoneNumber: '',
        errors: ['Sender not found or has no phone number'],
      };
    }

    const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
    if (!twilioClient) {
      return {
        success: false,
        phoneNumber: sender.phoneNumber,
        errors: ['Twilio not configured'],
      };
    }

    try {
      // Add number to messaging service
      await twilioClient.client.messaging.v1
        .services(compliance.usMessagingServiceSid)
        .phoneNumbers.create({
          phoneNumberSid: sender.twilioSid!,
        });

      // Update sender with compliance metadata
      sender.complianceMetadata = {
        ...sender.complianceMetadata,
        us: {
          brandId: compliance.usBrandSid || undefined,
          campaignId: compliance.usCampaignSid || undefined,
          messagingServiceSid: compliance.usMessagingServiceSid,
          registeredAt: new Date().toISOString(),
        },
      };
      sender.registeredRegions = [...new Set([...(sender.registeredRegions || []), 'US'])];
      sender.complianceVerified = true;
      sender.complianceVerifiedAt = new Date();
      await this.senderRepository.save(sender);

      this.logger.log(`Linked ${sender.phoneNumber} to messaging service`);

      return {
        success: true,
        phoneNumber: sender.phoneNumber,
        messagingServiceSid: compliance.usMessagingServiceSid,
      };
    } catch (error: any) {
      this.logger.error(`Failed to link number: ${error.message}`);
      return {
        success: false,
        phoneNumber: sender.phoneNumber,
        errors: [error.message],
      };
    }
  }

  /**
   * Validate if a sender can send to US numbers
   */
  async validateSenderForUS(
    senderId: string,
    tenantId: string
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const compliance = await this.getOrCreateCompliance(tenantId);

    // Check brand status
    if (compliance.usBrandStatus !== US10DLCBrandStatus.APPROVED) {
      errors.push('Brand not approved for US 10DLC');
    }

    // Check campaign status
    if (compliance.usCampaignStatus !== US10DLCCampaignStatus.VERIFIED) {
      errors.push('Campaign not verified for US 10DLC');
    }

    // Check sender registration
    const sender = await this.senderRepository.findOne({
      where: { id: senderId, tenantId },
    });

    if (!sender) {
      errors.push('Sender not found');
    } else if (!sender.registeredRegions?.includes('US')) {
      errors.push('Sender not registered for US. Link it to the campaign first.');
    } else if (!sender.complianceMetadata?.us?.messagingServiceSid) {
      warnings.push('Sender may not be linked to messaging service');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async getOrCreateCompliance(tenantId: string): Promise<TenantComplianceStatus> {
    let compliance = await this.complianceRepository.findOne({
      where: { tenantId },
    });

    if (!compliance) {
      compliance = this.complianceRepository.create({
        tenantId,
        complianceMode: 'warn',
      });
      compliance = await this.complianceRepository.save(compliance);
    }

    return compliance;
  }

  private getTrustHubUrl(accountSid?: string): string {
    const sid = accountSid || 'YOUR_ACCOUNT_SID';
    return `https://console.twilio.com/us1/develop/sms/regulatory-compliance/trust-hub?accountSid=${sid}`;
  }

  private mapBrandStatus(twilioStatus: string): US10DLCBrandStatus {
    const statusMap: Record<string, US10DLCBrandStatus> = {
      PENDING: US10DLCBrandStatus.PENDING,
      APPROVED: US10DLCBrandStatus.APPROVED,
      FAILED: US10DLCBrandStatus.FAILED,
      SUSPENDED: US10DLCBrandStatus.SUSPENDED,
      IN_REVIEW: US10DLCBrandStatus.PENDING,
    };
    return statusMap[twilioStatus] || US10DLCBrandStatus.PENDING;
  }

  private mapCampaignStatus(twilioStatus: string): US10DLCCampaignStatus {
    const statusMap: Record<string, US10DLCCampaignStatus> = {
      PENDING: US10DLCCampaignStatus.PENDING,
      VERIFIED: US10DLCCampaignStatus.VERIFIED,
      FAILED: US10DLCCampaignStatus.FAILED,
      IN_PROGRESS: US10DLCCampaignStatus.PENDING,
    };
    return statusMap[twilioStatus] || US10DLCCampaignStatus.PENDING;
  }
}
