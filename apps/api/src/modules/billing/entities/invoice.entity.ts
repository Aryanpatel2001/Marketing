import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

@Entity('invoices')
@Index(['tenantId', 'createdAt'])
@Index(['stripeInvoiceId'], { unique: true })
@Index(['stripeCustomerId'])
export class Invoice extends TenantBaseEntity {
  @Column({ name: 'stripe_invoice_id', type: 'varchar', length: 255, unique: true })
  stripeInvoiceId: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255 })
  stripeCustomerId: string;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 100, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl: string | null;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string | null;

  @Column({ name: 'due_date', type: 'timestamp with time zone', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'period_start', type: 'timestamp with time zone', nullable: true })
  periodStart: Date | null;

  @Column({ name: 'period_end', type: 'timestamp with time zone', nullable: true })
  periodEnd: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  lineItems: Array<{
    description: string;
    amount: number;
    quantity: number;
  }> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
