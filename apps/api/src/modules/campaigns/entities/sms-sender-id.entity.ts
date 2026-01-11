import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

export enum SenderIdType {
  NUMERIC = 'numeric',
  ALPHANUMERIC = 'alphanumeric',
}

export enum SenderIdStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('sms_sender_ids')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'senderId', 'countryCode'], { unique: true })
export class SmsSenderId extends TenantSoftDeleteEntity {
  @Column({ name: 'sender_id', type: 'varchar', length: 20 })
  senderId: string;

  @Column({
    type: 'enum',
    enum: SenderIdType,
    default: SenderIdType.ALPHANUMERIC,
  })
  type: SenderIdType;

  @Column({ name: 'country_code', type: 'varchar', length: 5, nullable: true })
  countryCode: string | null;

  @Column({
    type: 'enum',
    enum: SenderIdStatus,
    default: SenderIdStatus.PENDING,
  })
  status: SenderIdStatus;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'verification_code', type: 'varchar', length: 100, nullable: true })
  verificationCode: string | null;

  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
