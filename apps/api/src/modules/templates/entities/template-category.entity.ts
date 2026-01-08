import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';

@Entity('template_categories')
@Index(['tenantId', 'name'], { unique: true })
@Index(['tenantId', 'sortOrder'])
export class TemplateCategory extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 7, default: '#6366f1' })
  color: string;

  @Column({ type: 'varchar', length: 50, default: 'folder' })
  icon: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToMany('Template', 'category')
  templates: import('./template.entity').Template[];
}
