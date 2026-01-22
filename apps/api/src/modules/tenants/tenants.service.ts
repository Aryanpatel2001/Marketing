import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan, Tenant, TenantRegion, TenantStatus } from './entities/tenant.entity';

// EU country codes for region detection
const EU_COUNTRY_CODES = [
  '43', // Austria
  '32', // Belgium
  '359', // Bulgaria
  '385', // Croatia
  '357', // Cyprus
  '420', // Czech Republic
  '45', // Denmark
  '372', // Estonia
  '358', // Finland
  '33', // France
  '49', // Germany
  '30', // Greece
  '36', // Hungary
  '353', // Ireland
  '39', // Italy
  '371', // Latvia
  '370', // Lithuania
  '352', // Luxembourg
  '356', // Malta
  '31', // Netherlands
  '48', // Poland
  '351', // Portugal
  '40', // Romania
  '421', // Slovakia
  '386', // Slovenia
  '34', // Spain
  '46', // Sweden
  '44', // UK
  '41', // Switzerland
  '47', // Norway
];

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>
  ) {}

  async create(data: {
    name: string;
    slug?: string;
    billingEmail?: string;
    phoneNumber?: string;
    region?: TenantRegion;
  }): Promise<Tenant> {
    const slug = data.slug || this.generateSlug(data.name);

    // Check if slug already exists
    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    // Detect region from phone number if provided
    let region = data.region || TenantRegion.US;
    if (data.phoneNumber && !data.region) {
      region = this.detectRegionFromPhone(data.phoneNumber);
    }

    // Set trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const tenant = this.tenantRepository.create({
      name: data.name,
      slug,
      billingEmail: data.billingEmail,
      phoneNumber: data.phoneNumber || null,
      region,
      status: TenantStatus.TRIAL,
      plan: SubscriptionPlan.FREE,
      trialEndsAt,
      limits: {
        maxContacts: 500,
        maxCampaignsPerMonth: 3,
        maxEmailsPerMonth: 1000,
        maxSmsPerMonth: 100,
        maxUsersPerTenant: 2,
      },
      settings: {
        brandColor: '#6366f1',
        sendWelcomeEmail: true,
      },
    });

    return this.tenantRepository.save(tenant);
  }

  /**
   * Detect region from phone number
   * +1 = US, EU country codes = EU
   * Throws error if phone number is not from US or EU
   */
  detectRegionFromPhone(phoneNumber: string): TenantRegion {
    if (!phoneNumber) {
      throw new BadRequestException('Phone number is required');
    }

    // Remove all non-digit characters except leading +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');

    if (!cleaned.startsWith('+')) {
      throw new BadRequestException(
        'Phone number must be in international format (starting with +)'
      );
    }

    const withoutPlus = cleaned.substring(1);

    // Check for US (+1)
    if (withoutPlus.startsWith('1') && withoutPlus.length === 11) {
      return TenantRegion.US;
    }

    // Check for EU country codes
    for (const code of EU_COUNTRY_CODES) {
      if (withoutPlus.startsWith(code)) {
        return TenantRegion.EU;
      }
    }

    throw new BadRequestException(
      'Only US (+1) and EU phone numbers are supported. Please provide a valid US or EU phone number.'
    );
  }

  /**
   * Validate phone number matches account region
   * Used for contact import filtering
   */
  validatePhoneForRegion(phoneNumber: string, region: TenantRegion): boolean {
    try {
      const phoneRegion = this.detectRegionFromPhone(phoneNumber);
      return phoneRegion === region;
    } catch {
      return false;
    }
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { slug } });
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    Object.assign(tenant, data);
    return this.tenantRepository.save(tenant);
  }

  async updatePlan(id: string, plan: SubscriptionPlan): Promise<Tenant> {
    const limits = this.getPlanLimits(plan);
    return this.update(id, {
      plan,
      limits,
      status: TenantStatus.ACTIVE,
      trialEndsAt: null,
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private getPlanLimits(plan: SubscriptionPlan) {
    const limits = {
      [SubscriptionPlan.FREE]: {
        maxContacts: 500,
        maxCampaignsPerMonth: 3,
        maxEmailsPerMonth: 1000,
        maxSmsPerMonth: 100,
        maxUsersPerTenant: 2,
      },
      [SubscriptionPlan.STARTER]: {
        maxContacts: 5000,
        maxCampaignsPerMonth: 20,
        maxEmailsPerMonth: 25000,
        maxSmsPerMonth: 1000,
        maxUsersPerTenant: 5,
      },
      [SubscriptionPlan.GROWTH]: {
        maxContacts: 25000,
        maxCampaignsPerMonth: 100,
        maxEmailsPerMonth: 100000,
        maxSmsPerMonth: 10000,
        maxUsersPerTenant: 15,
      },
      [SubscriptionPlan.PRO]: {
        maxContacts: 100000,
        maxCampaignsPerMonth: -1, // unlimited
        maxEmailsPerMonth: 500000,
        maxSmsPerMonth: 50000,
        maxUsersPerTenant: 50,
      },
      [SubscriptionPlan.ENTERPRISE]: {
        maxContacts: -1, // unlimited
        maxCampaignsPerMonth: -1,
        maxEmailsPerMonth: -1,
        maxSmsPerMonth: -1,
        maxUsersPerTenant: -1,
      },
    };

    return limits[plan];
  }
}
