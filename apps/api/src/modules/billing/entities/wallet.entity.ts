import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('wallets')
@Index(['tenantId'], { unique: true })
export class Wallet extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'reserved_credits', type: 'decimal', precision: 12, scale: 2, default: 0 })
  reservedCredits: number;

  @Column({ name: 'lifetime_credits', type: 'decimal', precision: 12, scale: 2, default: 0 })
  lifetimeCredits: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
