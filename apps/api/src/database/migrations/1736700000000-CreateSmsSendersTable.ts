import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSmsSendersTable1736700000000 implements MigrationInterface {
  name = 'CreateSmsSendersTable1736700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "sms_sender_type_enum" AS ENUM ('dedicated_number', 'toll_free', 'sender_id');
    `);

    await queryRunner.query(`
      CREATE TYPE "sms_sender_status_enum" AS ENUM ('pending', 'active', 'suspended', 'failed', 'released');
    `);

    // Create sms_senders table
    await queryRunner.query(`
      CREATE TABLE "sms_senders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "type" "sms_sender_type_enum" NOT NULL,
        "phone_number" character varying(20),
        "twilio_sid" character varying(100),
        "country_code" character varying(5),
        "sender_id" character varying(11),
        "sender_id_countries" jsonb,
        "friendly_name" character varying(100) NOT NULL,
        "status" "sms_sender_status_enum" NOT NULL DEFAULT 'pending',
        "monthly_price" numeric(10,2),
        "is_default" boolean NOT NULL DEFAULT false,
        "messages_sent" integer NOT NULL DEFAULT 0,
        "delivery_rate" numeric(5,2) NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "capabilities" jsonb NOT NULL DEFAULT '{"sms": true, "voice": false, "mms": false}',
        "purchased_at" TIMESTAMP WITH TIME ZONE,
        "renews_at" TIMESTAMP WITH TIME ZONE,
        "admin_notes" text,
        "rejection_reason" text,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sms_senders" PRIMARY KEY ("id")
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_sms_senders_tenant_status" ON "sms_senders" ("tenant_id", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sms_senders_tenant_type_status" ON "sms_senders" ("tenant_id", "type", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sms_senders_tenant_default" ON "sms_senders" ("tenant_id", "is_default");
    `);

    // Unique index for phone number (only for non-deleted records)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_sms_senders_phone_number_unique" ON "sms_senders" ("phone_number")
      WHERE "deleted_at" IS NULL AND "phone_number" IS NOT NULL;
    `);

    // Foreign key to tenants
    await queryRunner.query(`
      ALTER TABLE "sms_senders"
      ADD CONSTRAINT "FK_sms_senders_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.query(`
      ALTER TABLE "sms_senders" DROP CONSTRAINT "FK_sms_senders_tenant";
    `);

    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_sms_senders_phone_number_unique";`);
    await queryRunner.query(`DROP INDEX "IDX_sms_senders_tenant_default";`);
    await queryRunner.query(`DROP INDEX "IDX_sms_senders_tenant_type_status";`);
    await queryRunner.query(`DROP INDEX "IDX_sms_senders_tenant_status";`);

    // Drop table
    await queryRunner.query(`DROP TABLE "sms_senders";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "sms_sender_status_enum";`);
    await queryRunner.query(`DROP TYPE "sms_sender_type_enum";`);
  }
}
