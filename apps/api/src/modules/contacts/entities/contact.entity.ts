import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { ContactListMember } from './contact-list-member.entity';

export enum ContactStatus {
  ACTIVE = 'active',
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
}

export enum ContactSource {
  MANUAL = 'manual',
  IMPORT = 'import',
  API = 'api',
  FORM = 'form',
}

export enum ChannelStatus {
  ACTIVE = 'active',
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
}

@Entity('contacts')
@Index(['tenantId', 'email'])
@Index(['tenantId', 'phone'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'source'])
@Index(['tenantId', 'engagementScore'])
@Index(['tenantId', 'lastActivityAt'])
@Index('idx_contacts_tenant_name', ['tenantId', 'firstName', 'lastName'])
@Index('idx_contacts_tenant_company', ['tenantId', 'company'])
export class Contact extends TenantSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 50, nullable: true })
  whatsappNumber: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ name: 'custom_fields', type: 'jsonb', default: {} })
  customFields: Record<string, unknown>;

  @Column({ type: 'text', array: true, default: '{}' })
  @Index({ where: 'tags IS NOT NULL' })
  tags: string[];

  @Column({
    type: 'enum',
    enum: ContactSource,
    default: ContactSource.MANUAL,
  })
  source: ContactSource;

  @Column({
    type: 'enum',
    enum: ContactStatus,
    default: ContactStatus.ACTIVE,
  })
  status: ContactStatus;

  @Column({
    name: 'email_status',
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.ACTIVE,
  })
  emailStatus: ChannelStatus;

  @Column({
    name: 'sms_status',
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.ACTIVE,
  })
  smsStatus: ChannelStatus;

  @Column({
    name: 'whatsapp_status',
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.ACTIVE,
  })
  whatsappStatus: ChannelStatus;

  @Column({ name: 'engagement_score', type: 'integer', default: 0 })
  engagementScore: number;

  @Column({ name: 'last_activity_at', type: 'timestamp with time zone', nullable: true })
  lastActivityAt: Date | null;

  @Column({ name: 'last_email_sent_at', type: 'timestamp with time zone', nullable: true })
  lastEmailSentAt: Date | null;

  @Column({ name: 'last_email_opened_at', type: 'timestamp with time zone', nullable: true })
  lastEmailOpenedAt: Date | null;

  @Column({ name: 'last_email_clicked_at', type: 'timestamp with time zone', nullable: true })
  lastEmailClickedAt: Date | null;

  @Column({ name: 'total_emails_sent', type: 'integer', default: 0 })
  totalEmailsSent: number;

  @Column({ name: 'total_emails_opened', type: 'integer', default: 0 })
  totalEmailsOpened: number;

  @Column({ name: 'total_emails_clicked', type: 'integer', default: 0 })
  totalEmailsClicked: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToMany(() => ContactListMember, (member) => member.contact)
  listMemberships: ContactListMember[];

  // Virtual field for full name
  get fullName(): string {
    const parts = [this.firstName, this.lastName].filter(Boolean);
    return parts.join(' ') || this.email || 'Unknown';
  }
}
