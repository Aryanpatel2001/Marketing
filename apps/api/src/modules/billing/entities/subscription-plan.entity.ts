import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum PlanInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum PlanTier {
  FREE = 'free',
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Entity('subscription_plans')
export class SubscriptionPlan extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: PlanTier, unique: true })
  tier: PlanTier;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'enum', enum: PlanInterval, default: PlanInterval.MONTHLY })
  interval: PlanInterval;

  @Column({ name: 'stripe_product_id', type: 'varchar', length: 100, nullable: true })
  stripeProductId: string | null;

  @Column({ name: 'stripe_price_id', type: 'varchar', length: 100, nullable: true })
  stripePriceId: string | null;

  // Quotas
  @Column({ name: 'sms_quota', type: 'int', default: 0 })
  smsQuota: number;

  @Column({ name: 'email_quota', type: 'int', default: 0 })
  emailQuota: number;

  @Column({ name: 'whatsapp_quota', type: 'int', default: 0 })
  whatsappQuota: number;

  // Limits
  @Column({ name: 'max_contacts', type: 'int', default: 100 })
  maxContacts: number;

  @Column({ name: 'max_senders', type: 'int', default: 1 })
  maxSenders: number;

  @Column({ name: 'max_users', type: 'int', default: 1 })
  maxUsers: number;

  @Column({ name: 'max_campaigns_per_month', type: 'int', default: 10 })
  maxCampaignsPerMonth: number;

  // Features
  @Column({ type: 'jsonb', default: {} })
  features: {
    apiAccess: boolean;
    customDomain: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    webhooks: boolean;
    automations: boolean;
    abTesting: boolean;
    dedicatedIp: boolean;
    whiteLabel: boolean;
  };

  // Trial
  @Column({ name: 'trial_days', type: 'int', default: 0 })
  trialDays: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
