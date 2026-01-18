import { Column, Entity, Index } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
  FAILED = 'failed',
}

export enum InvoiceType {
  SUBSCRIPTION = 'subscription',
  ONE_TIME = 'one_time',
  OVERAGE = 'overage',
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  channel?: string;
  periodStart?: string;
  periodEnd?: string;
}

@Entity('invoices')
@Index(['tenantId', 'status'])
@Index(['stripeInvoiceId'], { unique: true })
export class Invoice extends TenantBaseEntity {
  @Column({ name: 'invoice_number', type: 'varchar', length: 50, unique: true })
  invoiceNumber: string;

  @Column({ type: 'enum', enum: InvoiceType, default: InvoiceType.SUBSCRIPTION })
  type: InvoiceType;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  // Stripe
  @Column({ name: 'stripe_invoice_id', type: 'varchar', length: 100, nullable: true })
  stripeInvoiceId: string | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 100, nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ name: 'stripe_hosted_invoice_url', type: 'text', nullable: true })
  stripeHostedInvoiceUrl: string | null;

  @Column({ name: 'stripe_invoice_pdf', type: 'text', nullable: true })
  stripeInvoicePdf: string | null;

  // Billing Period
  @Column({ name: 'period_start', type: 'timestamp with time zone', nullable: true })
  periodStart: Date | null;

  @Column({ name: 'period_end', type: 'timestamp with time zone', nullable: true })
  periodEnd: Date | null;

  // Amounts
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  tax: number;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ name: 'amount_due', type: 'decimal', precision: 10, scale: 2, default: 0 })
  amountDue: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  // Line Items
  @Column({ name: 'line_items', type: 'jsonb', default: [] })
  lineItems: InvoiceLineItem[];

  // Dates
  @Column({ name: 'issued_at', type: 'timestamp with time zone', nullable: true })
  issuedAt: Date | null;

  @Column({ name: 'due_date', type: 'timestamp with time zone', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'voided_at', type: 'timestamp with time zone', nullable: true })
  voidedAt: Date | null;

  // Customer Info (snapshot at invoice time)
  @Column({ name: 'customer_email', type: 'varchar', length: 255, nullable: true })
  customerEmail: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
  billingAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;

  // Notes
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  footer: string | null;

  // Metadata
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
