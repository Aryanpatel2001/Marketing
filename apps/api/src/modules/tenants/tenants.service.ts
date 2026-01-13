import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan, Tenant, TenantStatus } from './entities/tenant.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>
  ) {}

  async create(data: { name: string; slug?: string; billingEmail?: string }): Promise<Tenant> {
    const slug = data.slug || this.generateSlug(data.name);

    // Check if slug already exists
    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    // Set trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const tenant = this.tenantRepository.create({
      name: data.name,
      slug,
      billingEmail: data.billingEmail,
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

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { slug } });
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { stripeCustomerId } });
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    Object.assign(tenant, data);
    return this.tenantRepository.save(tenant);
  }

  async updateStripeIds(
    id: string,
    stripeCustomerId: string,
    stripeSubscriptionId?: string
  ): Promise<Tenant> {
    return this.update(id, {
      stripeCustomerId,
      stripeSubscriptionId,
    });
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
