import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { User } from '@/modules/users/entities/user.entity';

export enum ImportJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum DuplicateHandling {
  SKIP = 'skip',
  UPDATE = 'update',
  CREATE_NEW = 'create_new',
}

@Entity('import_jobs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
export class ImportJob extends TenantBaseEntity {
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize: number;

  @Column({ name: 'total_rows', type: 'integer', default: 0 })
  totalRows: number;

  @Column({ name: 'processed_rows', type: 'integer', default: 0 })
  processedRows: number;

  @Column({ name: 'created_count', type: 'integer', default: 0 })
  createdCount: number;

  @Column({ name: 'updated_count', type: 'integer', default: 0 })
  updatedCount: number;

  @Column({ name: 'skipped_count', type: 'integer', default: 0 })
  skippedCount: number;

  @Column({ name: 'error_count', type: 'integer', default: 0 })
  errorCount: number;

  @Column({
    type: 'enum',
    enum: ImportJobStatus,
    default: ImportJobStatus.PENDING,
  })
  status: ImportJobStatus;

  @Column({
    name: 'duplicate_handling',
    type: 'enum',
    enum: DuplicateHandling,
    default: DuplicateHandling.SKIP,
  })
  duplicateHandling: DuplicateHandling;

  @Column({ name: 'duplicate_check_field', type: 'varchar', length: 50, default: 'email' })
  duplicateCheckField: string;

  @Column({ name: 'field_mapping', type: 'jsonb', default: {} })
  fieldMapping: Record<string, string>;

  @Column({ name: 'errors', type: 'jsonb', default: [] })
  errors: Array<{ row: number; message: string }>;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  // Computed properties
  get progress(): number {
    if (this.totalRows === 0) return 0;
    return Math.round((this.processedRows / this.totalRows) * 100);
  }

  get duration(): number | null {
    if (!this.startedAt) return null;
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }
}
