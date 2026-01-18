import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  // Purchase/credit types
  CREDIT_PURCHASE = 'credit_purchase',
  SUBSCRIPTION_CREDIT = 'subscription_credit',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  TRIAL_CREDIT = 'trial_credit',
  MANUAL_ADJUSTMENT = 'manual_adjustment',

  // Deduction types
  SMS_DEDUCTION = 'sms_deduction',
  EMAIL_DEDUCTION = 'email_deduction',

  // Refund types
  SMS_REFUND = 'sms_refund',
  EMAIL_REFUND = 'email_refund',
  REFUND = 'refund',

  // Reserve/release types
  RESERVED = 'reserved',
  RELEASED = 'released',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum TransactionChannel {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  PLATFORM = 'platform',
}

export enum TransactionReferenceType {
  TOP_UP = 'top_up',
  CAMPAIGN = 'campaign',
  MESSAGE = 'message',
  SUBSCRIPTION = 'subscription',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  AUTO_RECHARGE = 'auto_recharge',
  PROMO_CREDIT = 'promo_credit',
}

@Entity('wallet_transactions')
@Index(['tenantId', 'createdAt'])
@Index(['walletId', 'type'])
@Index(['referenceType', 'referenceId'])
@Index(['stripePaymentIntentId'])
export class WalletTransaction extends TenantBaseEntity {
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.COMPLETED })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amount: number;

  @Column({ name: 'balance_before', type: 'decimal', precision: 12, scale: 4 })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 4 })
  balanceAfter: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TransactionChannel, nullable: true })
  channel: TransactionChannel | null;

  @Column({ name: 'reference_type', type: 'enum', enum: TransactionReferenceType, nullable: true })
  referenceType: TransactionReferenceType | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  // Stripe reference
  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 100, nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ name: 'stripe_charge_id', type: 'varchar', length: 100, nullable: true })
  stripeChargeId: string | null;

  // Message details (for campaign deductions)
  @Column({ name: 'message_count', type: 'int', nullable: true })
  messageCount: number | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 6, nullable: true })
  unitPrice: number | null;

  // Metadata
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  // IP and user agent for audit
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;
}
