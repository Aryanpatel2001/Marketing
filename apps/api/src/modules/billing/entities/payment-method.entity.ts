import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

export enum PaymentMethodType {
  CARD = 'card',
  BANK_ACCOUNT = 'bank_account',
  SEPA_DEBIT = 'sepa_debit',
  US_BANK_ACCOUNT = 'us_bank_account',
}

@Entity('payment_methods')
@Index(['tenantId'])
@Index(['stripePaymentMethodId'], { unique: true })
export class PaymentMethod extends TenantBaseEntity {
  @Column({ name: 'stripe_payment_method_id', type: 'varchar', length: 255, unique: true })
  stripePaymentMethodId: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255 })
  stripeCustomerId: string;

  @Column({ type: 'enum', enum: PaymentMethodType })
  type: PaymentMethodType;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  brand: string | null;

  @Column({ name: 'last_four', type: 'varchar', length: 4, nullable: true })
  lastFour: string | null;

  @Column({ name: 'exp_month', type: 'int', nullable: true })
  expMonth: number | null;

  @Column({ name: 'exp_year', type: 'int', nullable: true })
  expYear: number | null;

  @Column({ name: 'card_holder_name', type: 'varchar', length: 255, nullable: true })
  cardHolderName: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
