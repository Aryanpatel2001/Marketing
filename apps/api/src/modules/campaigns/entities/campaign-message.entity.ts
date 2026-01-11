import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Contact } from '@/modules/contacts/entities/contact.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { CampaignEvent } from './campaign-event.entity';
import { Campaign } from './campaign.entity';

export enum MessageStatus {
  PREPARED = 'prepared',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  FAILED = 'failed',
  UNSUBSCRIBED = 'unsubscribed',
  COMPLAINED = 'complained',
  READ = 'read',
}

@Entity('campaign_messages')
@Index(['campaignId'])
@Index(['contactId'])
@Index(['externalId'])
@Index(['tenantId', 'status'])
export class CampaignMessage extends TenantBaseEntity {
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  // Recipient info (denormalized)
  @Column({ name: 'recipient_email', type: 'varchar', length: 255, nullable: true })
  recipientEmail: string | null;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 50, nullable: true })
  recipientPhone: string | null;

  @Column({ name: 'recipient_name', type: 'varchar', length: 200, nullable: true })
  recipientName: string | null;

  // Provider tracking
  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId: string | null;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.QUEUED,
  })
  status: MessageStatus;

  // Timestamps
  @Column({ name: 'queued_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  queuedAt: Date;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp with time zone', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'opened_at', type: 'timestamp with time zone', nullable: true })
  openedAt: Date | null;

  @Column({ name: 'clicked_at', type: 'timestamp with time zone', nullable: true })
  clickedAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamp with time zone', nullable: true })
  failedAt: Date | null;

  // Error tracking
  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  // Rendered content (after variable replacement)
  @Column({ name: 'rendered_content', type: 'jsonb', nullable: true })
  renderedContent: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => Campaign, (campaign) => campaign.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @OneToMany(() => CampaignEvent, (event) => event.campaignMessage)
  events: CampaignEvent[];

  // Helper methods
  get isDelivered(): boolean {
    return [
      MessageStatus.DELIVERED,
      MessageStatus.OPENED,
      MessageStatus.CLICKED,
      MessageStatus.READ,
    ].includes(this.status);
  }

  get isFailed(): boolean {
    return [MessageStatus.FAILED, MessageStatus.BOUNCED].includes(this.status);
  }
}
