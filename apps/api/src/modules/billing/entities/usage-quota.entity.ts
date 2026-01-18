import { Column, Entity, Index } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

@Entity('usage_quotas')
@Index(['tenantId', 'periodStart', 'periodEnd'])
export class UsageQuota extends TenantBaseEntity {
  // Period
  @Column({ name: 'period_start', type: 'timestamp with time zone' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamp with time zone' })
  periodEnd: Date;

  // SMS Usage
  @Column({ name: 'sms_limit', type: 'int', default: 0 })
  smsLimit: number;

  @Column({ name: 'sms_used', type: 'int', default: 0 })
  smsUsed: number;

  @Column({ name: 'sms_overage', type: 'int', default: 0 })
  smsOverage: number;

  // Email Usage
  @Column({ name: 'email_limit', type: 'int', default: 0 })
  emailLimit: number;

  @Column({ name: 'email_used', type: 'int', default: 0 })
  emailUsed: number;

  @Column({ name: 'email_overage', type: 'int', default: 0 })
  emailOverage: number;

  // WhatsApp Usage
  @Column({ name: 'whatsapp_limit', type: 'int', default: 0 })
  whatsappLimit: number;

  @Column({ name: 'whatsapp_used', type: 'int', default: 0 })
  whatsappUsed: number;

  @Column({ name: 'whatsapp_overage', type: 'int', default: 0 })
  whatsappOverage: number;

  // Contact Usage
  @Column({ name: 'contacts_limit', type: 'int', default: 0 })
  contactsLimit: number;

  @Column({ name: 'contacts_used', type: 'int', default: 0 })
  contactsUsed: number;

  // Campaign Usage
  @Column({ name: 'campaigns_limit', type: 'int', default: 0 })
  campaignsLimit: number;

  @Column({ name: 'campaigns_used', type: 'int', default: 0 })
  campaignsUsed: number;

  // Cost Tracking
  @Column({ name: 'sms_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  smsCost: number;

  @Column({ name: 'email_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  emailCost: number;

  @Column({ name: 'whatsapp_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  whatsappCost: number;

  @Column({ name: 'total_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  totalCost: number;

  // Reset tracking
  @Column({ name: 'last_reset_at', type: 'timestamp with time zone', nullable: true })
  lastResetAt: Date | null;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  // Notification tracking - prevent duplicate notifications
  @Column({ name: 'sms_80_notified', type: 'boolean', default: false })
  sms80Notified: boolean;

  @Column({ name: 'sms_100_notified', type: 'boolean', default: false })
  sms100Notified: boolean;

  @Column({ name: 'email_80_notified', type: 'boolean', default: false })
  email80Notified: boolean;

  @Column({ name: 'email_100_notified', type: 'boolean', default: false })
  email100Notified: boolean;

  @Column({ name: 'whatsapp_80_notified', type: 'boolean', default: false })
  whatsapp80Notified: boolean;

  @Column({ name: 'whatsapp_100_notified', type: 'boolean', default: false })
  whatsapp100Notified: boolean;
}
