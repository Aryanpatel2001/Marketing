import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  CREDIT_PURCHASE = 'credit_purchase',
  SMS_DEDUCTION = 'sms_deduction',
  SMS_REFUND = 'sms_refund',
  EMAIL_DEDUCTION = 'email_deduction',
  EMAIL_REFUND = 'email_refund',
  SUBSCRIPTION_CREDIT = 'subscription_credit',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  RESERVED = 'reserved',
  RELEASED = 'released',
  REFUND = 'refund',
  TRIAL_CREDIT = 'trial_credit',
}

@Entity('wallet_transactions')
@Index(['tenantId', 'createdAt'])
@Index(['walletId', 'type'])
@Index(['referenceId'])
export class WalletTransaction extends TenantBaseEntity {
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'balance_before', type: 'decimal', precision: 12, scale: 2 })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'varchar', length: 255, nullable: true })
  referenceId: string | null;

  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 255, nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;
}
