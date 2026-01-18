import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantComplianceStatus } from '../entities/tenant-compliance-status.entity';
import { SmsSender } from '../entities/sms-sender.entity';

// ============================================
// Types & Interfaces
// ============================================

export interface EUCountryRules {
  countryCode: string;
  countryName: string;
  requiresOptOutMention: boolean;
  optOutText?: string;
  maxSenderIdLength: number;
  senderIdRegistrationRequired: boolean;
  specialRestrictions?: string[];
}

export interface EURegisterSenderIdDto {
  country: string;
  senderId: string;
  registrationId?: string;
}

export interface EUValidationResult {
  valid: boolean;
  country: string;
  errors: string[];
  warnings: string[];
  requiredOptOutText?: string;
}

export interface ConsentRecord {
  contactId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  consentGiven: boolean;
  consentDate?: Date;
  consentSource?: string;
  ipAddress?: string;
}

// EU Country-specific SMS rules
const EU_COUNTRY_RULES: Record<string, EUCountryRules> = {
  GB: {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    requiresOptOutMention: true,
    optOutText: 'Reply STOP to opt out',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: true,
    specialRestrictions: ['Must include company name or registered name'],
  },
  FR: {
    countryCode: 'FR',
    countryName: 'France',
    requiresOptOutMention: true,
    optOutText: 'STOP au',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: true,
    specialRestrictions: ['STOP mention is mandatory', 'Marketing SMS restricted on Sundays'],
  },
  DE: {
    countryCode: 'DE',
    countryName: 'Germany',
    requiresOptOutMention: true,
    optOutText: 'Antworten Sie STOP zum Abmelden',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
    specialRestrictions: ['Strict consent documentation required', 'Double opt-in recommended'],
  },
  ES: {
    countryCode: 'ES',
    countryName: 'Spain',
    requiresOptOutMention: true,
    optOutText: 'Responda BAJA para darse de baja',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  IT: {
    countryCode: 'IT',
    countryName: 'Italy',
    requiresOptOutMention: true,
    optOutText: 'Rispondi STOP per annullare',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  NL: {
    countryCode: 'NL',
    countryName: 'Netherlands',
    requiresOptOutMention: true,
    optOutText: 'Antwoord STOP om af te melden',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  BE: {
    countryCode: 'BE',
    countryName: 'Belgium',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  AT: {
    countryCode: 'AT',
    countryName: 'Austria',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  CH: {
    countryCode: 'CH',
    countryName: 'Switzerland',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  SE: {
    countryCode: 'SE',
    countryName: 'Sweden',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  NO: {
    countryCode: 'NO',
    countryName: 'Norway',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  DK: {
    countryCode: 'DK',
    countryName: 'Denmark',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  FI: {
    countryCode: 'FI',
    countryName: 'Finland',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  IE: {
    countryCode: 'IE',
    countryName: 'Ireland',
    requiresOptOutMention: true,
    optOutText: 'Reply STOP to unsubscribe',
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  PL: {
    countryCode: 'PL',
    countryName: 'Poland',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
  PT: {
    countryCode: 'PT',
    countryName: 'Portugal',
    requiresOptOutMention: true,
    maxSenderIdLength: 11,
    senderIdRegistrationRequired: false,
  },
};

// Default rules for unlisted EU countries
const DEFAULT_EU_RULES: EUCountryRules = {
  countryCode: 'EU',
  countryName: 'European Union',
  requiresOptOutMention: true,
  optOutText: 'Reply STOP to unsubscribe',
  maxSenderIdLength: 11,
  senderIdRegistrationRequired: false,
};

@Injectable()
export class EuComplianceService {
  private readonly logger = new Logger(EuComplianceService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(TenantComplianceStatus)
    private readonly complianceRepository: Repository<TenantComplianceStatus>,
    @InjectRepository(SmsSender)
    private readonly senderRepository: Repository<SmsSender>,
    private readonly configService: ConfigService
  ) {
    this.enabled = this.configService.get<boolean>('EU_COMPLIANCE_ENABLED', true);
    this.logger.log(`EU GDPR compliance service initialized: enabled=${this.enabled}`);
  }

  // ============================================
  // Country Rules
  // ============================================

  /**
   * Get SMS rules for a specific EU country
   */
  getCountryRules(countryCode: string): EUCountryRules {
    return EU_COUNTRY_RULES[countryCode.toUpperCase()] || DEFAULT_EU_RULES;
  }

  /**
   * Get all supported EU country rules
   */
  getAllCountryRules(): EUCountryRules[] {
    return Object.values(EU_COUNTRY_RULES);
  }

  /**
   * Check if a country is in EU/EEA
   */
  isEUCountry(countryCode: string): boolean {
    const euCountries = [
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
      // EEA countries
      'GB',
      'CH',
      'NO',
      'IS',
      'LI',
    ];
    return euCountries.includes(countryCode.toUpperCase());
  }

  // ============================================
  // Sender ID Registration
  // ============================================

  /**
   * Register a sender ID for an EU country
   */
  async registerSenderId(
    tenantId: string,
    dto: EURegisterSenderIdDto
  ): Promise<TenantComplianceStatus> {
    const rules = this.getCountryRules(dto.country);

    // Validate sender ID length
    if (dto.senderId.length > rules.maxSenderIdLength) {
      throw new BadRequestException(
        `Sender ID exceeds maximum length of ${rules.maxSenderIdLength} for ${rules.countryName}`
      );
    }

    // Validate sender ID format (alphanumeric, no leading zeros)
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(dto.senderId)) {
      throw new BadRequestException(
        'Sender ID must start with a letter and contain only alphanumeric characters'
      );
    }

    const compliance = await this.getOrCreateCompliance(tenantId);

    // Update EU sender IDs
    const senderIds = compliance.euSenderIds || {};
    senderIds[dto.country.toUpperCase()] = dto.senderId;
    compliance.euSenderIds = senderIds;
    compliance.euSenderIdRegistered = true;

    await this.complianceRepository.save(compliance);

    this.logger.log(`Registered sender ID "${dto.senderId}" for ${dto.country} tenant ${tenantId}`);

    return compliance;
  }

  /**
   * Get registered sender IDs for a tenant
   */
  async getRegisteredSenderIds(tenantId: string): Promise<Record<string, string>> {
    const compliance = await this.getOrCreateCompliance(tenantId);
    return compliance.euSenderIds || {};
  }

  // ============================================
  // Consent Management
  // ============================================

  /**
   * Enable consent tracking for a tenant
   */
  async enableConsentTracking(tenantId: string): Promise<TenantComplianceStatus> {
    const compliance = await this.getOrCreateCompliance(tenantId);
    compliance.euConsentTrackingEnabled = true;
    await this.complianceRepository.save(compliance);

    this.logger.log(`Enabled EU consent tracking for tenant ${tenantId}`);
    return compliance;
  }

  /**
   * Disable consent tracking for a tenant
   */
  async disableConsentTracking(tenantId: string): Promise<TenantComplianceStatus> {
    const compliance = await this.getOrCreateCompliance(tenantId);
    compliance.euConsentTrackingEnabled = false;
    await this.complianceRepository.save(compliance);

    this.logger.log(`Disabled EU consent tracking for tenant ${tenantId}`);
    return compliance;
  }

  /**
   * Check if consent tracking is enabled
   */
  async isConsentTrackingEnabled(tenantId: string): Promise<boolean> {
    const compliance = await this.getOrCreateCompliance(tenantId);
    return compliance.euConsentTrackingEnabled;
  }

  // ============================================
  // Message Validation
  // ============================================

  /**
   * Validate a message for EU compliance
   */
  async validateMessage(
    tenantId: string,
    message: string,
    countryCode: string
  ): Promise<EUValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.isEUCountry(countryCode)) {
      return {
        valid: true,
        country: countryCode,
        errors: [],
        warnings: [],
      };
    }

    const rules = this.getCountryRules(countryCode);
    const compliance = await this.getOrCreateCompliance(tenantId);

    // Check consent tracking
    if (!compliance.euConsentTrackingEnabled) {
      warnings.push('GDPR consent tracking is not enabled');
    }

    // Check opt-out mention
    if (rules.requiresOptOutMention) {
      const optOutPatterns = [
        /\bSTOP\b/i,
        /\bUNSUBSCRIBE\b/i,
        /\bOPT.?OUT\b/i,
        /\bABMELDEN\b/i, // German
        /\bBAJA\b/i, // Spanish
        /\bARRET\b/i, // French
      ];

      const hasOptOut = optOutPatterns.some((pattern) => pattern.test(message));

      if (!hasOptOut) {
        if (compliance.complianceMode === 'strict') {
          errors.push(`Opt-out mention required for ${rules.countryName}`);
        } else {
          warnings.push(
            `Consider adding opt-out text: "${rules.optOutText || 'Reply STOP to unsubscribe'}"`
          );
        }
      }
    }

    // Check sender ID registration for countries that require it
    if (rules.senderIdRegistrationRequired) {
      const senderIds = compliance.euSenderIds || {};
      if (!senderIds[countryCode]) {
        warnings.push(`Sender ID not registered for ${rules.countryName}`);
      }
    }

    // Add country-specific warnings
    if (rules.specialRestrictions) {
      rules.specialRestrictions.forEach((restriction) => {
        warnings.push(`${rules.countryName}: ${restriction}`);
      });
    }

    return {
      valid: errors.length === 0,
      country: countryCode,
      errors,
      warnings,
      requiredOptOutText: rules.optOutText,
    };
  }

  /**
   * Get opt-out text for a country
   */
  getOptOutText(countryCode: string): string {
    const rules = this.getCountryRules(countryCode);
    return rules.optOutText || 'Reply STOP to unsubscribe';
  }

  /**
   * Append opt-out text to a message
   */
  appendOptOutText(message: string, countryCode: string): string {
    const optOutText = this.getOptOutText(countryCode);

    // Check if opt-out already present
    if (/\bSTOP\b/i.test(message)) {
      return message;
    }

    // Append opt-out text
    const separator =
      message.endsWith('.') || message.endsWith('!') || message.endsWith('?') ? ' ' : '. ';

    return `${message}${separator}${optOutText}`;
  }

  // ============================================
  // Sender Validation
  // ============================================

  /**
   * Validate sender for EU messages
   */
  async validateSender(
    tenantId: string,
    senderId: string,
    countryCode: string
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rules = this.getCountryRules(countryCode);

    // Check sender ID format
    if (!senderId || senderId.length === 0) {
      errors.push('Sender ID is required for EU messages');
      return { valid: false, errors, warnings };
    }

    // Check length
    if (senderId.length > rules.maxSenderIdLength) {
      errors.push(
        `Sender ID "${senderId}" exceeds maximum ${rules.maxSenderIdLength} characters for ${rules.countryName}`
      );
    }

    // Check if sender is registered for the country
    if (rules.senderIdRegistrationRequired) {
      const compliance = await this.getOrCreateCompliance(tenantId);
      const registeredId = compliance.euSenderIds?.[countryCode];

      if (!registeredId) {
        warnings.push(`No sender ID registered for ${rules.countryName}`);
      } else if (registeredId !== senderId) {
        warnings.push(
          `Using unregistered sender ID. Registered: "${registeredId}", Using: "${senderId}"`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async getOrCreateCompliance(tenantId: string): Promise<TenantComplianceStatus> {
    let compliance = await this.complianceRepository.findOne({
      where: { tenantId },
    });

    if (!compliance) {
      compliance = this.complianceRepository.create({
        tenantId,
        complianceMode: 'warn',
        euConsentTrackingEnabled: true, // Enable by default for GDPR
      });
      compliance = await this.complianceRepository.save(compliance);
    }

    return compliance;
  }
}
