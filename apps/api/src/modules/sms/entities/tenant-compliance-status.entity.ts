import { TenantBaseEntity } from '@/common/entities/base.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

/**
 * Supported SMS compliance regions
 */
export enum ComplianceRegion {
  US = 'US', // United States - 10DLC/TCR
  EU = 'EU', // European Union - GDPR
  OTHER = 'OTHER', // Rest of world
}

/**
 * Compliance registration status
 */
export enum ComplianceStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

/**
 * US 10DLC brand status (from Twilio Trust Hub)
 */
export enum US10DLCBrandStatus {
  UNREGISTERED = 'unregistered',
  PENDING = 'pending',
  APPROVED = 'approved',
  FAILED = 'failed',
  SUSPENDED = 'suspended',
}

/**
 * US 10DLC campaign status
 */
export enum US10DLCCampaignStatus {
  UNREGISTERED = 'unregistered',
  PENDING = 'pending',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

/**
 * Stores compliance status per tenant for different regions.
 * This entity tracks the overall compliance posture for SMS sending.
 */
@Entity('tenant_compliance_status')
@Index(['tenantId'], { unique: true })
export class TenantComplianceStatus extends TenantBaseEntity {
  // ============================================
  // US 10DLC Compliance (Twilio Trust Hub)
  // ============================================

  @Column({
    name: 'us_brand_status',
    type: 'varchar',
    length: 20,
    default: US10DLCBrandStatus.UNREGISTERED,
  })
  usBrandStatus: US10DLCBrandStatus;

  @Column({ name: 'us_brand_sid', type: 'varchar', length: 100, nullable: true })
  usBrandSid: string | null;

  @Column({ name: 'us_brand_name', type: 'varchar', length: 255, nullable: true })
  usBrandName: string | null;

  @Column({
    name: 'us_campaign_status',
    type: 'varchar',
    length: 20,
    default: US10DLCCampaignStatus.UNREGISTERED,
  })
  usCampaignStatus: US10DLCCampaignStatus;

  @Column({ name: 'us_campaign_sid', type: 'varchar', length: 100, nullable: true })
  usCampaignSid: string | null;

  @Column({ name: 'us_messaging_service_sid', type: 'varchar', length: 100, nullable: true })
  usMessagingServiceSid: string | null;

  @Column({ name: 'us_registered_at', type: 'timestamp with time zone', nullable: true })
  usRegisteredAt: Date | null;

  @Column({ name: 'us_last_checked_at', type: 'timestamp with time zone', nullable: true })
  usLastCheckedAt: Date | null;

  @Column({ name: 'us_rejection_reason', type: 'text', nullable: true })
  usRejectionReason: string | null;

  // ============================================
  // EU GDPR Compliance
  // ============================================

  @Column({ name: 'eu_consent_tracking_enabled', type: 'boolean', default: true })
  euConsentTrackingEnabled: boolean;

  @Column({ name: 'eu_sender_id_registered', type: 'boolean', default: false })
  euSenderIdRegistered: boolean;

  @Column({ name: 'eu_sender_ids', type: 'jsonb', nullable: true })
  euSenderIds: Record<string, string> | null; // { "GB": "BRAND", "FR": "BRAND" }

  // ============================================
  // General Compliance Settings
  // ============================================

  @Column({ name: 'compliance_mode', type: 'varchar', length: 20, default: 'warn' })
  complianceMode: 'strict' | 'warn' | 'off';

  @Column({ name: 'block_non_compliant', type: 'boolean', default: false })
  blockNonCompliant: boolean;

  @Column({ name: 'last_sync_at', type: 'timestamp with time zone', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // ============================================
  // Relations
  // ============================================

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Check if US 10DLC is fully compliant (can send to US)
   */
  get isUSCompliant(): boolean {
    return (
      this.usBrandStatus === US10DLCBrandStatus.APPROVED &&
      this.usCampaignStatus === US10DLCCampaignStatus.VERIFIED
    );
  }

  /**
   * Check if EU consent tracking is enabled
   */
  get isEUCompliant(): boolean {
    return this.euConsentTrackingEnabled;
  }

  /**
   * Get overall compliance status for a region
   */
  getRegionStatus(region: ComplianceRegion): ComplianceStatus {
    switch (region) {
      case ComplianceRegion.US:
        if (
          this.usBrandStatus === US10DLCBrandStatus.APPROVED &&
          this.usCampaignStatus === US10DLCCampaignStatus.VERIFIED
        ) {
          return ComplianceStatus.APPROVED;
        }
        if (
          this.usBrandStatus === US10DLCBrandStatus.PENDING ||
          this.usCampaignStatus === US10DLCCampaignStatus.PENDING
        ) {
          return ComplianceStatus.PENDING_REVIEW;
        }
        if (
          this.usBrandStatus === US10DLCBrandStatus.FAILED ||
          this.usCampaignStatus === US10DLCCampaignStatus.FAILED
        ) {
          return ComplianceStatus.REJECTED;
        }
        return ComplianceStatus.NOT_STARTED;

      case ComplianceRegion.EU:
        return this.euConsentTrackingEnabled
          ? ComplianceStatus.APPROVED
          : ComplianceStatus.NOT_STARTED;

      default:
        return ComplianceStatus.APPROVED; // OTHER regions don't require registration
    }
  }
}
