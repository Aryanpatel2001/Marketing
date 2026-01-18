import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  PAUSED = 'paused',
}

@Entity('tenant_subscriptions')
@Index(['tenantId', 'status'])
export class TenantSubscription extends TenantBaseEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.INCOMPLETE })
  status: SubscriptionStatus;

  // Stripe IDs
  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId: string | null;

  @Column({
    name: 'stripe_subscription_id',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  stripeSubscriptionId: string | null;

  @Column({ name: 'stripe_payment_method_id', type: 'varchar', length: 100, nullable: true })
  stripePaymentMethodId: string | null;

  // Billing Period
  @Column({ name: 'current_period_start', type: 'timestamp with time zone', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamp with time zone', nullable: true })
  currentPeriodEnd: Date | null;

  // Trial
  @Column({ name: 'trial_start', type: 'timestamp with time zone', nullable: true })
  trialStart: Date | null;

  @Column({ name: 'trial_end', type: 'timestamp with time zone', nullable: true })
  trialEnd: Date | null;

  // Cancellation
  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  // Payment Info
  @Column({ name: 'last_payment_date', type: 'timestamp with time zone', nullable: true })
  lastPaymentDate: Date | null;

  @Column({ name: 'last_payment_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastPaymentAmount: number | null;

  @Column({ name: 'next_billing_date', type: 'timestamp with time zone', nullable: true })
  nextBillingDate: Date | null;

  // Metadata
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
