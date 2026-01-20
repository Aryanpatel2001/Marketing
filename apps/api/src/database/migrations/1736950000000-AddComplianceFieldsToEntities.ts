import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComplianceFieldsToEntities1736950000000 implements MigrationInterface {
  name = 'AddComplianceFieldsToEntities1736950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Add compliance fields to campaigns table
    // ============================================
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ADD COLUMN IF NOT EXISTS "target_regions" text,
      ADD COLUMN IF NOT EXISTS "tcr_campaign_id" varchar(100),
      ADD COLUMN IF NOT EXISTS "dlt_template_id" uuid,
      ADD COLUMN IF NOT EXISTS "compliance_approvals" jsonb,
      ADD COLUMN IF NOT EXISTS "compliance_validated" boolean DEFAULT false
    `);

    // Add index for campaigns by target regions (btree index for text column)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_campaigns_target_regions"
      ON "campaigns" ("target_regions")
      WHERE "target_regions" IS NOT NULL
    `);

    // Add index for campaigns by DLT template
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_campaigns_dlt_template_id"
      ON "campaigns" ("dlt_template_id")
      WHERE "dlt_template_id" IS NOT NULL
    `);

    // ============================================
    // Add compliance fields to sms_senders table
    // ============================================
    await queryRunner.query(`
      ALTER TABLE "sms_senders"
      ADD COLUMN IF NOT EXISTS "registered_regions" text,
      ADD COLUMN IF NOT EXISTS "compliance_metadata" jsonb,
      ADD COLUMN IF NOT EXISTS "compliance_verified" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "compliance_verified_at" timestamp with time zone
    `);

    // Add index for senders by registered regions (btree index for text column)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sms_senders_registered_regions"
      ON "sms_senders" ("registered_regions")
      WHERE "registered_regions" IS NOT NULL
    `);

    // Add index for compliance verified senders
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sms_senders_compliance_verified"
      ON "sms_senders" ("tenant_id", "compliance_verified")
      WHERE "compliance_verified" = true
    `);

    // ============================================
    // Add additional helper indexes for compliance queries
    // ============================================

    // Index for finding compliant campaigns by tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_campaigns_compliance_validated"
      ON "campaigns" ("tenant_id", "compliance_validated")
      WHERE "compliance_validated" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_campaigns_compliance_validated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sms_senders_compliance_verified"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sms_senders_registered_regions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_campaigns_dlt_template_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_campaigns_target_regions"`);

    // Remove columns from sms_senders
    await queryRunner.query(`
      ALTER TABLE "sms_senders"
      DROP COLUMN IF EXISTS "compliance_verified_at",
      DROP COLUMN IF EXISTS "compliance_verified",
      DROP COLUMN IF EXISTS "compliance_metadata",
      DROP COLUMN IF EXISTS "registered_regions"
    `);

    // Remove columns from campaigns
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      DROP COLUMN IF EXISTS "compliance_validated",
      DROP COLUMN IF EXISTS "compliance_approvals",
      DROP COLUMN IF EXISTS "dlt_template_id",
      DROP COLUMN IF EXISTS "tcr_campaign_id",
      DROP COLUMN IF EXISTS "target_regions"
    `);
  }
}
