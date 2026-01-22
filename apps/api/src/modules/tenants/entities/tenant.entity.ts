import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  TRIAL = 'trial',
  GRACE_PERIOD = 'grace_period',
}

export enum TenantRegion {
  US = 'US',
  EU = 'EU',
}

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logo: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status: TenantStatus;

  @Column({ name: 'trial_ends_at', type: 'timestamp with time zone', nullable: true })
  trialEndsAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };

  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true })
  billingEmail: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId: string | null;

  @Column({
    type: 'enum',
    enum: TenantRegion,
    default: TenantRegion.US,
  })
  region: TenantRegion;

  @Column({ name: 'phone_number', type: 'varchar', length: 50, nullable: true })
  phoneNumber: string | null;
}
