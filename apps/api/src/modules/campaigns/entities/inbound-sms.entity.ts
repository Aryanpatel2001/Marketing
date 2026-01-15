import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Contact } from '@/modules/contacts/entities/contact.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CampaignMessage } from './campaign-message.entity';
import { Campaign } from './campaign.entity';

@Entity('inbound_sms')
@Index(['tenantId', 'receivedAt'])
@Index(['contactId'])
@Index(['campaignId'])
@Index(['fromNumber'])
export class InboundSms extends TenantSoftDeleteEntity {
  @Column({ name: 'from_number', type: 'varchar', length: 20 })
  fromNumber: string;

  @Column({ name: 'to_number', type: 'varchar', length: 20 })
  toNumber: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ name: 'campaign_message_id', type: 'uuid', nullable: true })
  campaignMessageId: string | null;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId: string | null;

  @Column({ name: 'received_at', type: 'timestamp with time zone' })
  receivedAt: Date;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign | null;

  @ManyToOne(() => CampaignMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_message_id' })
  campaignMessage: CampaignMessage | null;
}
