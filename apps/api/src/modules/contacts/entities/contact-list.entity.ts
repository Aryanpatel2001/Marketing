import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantSoftDeleteEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { User } from '@/modules/users/entities/user.entity';
import { ContactListMember } from './contact-list-member.entity';

export enum ListType {
  STATIC = 'static',
  DYNAMIC = 'dynamic',
}

@Entity('contact_lists')
@Index(['tenantId', 'name'])
export class ContactList extends TenantSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ListType,
    default: ListType.STATIC,
  })
  type: ListType;

  @Column({ name: 'filter_criteria', type: 'jsonb', nullable: true })
  filterCriteria: Record<string, unknown> | null;

  @Column({ name: 'contact_count', type: 'integer', default: 0 })
  contactCount: number;

  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @OneToMany(() => ContactListMember, (member) => member.contactList)
  members: ContactListMember[];
}
