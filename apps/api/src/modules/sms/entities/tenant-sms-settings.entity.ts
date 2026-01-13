import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

export enum SenderType {
  SHARED = 'shared',
  DEDICATED = 'dedicated',
  SENDER_ID = 'sender_id',
  BYOC = 'byoc',
}

@Entity('tenant_sms_settings')
@Index(['tenantId'], { unique: true })
export class TenantSmsSettings extends TenantBaseEntity {
  // Default sending configuration
  @Column({
    name: 'default_sender_type',
    type: 'varchar',
    length: 20,
    default: SenderType.SHARED,
  })
  defaultSenderType: SenderType;

  // Reference to default dedicated phone number (SmsSender ID)
  @Column({ name: 'default_phone_number_id', type: 'uuid', nullable: true })
  defaultPhoneNumberId: string | null;

  // Reference to default sender ID (SmsSender ID)
  @Column({ name: 'default_sender_id_id', type: 'uuid', nullable: true })
  defaultSenderIdId: string | null;

  // ============================================
  // BYOC (Bring Your Own Credentials) - Enterprise Only
  // ============================================

  @Column({ name: 'byoc_enabled', type: 'boolean', default: false })
  byocEnabled: boolean;

  // Encrypted Twilio Account SID (AES-256-GCM)
  @Column({ name: 'twilio_account_sid_enc', type: 'text', nullable: true })
  twilioAccountSidEnc: string | null;

  // Encrypted Twilio Auth Token (AES-256-GCM)
  @Column({ name: 'twilio_auth_token_enc', type: 'text', nullable: true })
  twilioAuthTokenEnc: string | null;

  // Encryption IV (shared for both SID and token for simplicity)
  @Column({ name: 'twilio_encryption_iv', type: 'varchar', length: 64, nullable: true })
  twilioEncryptionIv: string | null;

  // Encryption auth tag for Account SID
  @Column({ name: 'twilio_sid_tag', type: 'varchar', length: 64, nullable: true })
  twilioSidTag: string | null;

  // Encryption auth tag for Auth Token
  @Column({ name: 'twilio_token_tag', type: 'varchar', length: 64, nullable: true })
  twilioTokenTag: string | null;

  // Optional: Twilio Messaging Service SID for BYOC
  @Column({ name: 'twilio_messaging_service_sid', type: 'varchar', length: 100, nullable: true })
  twilioMessagingServiceSid: string | null;

  // Last time BYOC credentials were verified
  @Column({ name: 'byoc_verified_at', type: 'timestamp with time zone', nullable: true })
  byocVerifiedAt: Date | null;

  // ============================================
  // Rate Limiting
  // ============================================

  @Column({ name: 'max_sms_per_minute', type: 'int', default: 60 })
  maxSmsPerMinute: number;

  @Column({ name: 'max_sms_per_day', type: 'int', default: 10000 })
  maxSmsPerDay: number;

  // ============================================
  // Webhook Configuration
  // ============================================

  // Custom webhook URL for delivery receipts
  @Column({ name: 'webhook_url', type: 'varchar', length: 500, nullable: true })
  webhookUrl: string | null;

  // Secret for webhook signature verification
  @Column({ name: 'webhook_secret', type: 'varchar', length: 100, nullable: true })
  webhookSecret: string | null;

  // ============================================
  // Feature Flags
  // ============================================

  // Enable A2P 10DLC registration guidance
  @Column({ name: 'a2p_enabled', type: 'boolean', default: false })
  a2pEnabled: boolean;

  // Enable international SMS
  @Column({ name: 'international_sms_enabled', type: 'boolean', default: false })
  internationalSmsEnabled: boolean;

  // ============================================
  // Metadata
  // ============================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // ============================================
  // Relations
  // ============================================

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
