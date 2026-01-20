import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyComplianceRemoveIndia1737400000000 implements MigrationInterface {
  name = 'SimplifyComplianceRemoveIndia1737400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ================================================
    // Add region and phone_number to tenants table
    // ================================================

    // Create region enum
    await queryRunner.query(`
      CREATE TYPE "tenant_region_enum" AS ENUM ('US', 'EU');
    `);

    // Add region column with default 'US'
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN "region" "tenant_region_enum" NOT NULL DEFAULT 'US';
    `);

    // Add phone_number column
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN "phone_number" character varying(50);
    `);

    // ================================================
    // Remove India columns from tenant_compliance_status
    // ================================================

    // Drop India-related columns
    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_dlt_status";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_entity_id";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_principal_entity_id";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_telemarketer_id";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_registered_at";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      DROP COLUMN IF EXISTS "india_last_checked_at";
    `);

    // ================================================
    // Drop dlt_templates table
    // ================================================

    // First drop the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "dlt_templates"
      DROP CONSTRAINT IF EXISTS "FK_dlt_templates_tenant";
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dlt_templates_template_id_unique";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dlt_templates_tenant_category";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dlt_templates_tenant_status";
    `);

    // Drop the table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "dlt_templates";
    `);

    // ================================================
    // Drop India-related enum types
    // ================================================

    await queryRunner.query(`
      DROP TYPE IF EXISTS "india_dlt_status_enum";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "dlt_template_status_enum";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "dlt_template_category_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ================================================
    // Recreate India-related enum types
    // ================================================

    await queryRunner.query(`
      CREATE TYPE "india_dlt_status_enum" AS ENUM (
        'not_registered', 'registered', 'suspended'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "dlt_template_category_enum" AS ENUM (
        'promotional', 'transactional', 'service_implicit', 'service_explicit'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "dlt_template_status_enum" AS ENUM (
        'pending', 'approved', 'rejected', 'expired'
      );
    `);

    // ================================================
    // Recreate dlt_templates table
    // ================================================

    await queryRunner.query(`
      CREATE TABLE "dlt_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "template_id" character varying(50) NOT NULL,
        "template_name" character varying(100) NOT NULL,
        "template_content" text NOT NULL,
        "category" "dlt_template_category_enum" NOT NULL DEFAULT 'transactional',
        "status" "dlt_template_status_enum" NOT NULL DEFAULT 'pending',
        "variable_count" integer NOT NULL DEFAULT 0,
        "twilio_content_sid" character varying(100),
        "sender_id" character varying(11),
        "entity_id" character varying(50),
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "rejection_reason" text,
        "usage_count" integer NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_dlt_templates" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_dlt_templates_tenant_status"
      ON "dlt_templates" ("tenant_id", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_dlt_templates_tenant_category"
      ON "dlt_templates" ("tenant_id", "category");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_dlt_templates_template_id_unique"
      ON "dlt_templates" ("template_id")
      WHERE "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "dlt_templates"
      ADD CONSTRAINT "FK_dlt_templates_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    // ================================================
    // Recreate India columns in tenant_compliance_status
    // ================================================

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_dlt_status" "india_dlt_status_enum" NOT NULL DEFAULT 'not_registered';
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_entity_id" character varying(50);
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_principal_entity_id" character varying(50);
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_telemarketer_id" character varying(50);
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_registered_at" TIMESTAMP WITH TIME ZONE;
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_compliance_status"
      ADD COLUMN "india_last_checked_at" TIMESTAMP WITH TIME ZONE;
    `);

    // ================================================
    // Remove region and phone_number from tenants
    // ================================================

    await queryRunner.query(`
      ALTER TABLE "tenants" DROP COLUMN "phone_number";
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants" DROP COLUMN "region";
    `);

    await queryRunner.query(`
      DROP TYPE "tenant_region_enum";
    `);
  }
}
