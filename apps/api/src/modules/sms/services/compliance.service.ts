import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { parsePhoneNumber } from 'libphonenumber-js';

import {
  TenantComplianceStatus,
  ComplianceRegion,
  ComplianceStatus,
  US10DLCBrandStatus,
  US10DLCCampaignStatus,
} from '../entities/tenant-compliance-status.entity';
import { TwilioProviderFactory } from '@/providers/sms/twilio-provider.factory';

// ============================================
// Types & Interfaces
// ============================================

export interface ComplianceValidationResult {
  canSend: boolean;
  region: ComplianceRegion;
  status: ComplianceStatus;
  warnings: ComplianceWarning[];
  errors: ComplianceError[];
  suggestions: string[];
}

export interface ComplianceWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  region: ComplianceRegion;
}

export interface ComplianceError {
  code: string;
  message: string;
  region: ComplianceRegion;
  blocking: boolean;
}

export interface CampaignComplianceResult {
  canSend: boolean;
  totalRecipients: number;
  compliantRecipients: number;
  blockedRecipients: number;
  regionBreakdown: RegionBreakdown[];
  warnings: ComplianceWarning[];
  errors: ComplianceError[];
  blockedNumbers: BlockedNumber[];
}

export interface RegionBreakdown {
  region: ComplianceRegion;
  count: number;
  status: ComplianceStatus;
  canSend: boolean;
  reason?: string;
}

export interface BlockedNumber {
  phoneNumber: string;
  region: ComplianceRegion;
  reason: string;
}

export interface US10DLCStatusResult {
  brandStatus: US10DLCBrandStatus;
  brandName?: string;
  campaignStatus: US10DLCCampaignStatus;
  isCompliant: boolean;
  trustHubUrl: string;
  errors: string[];
}

// ============================================
// Constants
// ============================================

// Country codes by region
const US_COUNTRY_CODES = ['US', 'CA', 'PR', 'VI', 'GU', 'AS', 'MP'];
const EU_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
  'CH',
  'NO',
];

