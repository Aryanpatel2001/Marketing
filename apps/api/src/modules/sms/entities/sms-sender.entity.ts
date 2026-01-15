import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

export enum SmsSenderType {
  DEDICATED_NUMBER = 'dedicated_number',
  TOLL_FREE = 'toll_free',
  SENDER_ID = 'sender_id',
}

export enum SmsSenderStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  FAILED = 'failed',
  RELEASED = 'released',
}

@Entity('sms_senders')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'type', 'status'])
@Index(['tenantId', 'isDefault'])
@Index(['phoneNumber'], {
  unique: true,
  where: '"deleted_at" IS NULL AND "phone_number" IS NOT NULL',
})
export class SmsSender extends TenantSoftDeleteEntity {
  @Column({
    type: 'enum',
    enum: SmsSenderType,
  })
  type: SmsSenderType;

  // For dedicated_number and toll_free types
  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'twilio_sid', type: 'varchar', length: 100, nullable: true })
  twilioSid: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 5, nullable: true })
  countryCode: string | null;

  // For sender_id type
  @Column({ name: 'sender_id', type: 'varchar', length: 11, nullable: true })
  senderId: string | null;

  @Column({ name: 'sender_id_countries', type: 'jsonb', nullable: true })
  senderIdCountries: string[] | null;

  // Common fields
  @Column({ name: 'friendly_name', type: 'varchar', length: 100 })
  friendlyName: string;

  @Column({
    type: 'enum',
    enum: SmsSenderStatus,
    default: SmsSenderStatus.PENDING,
  })
  status: SmsSenderStatus;

  @Column({ name: 'monthly_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyPrice: number | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  // Metrics
  @Column({ name: 'messages_sent', type: 'int', default: 0 })
  messagesSent: number;

  @Column({ name: 'delivery_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  deliveryRate: number;

  @Column({ name: 'last_used_at', type: 'timestamp with time zone', nullable: true })
  lastUsedAt: Date | null;

  // Capabilities (for phone numbers)
  @Column({ type: 'jsonb', default: { sms: true, voice: false, mms: false } })
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };

  // Purchase/renewal tracking
  @Column({ name: 'purchased_at', type: 'timestamp with time zone', nullable: true })
  purchasedAt: Date | null;

  @Column({ name: 'renews_at', type: 'timestamp with time zone', nullable: true })
  renewsAt: Date | null;

  // Admin notes (for sender ID approval)
  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  // Additional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
