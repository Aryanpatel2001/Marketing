import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSmsComplianceTables1736900000000 implements MigrationInterface {
  name = 'CreateSmsComplianceTables1736900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ================================================
    // Create enum types for compliance status tracking
    // ================================================

    // US 10DLC Brand Status
    await queryRunner.query(`
      CREATE TYPE "us_10dlc_brand_status_enum" AS ENUM (
        'unregistered', 'pending', 'approved', 'failed', 'suspended'
      );
    `);

    // US 10DLC Campaign Status
    await queryRunner.query(`
      CREATE TYPE "us_10dlc_campaign_status_enum" AS ENUM (
        'unregistered', 'pending', 'verified', 'failed'
      );
    `);

    // India DLT Status
    await queryRunner.query(`
      CREATE TYPE "india_dlt_status_enum" AS ENUM (
        'not_registered', 'registered', 'suspended'
      );
    `);

    // DLT Template Category
    await queryRunner.query(`
      CREATE TYPE "dlt_template_category_enum" AS ENUM (
        'promotional', 'transactional', 'service_implicit', 'service_explicit'
      );
    `);

    // DLT Template Status
    await queryRunner.query(`
      CREATE TYPE "dlt_template_status_enum" AS ENUM (
        'pending', 'approved', 'rejected', 'expired'
      );
    `);

    // ================================================
    // Create tenant_compliance_status table
    // ================================================
    await queryRunner.query(`
      CREATE TABLE "tenant_compliance_status" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,

        -- US 10DLC Compliance (Twilio Trust Hub)
        "us_brand_status" "us_10dlc_brand_status_enum" NOT NULL DEFAULT 'unregistered',
        "us_brand_sid" character varying(100),
        "us_brand_name" character varying(255),
        "us_campaign_status" "us_10dlc_campaign_status_enum" NOT NULL DEFAULT 'unregistered',
        "us_campaign_sid" character varying(100),
        "us_messaging_service_sid" character varying(100),
        "us_registered_at" TIMESTAMP WITH TIME ZONE,
        "us_last_checked_at" TIMESTAMP WITH TIME ZONE,
        "us_rejection_reason" text,

        -- India DLT Compliance (TRAI)
        "india_dlt_status" "india_dlt_status_enum" NOT NULL DEFAULT 'not_registered',
        "india_entity_id" character varying(50),
        "india_principal_entity_id" character varying(50),
        "india_telemarketer_id" character varying(50),
        "india_registered_at" TIMESTAMP WITH TIME ZONE,
        "india_last_checked_at" TIMESTAMP WITH TIME ZONE,

        -- EU GDPR Compliance
        "eu_consent_tracking_enabled" boolean NOT NULL DEFAULT true,
        "eu_sender_id_registered" boolean NOT NULL DEFAULT false,
        "eu_sender_ids" jsonb,

        -- General Compliance Settings
        "compliance_mode" character varying(20) NOT NULL DEFAULT 'warn',
        "block_non_compliant" boolean NOT NULL DEFAULT false,
        "last_sync_at" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb,

        -- Timestamps
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT "PK_tenant_compliance_status" PRIMARY KEY ("id")
      );
    `);

    // Unique index on tenant_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_compliance_status_tenant"
      ON "tenant_compliance_status" ("tenant_id");
    `);

    // Foreign key to tenants
    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD CONSTRAINT "FK_tenant_compliance_status_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    // ================================================
    // Create dlt_templates table (India DLT Templates)
    // ================================================
    await queryRunner.query(`
      CREATE TABLE "dlt_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,

        -- Template identification
        "template_id" character varying(50) NOT NULL,
        "template_name" character varying(100) NOT NULL,
        "template_content" text NOT NULL,

        -- Template classification
        "category" "dlt_template_category_enum" NOT NULL DEFAULT 'transactional',
        "status" "dlt_template_status_enum" NOT NULL DEFAULT 'pending',
        "variable_count" integer NOT NULL DEFAULT 0,

        -- Provider references
        "twilio_content_sid" character varying(100),

        -- Template metadata
        "sender_id" character varying(11),
        "entity_id" character varying(50),

        -- Status tracking
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "rejection_reason" text,

        -- Usage tracking
        "usage_count" integer NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP WITH TIME ZONE,

        -- Additional metadata
        "metadata" jsonb,

        -- Timestamps
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,

        CONSTRAINT "PK_dlt_templates" PRIMARY KEY ("id")
      );
    `);

    // Index for tenant + status queries
    await queryRunner.query(`
      CREATE INDEX "IDX_dlt_templates_tenant_status"
      ON "dlt_templates" ("tenant_id", "status");
    `);

    // Index for tenant + category queries
    await queryRunner.query(`
      CREATE INDEX "IDX_dlt_templates_tenant_category"
      ON "dlt_templates" ("tenant_id", "category");
    `);

    // Unique index for template_id (only for non-deleted records)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_dlt_templates_template_id_unique"
      ON "dlt_templates" ("template_id")
      WHERE "deleted_at" IS NULL;
    `);

    // Foreign key to tenants
    await queryRunner.query(`
      ALTER TABLE "dlt_templates"
      ADD CONSTRAINT "FK_dlt_templates_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    // ================================================
    // Add dltTemplateId to campaign content (for SMS)
    // This is stored in the JSONB content column, no migration needed
    // ================================================
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop dlt_templates
    await queryRunner.query(`
      ALTER TABLE "dlt_templates" DROP CONSTRAINT "FK_dlt_templates_tenant";
    `);
    await queryRunner.query(`DROP INDEX "IDX_dlt_templates_template_id_unique";`);
    await queryRunner.query(`DROP INDEX "IDX_dlt_templates_tenant_category";`);
    await queryRunner.query(`DROP INDEX "IDX_dlt_templates_tenant_status";`);
    await queryRunner.query(`DROP TABLE "dlt_templates";`);

    // Drop tenant_compliance_status
    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status" DROP CONSTRAINT "FK_tenant_compliance_status_tenant";
    `);
    await queryRunner.query(`DROP INDEX "IDX_tenant_compliance_status_tenant";`);
    await queryRunner.query(`DROP TABLE "tenant_compliance_status";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "dlt_template_status_enum";`);
    await queryRunner.query(`DROP TYPE "dlt_template_category_enum";`);
    await queryRunner.query(`DROP TYPE "india_dlt_status_enum";`);
    await queryRunner.query(`DROP TYPE "us_10dlc_campaign_status_enum";`);
    await queryRunner.query(`DROP TYPE "us_10dlc_brand_status_enum";`);
  }
}
