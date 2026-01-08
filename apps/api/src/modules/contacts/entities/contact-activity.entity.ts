import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Contact } from './contact.entity';

export enum ActivityType {
  // Contact lifecycle
  CREATED = 'created',
  UPDATED = 'updated',
  IMPORTED = 'imported',
  MERGED = 'merged',

  // Email activities
  EMAIL_SENT = 'email_sent',
  EMAIL_DELIVERED = 'email_delivered',
  EMAIL_OPENED = 'email_opened',
  EMAIL_CLICKED = 'email_clicked',
  EMAIL_BOUNCED = 'email_bounced',
  EMAIL_COMPLAINED = 'email_complained',

  // SMS activities
  SMS_SENT = 'sms_sent',
  SMS_DELIVERED = 'sms_delivered',
  SMS_FAILED = 'sms_failed',

  // WhatsApp activities
  WHATSAPP_SENT = 'whatsapp_sent',
  WHATSAPP_DELIVERED = 'whatsapp_delivered',
  WHATSAPP_READ = 'whatsapp_read',
  WHATSAPP_FAILED = 'whatsapp_failed',

  // Subscription
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
  RESUBSCRIBED = 'resubscribed',

  // Lists
  ADDED_TO_LIST = 'added_to_list',
  REMOVED_FROM_LIST = 'removed_from_list',

  // Tags
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed',

  // Notes
  NOTE_ADDED = 'note_added',

  // Custom
  CUSTOM = 'custom',
}

@Entity('contact_activities')
@Index(['tenantId', 'contactId', 'createdAt'])
@Index(['tenantId', 'contactId', 'type'])
export class ContactActivity extends TenantBaseEntity {
  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  // For linking to related entities
  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null; // 'campaign', 'email', 'list', etc.

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  // User who performed the action (if applicable)
  @Column({ name: 'performed_by_id', type: 'uuid', nullable: true })
  performedById: string | null;

  // IP address for tracking (for subscriber actions)
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  // User agent for tracking
  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;
}
