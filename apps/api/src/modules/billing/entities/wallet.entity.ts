import { Column, Entity, Index, OneToMany } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';
import { WalletTransaction } from './wallet-transaction.entity';

export enum WalletCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  INR = 'INR',
}

@Entity('wallets')
@Index(['tenantId'], { unique: true })
export class Wallet extends TenantBaseEntity {
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  balance: number;

  @Column({ name: 'reserved_balance', type: 'decimal', precision: 12, scale: 4, default: 0 })
  reservedBalance: number;

  @Column({ type: 'enum', enum: WalletCurrency, default: WalletCurrency.USD })
  currency: WalletCurrency;

  // Low balance alert
  @Column({ name: 'low_balance_threshold', type: 'decimal', precision: 10, scale: 2, default: 10 })
  lowBalanceThreshold: number;

  @Column({ name: 'low_balance_alert_sent', type: 'boolean', default: false })
  lowBalanceAlertSent: boolean;

  @Column({ name: 'low_balance_alert_sent_at', type: 'timestamp with time zone', nullable: true })
  lowBalanceAlertSentAt: Date | null;

  // Auto recharge
  @Column({ name: 'auto_recharge_enabled', type: 'boolean', default: false })
  autoRechargeEnabled: boolean;

  @Column({ name: 'auto_recharge_amount', type: 'decimal', precision: 10, scale: 2, default: 50 })
  autoRechargeAmount: number;

  @Column({
    name: 'auto_recharge_threshold',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 10,
  })
  autoRechargeThreshold: number;

  // Lifetime stats
  @Column({ name: 'total_credited', type: 'decimal', precision: 12, scale: 4, default: 0 })
  totalCredited: number;

  @Column({ name: 'total_debited', type: 'decimal', precision: 12, scale: 4, default: 0 })
  totalDebited: number;

  // Last activity
  @Column({ name: 'last_topped_up_at', type: 'timestamp with time zone', nullable: true })
  lastToppedUpAt: Date | null;

  @Column({ name: 'last_debited_at', type: 'timestamp with time zone', nullable: true })
  lastDebitedAt: Date | null;

  @OneToMany(() => WalletTransaction, (transaction) => transaction.wallet)
  transactions: WalletTransaction[];

  // Helper method to get available balance
  get availableBalance(): number {
    return Number(this.balance) - Number(this.reservedBalance);
  }
}