// Compliance error codes
const ERROR_CODES = {
  US_BRAND_NOT_REGISTERED: 'US_BRAND_NOT_REGISTERED',
  US_CAMPAIGN_NOT_VERIFIED: 'US_CAMPAIGN_NOT_VERIFIED',
  US_10DLC_REQUIRED: 'US_10DLC_REQUIRED',
  EU_CONSENT_REQUIRED: 'EU_CONSENT_REQUIRED',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
} as const;

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private readonly complianceEnabled: boolean;
  private readonly us10DLCRequired: boolean;

  constructor(
    @InjectRepository(TenantComplianceStatus)
    private readonly complianceRepository: Repository<TenantComplianceStatus>,
    private readonly configService: ConfigService,
    private readonly twilioFactory: TwilioProviderFactory
  ) {
    this.complianceEnabled = this.configService.get<boolean>('SMS_COMPLIANCE_ENABLED', true);
    this.us10DLCRequired = this.configService.get<boolean>('US_10DLC_REQUIRED', true);

    this.logger.log(
      `Compliance service initialized: enabled=${this.complianceEnabled}, ` +
        `us10DLC=${this.us10DLCRequired}`
    );
  }

  // ============================================
  // Core Compliance Methods
  // ============================================

  /**
   * Get or create compliance status for a tenant
   */
  async getComplianceStatus(tenantId: string): Promise<TenantComplianceStatus> {
    let status = await this.complianceRepository.findOne({
      where: { tenantId },
    });

    if (!status) {
      try {
        status = this.complianceRepository.create({
          tenantId,
          complianceMode: 'warn',
        });
        status = await this.complianceRepository.save(status);
        this.logger.log(`Created compliance status for tenant ${tenantId}`);
      } catch (error: any) {
        // Handle race condition - another request might have created it
        if (error.code === '23505') {
          // Unique constraint violation
          status = await this.complianceRepository.findOne({
            where: { tenantId },
          });
          if (!status) {
            throw error; // Re-throw if still not found
          }
        } else {
          throw error;
        }
      }
    }

    return status;
  }

  /**
   * Detect region from phone number
   */
  detectRegion(phoneNumber: string): ComplianceRegion {
    try {
      const parsed = parsePhoneNumber(phoneNumber);
      if (!parsed || !parsed.country) {
        return ComplianceRegion.OTHER;
      }

      const country = parsed.country as string;

      if (US_COUNTRY_CODES.includes(country)) {
        return ComplianceRegion.US;
      }
      if (EU_COUNTRY_CODES.includes(country)) {
        return ComplianceRegion.EU;
      }

      return ComplianceRegion.OTHER;
    } catch (error) {
      this.logger.warn(`Failed to detect region for ${phoneNumber}: ${error}`);
      return ComplianceRegion.OTHER;
    }
  }

  /**
   * Validate if a single message can be sent
   */
  async validateSingleMessage(
    tenantId: string,
    phoneNumber: string
  ): Promise<ComplianceValidationResult> {
    const warnings: ComplianceWarning[] = [];
    const errors: ComplianceError[] = [];
    const suggestions: string[] = [];

    // Check if compliance is enabled
    if (!this.complianceEnabled) {
      return {
        canSend: true,
        region: ComplianceRegion.OTHER,
        status: ComplianceStatus.APPROVED,
        warnings: [],
        errors: [],
        suggestions: [],
      };
    }

    // Detect region
    const region = this.detectRegion(phoneNumber);

    // Get tenant compliance status
    const compliance = await this.getComplianceStatus(tenantId);
    const status = compliance.getRegionStatus(region);

    // Validate based on region
    switch (region) {
      case ComplianceRegion.US:
        this.validateUSCompliance(compliance, errors, warnings, suggestions);
        break;

      case ComplianceRegion.EU:
        this.validateEUCompliance(compliance, errors, warnings, suggestions);
        break;

      default:
        // OTHER regions have no specific requirements
        break;
    }

    // Determine if we can send
    const blockingErrors = errors.filter((e) => e.blocking);
    const canSend = blockingErrors.length === 0 || compliance.complianceMode === 'off';

    return {
      canSend,
      region,
      status,
      warnings,
      errors,
      suggestions,
    };
  }

  /**
   * Validate compliance for a campaign with multiple recipients
   */
  async validateCampaign(
    tenantId: string,
    phoneNumbers: string[]
  ): Promise<CampaignComplianceResult> {
    const warnings: ComplianceWarning[] = [];
    const errors: ComplianceError[] = [];
    const blockedNumbers: BlockedNumber[] = [];
    const regionCounts = new Map<ComplianceRegion, number>();

    // Get tenant compliance status
    const compliance = await this.getComplianceStatus(tenantId);

    // Group phone numbers by region
    for (const phone of phoneNumbers) {
      const region = this.detectRegion(phone);
      regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    }

    // Build region breakdown
    const regionBreakdown: RegionBreakdown[] = [];

    for (const [region, count] of regionCounts.entries()) {
      const validation = await this.validateSingleMessage(
        tenantId,
        this.getSamplePhoneForRegion(region)
      );

      regionBreakdown.push({
        region,
        count,
        status: validation.status,
        canSend: validation.canSend,
        reason: validation.errors[0]?.message,
      });

      // Collect warnings and errors (deduplicate)
      validation.warnings.forEach((w) => {
        if (!warnings.find((existing) => existing.code === w.code)) {
          warnings.push(w);
        }
      });

      validation.errors.forEach((e) => {
        if (!errors.find((existing) => existing.code === e.code)) {
          errors.push(e);
        }
      });

      // If region is blocked, mark all numbers as blocked
      if (!validation.canSend && compliance.complianceMode !== 'off') {
        for (const phone of phoneNumbers) {
          if (this.detectRegion(phone) === region) {
            blockedNumbers.push({
              phoneNumber: phone,
              region,
              reason: validation.errors[0]?.message || 'Compliance check failed',
            });
          }
        }
      }
    }

    const compliantRecipients = phoneNumbers.length - blockedNumbers.length;
    const canSend = compliantRecipients > 0 || compliance.complianceMode === 'off';

    return {
      canSend,
      totalRecipients: phoneNumbers.length,
      compliantRecipients,
      blockedRecipients: blockedNumbers.length,
      regionBreakdown,
      warnings,
      errors,
      blockedNumbers,
    };
  }

  // ============================================
  // US 10DLC Methods
  // ============================================

  /**
   * Get US 10DLC status for a tenant
   */
  async getUS10DLCStatus(tenantId: string): Promise<US10DLCStatusResult> {
    const compliance = await this.getComplianceStatus(tenantId);
    const errors: string[] = [];

    // Build Trust Hub URL
    const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
    const accountSid = twilioClient?.accountSid || 'YOUR_ACCOUNT_SID';
    const trustHubUrl = `https://console.twilio.com/us1/develop/sms/regulatory-compliance/trust-hub?accountSid=${accountSid}`;

    if (compliance.usBrandStatus !== US10DLCBrandStatus.APPROVED) {
      errors.push('Brand not registered or not approved');
    }
    if (compliance.usCampaignStatus !== US10DLCCampaignStatus.VERIFIED) {
      errors.push('Campaign not verified');
    }

    return {
      brandStatus: compliance.usBrandStatus,
      brandName: compliance.usBrandName || undefined,
      campaignStatus: compliance.usCampaignStatus,
      isCompliant: compliance.isUSCompliant,
      trustHubUrl,
      errors,
    };
  }

  /**
   * Refresh US 10DLC status from Twilio
   * Note: This requires Twilio Trust Hub API access
   */
  async refreshUS10DLCStatus(tenantId: string): Promise<TenantComplianceStatus> {
    const compliance = await this.getComplianceStatus(tenantId);

    try {
      const twilioClient = await this.twilioFactory.getClientForTenant(tenantId);
      if (!twilioClient) {
        this.logger.warn(`No Twilio client for tenant ${tenantId}`);
        return compliance;
      }

      // Note: Full Trust Hub integration would require:
      // - Fetching brand status from Twilio Trust Hub API
      // - Fetching campaign status
      // - Updating local records
      // This is a simplified version that just updates the timestamp

      compliance.usLastCheckedAt = new Date();
      await this.complianceRepository.save(compliance);

      this.logger.log(`Refreshed US 10DLC status for tenant ${tenantId}`);
      return compliance;
    } catch (error: any) {
      this.logger.error(`Failed to refresh US 10DLC status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Manually update US 10DLC status (for admin use or webhook handling)
   */
  async updateUS10DLCStatus(
    tenantId: string,
    brandStatus?: US10DLCBrandStatus,
    brandSid?: string,
    brandName?: string,
    campaignStatus?: US10DLCCampaignStatus,
    campaignSid?: string,
    messagingServiceSid?: string
  ): Promise<TenantComplianceStatus> {
    const compliance = await this.getComplianceStatus(tenantId);

    if (brandStatus !== undefined) {
      compliance.usBrandStatus = brandStatus;
    }
    if (brandSid !== undefined) {
      compliance.usBrandSid = brandSid;
    }
    if (brandName !== undefined) {
      compliance.usBrandName = brandName;
    }
    if (campaignStatus !== undefined) {
      compliance.usCampaignStatus = campaignStatus;
    }
    if (campaignSid !== undefined) {
      compliance.usCampaignSid = campaignSid;
    }
    if (messagingServiceSid !== undefined) {
      compliance.usMessagingServiceSid = messagingServiceSid;
    }

    if (brandStatus === US10DLCBrandStatus.APPROVED && !compliance.usRegisteredAt) {
      compliance.usRegisteredAt = new Date();
    }

    compliance.usLastCheckedAt = new Date();
    await this.complianceRepository.save(compliance);

    this.logger.log(`Updated US 10DLC status for tenant ${tenantId}`);
    return compliance;
  }

  // ============================================
  // Private Validation Methods
  // ============================================

  private validateUSCompliance(
    compliance: TenantComplianceStatus,
    errors: ComplianceError[],
    warnings: ComplianceWarning[],
    suggestions: string[]
  ): void {
    if (!this.us10DLCRequired) {
      return;
    }

    if (compliance.usBrandStatus !== US10DLCBrandStatus.APPROVED) {
      if (compliance.complianceMode === 'strict') {
        errors.push({
          code: ERROR_CODES.US_BRAND_NOT_REGISTERED,
          message:
            'US 10DLC brand not registered. Messages to US numbers may be blocked by carriers.',
          region: ComplianceRegion.US,
          blocking: true,
        });
      } else {
        warnings.push({
          code: ERROR_CODES.US_BRAND_NOT_REGISTERED,
          message: 'US 10DLC brand not registered. Messages may be filtered by carriers.',
          severity: 'high',
          region: ComplianceRegion.US,
        });
      }
      suggestions.push('Register your brand in Twilio Trust Hub for better deliverability');
    }

    if (
      compliance.usBrandStatus === US10DLCBrandStatus.APPROVED &&
      compliance.usCampaignStatus !== US10DLCCampaignStatus.VERIFIED
    ) {
      if (compliance.complianceMode === 'strict') {
        errors.push({
          code: ERROR_CODES.US_CAMPAIGN_NOT_VERIFIED,
          message: 'US 10DLC campaign not verified.',
          region: ComplianceRegion.US,
          blocking: true,
        });
      } else {
        warnings.push({
          code: ERROR_CODES.US_CAMPAIGN_NOT_VERIFIED,
          message: 'US 10DLC campaign not verified. Consider completing verification.',
          severity: 'medium',
          region: ComplianceRegion.US,
        });
      }
      suggestions.push('Complete campaign verification in Twilio Trust Hub');
    }
  }

  private validateEUCompliance(
    compliance: TenantComplianceStatus,
    errors: ComplianceError[],
    warnings: ComplianceWarning[],
    suggestions: string[]
  ): void {
    if (!compliance.euConsentTrackingEnabled) {
      warnings.push({
        code: ERROR_CODES.EU_CONSENT_REQUIRED,
        message: 'GDPR requires explicit consent before sending marketing SMS to EU numbers.',
        severity: 'high',
        region: ComplianceRegion.EU,
      });
      suggestions.push('Ensure contacts have given explicit SMS consent');
    }
  }

  /**
   * Get a sample phone number for a region (for validation purposes)
   */
  private getSamplePhoneForRegion(region: ComplianceRegion): string {
    switch (region) {
      case ComplianceRegion.US:
        return '+12025551234';
      case ComplianceRegion.EU:
        return '+447911123456';
      default:
        return '+61412345678';
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Update compliance mode for a tenant
   */
  async updateComplianceMode(
    tenantId: string,
    mode: 'strict' | 'warn' | 'off'
  ): Promise<TenantComplianceStatus> {
    const compliance = await this.getComplianceStatus(tenantId);
    compliance.complianceMode = mode;
    await this.complianceRepository.save(compliance);

    this.logger.log(`Updated compliance mode to ${mode} for tenant ${tenantId}`);
    return compliance;
  }

  /**
   * Get compliance summary for a tenant
   */
  async getComplianceSummary(tenantId: string): Promise<{
    us: { status: ComplianceStatus; isCompliant: boolean; details: string };
    eu: { status: ComplianceStatus; isCompliant: boolean; details: string };
    mode: string;
  }> {
    const compliance = await this.getComplianceStatus(tenantId);

    return {
      us: {
        status: compliance.getRegionStatus(ComplianceRegion.US),
        isCompliant: compliance.isUSCompliant,
        details: compliance.isUSCompliant
          ? `Brand: ${compliance.usBrandName || 'Registered'}`
          : 'Registration required in Twilio Trust Hub',
      },
      eu: {
        status: compliance.getRegionStatus(ComplianceRegion.EU),
        isCompliant: compliance.isEUCompliant,
        details: compliance.isEUCompliant ? 'Consent tracking enabled' : 'Enable consent tracking',
      },
      mode: compliance.complianceMode,
    };
  }
}
