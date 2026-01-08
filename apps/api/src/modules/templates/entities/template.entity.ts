import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { TemplateCategory } from './template-category.entity';

export enum TemplateType {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum TemplateStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('templates')
@Index(['tenantId', 'type'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'categoryId'])
@Index(['tenantId', 'name'])
@Index(['tenantId', 'createdAt'])
export class Template extends TenantSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: TemplateType,
    default: TemplateType.EMAIL,
  })
  type: TemplateType;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'design_json', type: 'jsonb', nullable: true })
  designJson: Record<string, unknown> | null;

  @Column({ name: 'plain_text', type: 'text', nullable: true })
  plainText: string | null;

  @Column({ type: 'jsonb', default: [] })
  variables: string[];

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl: string | null;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.DRAFT,
  })
  status: TemplateStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // Metadata for templates
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => TemplateCategory, (category) => category.templates, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: TemplateCategory | null;

  // Helper to check if template has content
  get hasContent(): boolean {
    return Boolean(this.content || this.designJson);
  }
}
