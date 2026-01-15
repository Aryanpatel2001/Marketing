import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CampaignMessage } from './campaign-message.entity';

export enum EventType {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  FAILED = 'failed',
  UNSUBSCRIBED = 'unsubscribed',
  COMPLAINED = 'complained',
  READ = 'read',
  REPLIED = 'replied',
}

@Entity('campaign_events')
@Index(['campaignId'])
@Index(['campaignMessageId'])
@Index(['tenantId', 'eventType', 'createdAt'])
@Index(['createdAt'])
export class CampaignEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_message_id', type: 'uuid', nullable: true })
  campaignMessageId: string | null;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: EventType,
  })
  eventType: EventType;

  // Click tracking
  @Column({ name: 'link_url', type: 'text', nullable: true })
  linkUrl: string | null;

  @Column({ name: 'link_id', type: 'varchar', length: 50, nullable: true })
  linkId: string | null;

  // Context
  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'device_type', type: 'varchar', length: 20, nullable: true })
  deviceType: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  browser: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  os: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  // WhatsApp-specific
  @Column({ name: 'reply_content', type: 'text', nullable: true })
  replyContent: string | null;

  // Metadata for additional info
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => CampaignMessage, (message) => message.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_message_id' })
  campaignMessage: CampaignMessage | null;
}
