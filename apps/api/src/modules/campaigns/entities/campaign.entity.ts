import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Template } from '@/modules/templates/entities/template.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { CampaignMessage } from './campaign-message.entity';

export enum CampaignType {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PREPARING = 'preparing', // Pre-processing in progress
  READY = 'ready', // Prepared and waiting for release time
  SENDING = 'sending',
  PAUSED = 'paused',
  SENT = 'sent',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum AudienceType {
  ALL = 'all',
  LIST = 'list',
  SEGMENT = 'segment',
}

export interface EmailContent {
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  htmlContent: string;
  designJson?: Record<string, unknown>;
}

export interface SmsContent {
  message: string;
  senderId?: string;
}

export interface WhatsAppContent {
  templateName: string;
  templateId: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    content: string;
  };
  body: string;
  bodyParameters?: string[];
  footer?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE';
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
}

export type CampaignContent = EmailContent | SmsContent | WhatsAppContent;

@Entity('campaigns')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'type'])
@Index(['tenantId', 'createdAt'])
@Index(['scheduledAt'], { where: "status = 'scheduled'" })
export class Campaign extends TenantSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: CampaignType,
    default: CampaignType.EMAIL,
  })
  type: CampaignType;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ type: 'jsonb', default: {} })
  content: CampaignContent;

  @Column({
    name: 'audience_type',
    type: 'enum',
    enum: AudienceType,
    default: AudienceType.LIST,
  })
  audienceType: AudienceType;

  @Column({ name: 'contact_list_ids', type: 'uuid', array: true, default: '{}' })
  contactListIds: string[];

  @Column({ name: 'segment_criteria', type: 'jsonb', nullable: true })
  segmentCriteria: Record<string, unknown> | null;

  @Column({ name: 'send_immediately', type: 'boolean', default: true })
  sendImmediately: boolean;

  @Column({ name: 'scheduled_at', type: 'timestamp with time zone', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  // Execution timestamps
  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'paused_at', type: 'timestamp with time zone', nullable: true })
  pausedAt: Date | null;

  // Stats (denormalized for quick access)
  @Column({ name: 'total_recipients', type: 'integer', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount: number;

  @Column({ name: 'delivered_count', type: 'integer', default: 0 })
  deliveredCount: number;

  @Column({ name: 'failed_count', type: 'integer', default: 0 })
  failedCount: number;

  // Email-specific stats
  @Column({ name: 'opened_count', type: 'integer', default: 0 })
  openedCount: number;

  @Column({ name: 'unique_opens', type: 'integer', default: 0 })
  uniqueOpens: number;

  @Column({ name: 'clicked_count', type: 'integer', default: 0 })
  clickedCount: number;

  @Column({ name: 'unique_clicks', type: 'integer', default: 0 })
  uniqueClicks: number;

  @Column({ name: 'bounced_count', type: 'integer', default: 0 })
  bouncedCount: number;

  @Column({ name: 'unsubscribed_count', type: 'integer', default: 0 })
  unsubscribedCount: number;

  @Column({ name: 'complained_count', type: 'integer', default: 0 })
  complainedCount: number;

  // WhatsApp-specific stats
  @Column({ name: 'read_count', type: 'integer', default: 0 })
  readCount: number;

  @Column({ name: 'replied_count', type: 'integer', default: 0 })
  repliedCount: number;

  // Billing fields
  @Column({ name: 'reserve_transaction_id', type: 'uuid', nullable: true })
  reserveTransactionId: string | null;

  @Column({ name: 'estimated_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  estimatedCost: number;

  @Column({ name: 'actual_cost', type: 'decimal', precision: 10, scale: 4, default: 0 })
  actualCost: number;

  // ============================================
  // Compliance Fields
  // ============================================

  /**
   * US 10DLC TCR Campaign ID (for campaigns targeting US)
   */
  @Column({ name: 'tcr_campaign_id', type: 'varchar', length: 100, nullable: true })
  tcrCampaignId: string | null;

  /**
   * Compliance approval status for the tenant's region
   * Stored after pre-send compliance validation
   */
  @Column({ name: 'compliance_approval', type: 'jsonb', nullable: true })
  complianceApproval: {
    approved: boolean;
    checkedAt: string;
    errors?: string[];
    warnings?: string[];
  } | null;

  /**
   * Whether compliance was validated before sending
   */
  @Column({ name: 'compliance_validated', type: 'boolean', default: false })
  complianceValidated: boolean;

  // Additional metadata (compliance checks, A/B testing info, etc.)
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Created by
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Template, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template: Template | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @OneToMany(() => CampaignMessage, (message) => message.campaign)
  messages: CampaignMessage[];

  // Helper methods
  get deliveryRate(): number {
    if (this.sentCount === 0) return 0;
    return Math.round((this.deliveredCount / this.sentCount) * 100 * 10) / 10;
  }

  get openRate(): number {
    if (this.deliveredCount === 0) return 0;
    return Math.round((this.uniqueOpens / this.deliveredCount) * 100 * 10) / 10;
  }

  get clickRate(): number {
    if (this.deliveredCount === 0) return 0;
    return Math.round((this.uniqueClicks / this.deliveredCount) * 100 * 10) / 10;
  }

  get progress(): number {
    if (this.totalRecipients === 0) return 0;
    return Math.round(((this.sentCount + this.failedCount) / this.totalRecipients) * 100);
  }

  get isComplete(): boolean {
    return (
      this.status === CampaignStatus.SENT ||
      this.status === CampaignStatus.CANCELLED ||
      this.status === CampaignStatus.FAILED
    );
  }
}
