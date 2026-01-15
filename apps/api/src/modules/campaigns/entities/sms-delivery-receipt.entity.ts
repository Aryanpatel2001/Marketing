import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CampaignMessage } from './campaign-message.entity';

export enum SmsDeliveryStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  UNDELIVERED = 'undelivered',
}

@Entity('sms_delivery_receipts')
@Index(['campaignMessageId'])
@Index(['tenantId', 'status'])
@Index(['receivedAt'])
export class SmsDeliveryReceipt extends TenantSoftDeleteEntity {
  @Column({ name: 'campaign_message_id', type: 'uuid' })
  campaignMessageId: string;

  @Column({
    type: 'enum',
    enum: SmsDeliveryStatus,
    default: SmsDeliveryStatus.QUEUED,
  })
  status: SmsDeliveryStatus;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  carrier: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 5, nullable: true })
  countryCode: string | null;

  @Column({ type: 'integer', nullable: true })
  segments: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  cost: number | null;

  @Column({ name: 'received_at', type: 'timestamp with time zone' })
  receivedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => CampaignMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_message_id' })
  campaignMessage: CampaignMessage;
}
