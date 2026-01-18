import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingTables1736800000000 implements MigrationInterface {
  name = 'CreateBillingTables1736800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==================== ENUM TYPES ====================

    await queryRunner.query(`
      CREATE TYPE "plan_interval_enum" AS ENUM ('monthly', 'yearly');
    `);

    await queryRunner.query(`
      CREATE TYPE "plan_tier_enum" AS ENUM ('free', 'starter', 'growth', 'pro', 'enterprise');
    `);

    await queryRunner.query(`
      CREATE TYPE "subscription_status_enum" AS ENUM (
        'active', 'trialing', 'past_due', 'cancelled', 'unpaid',
        'incomplete', 'incomplete_expired', 'paused'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "wallet_currency_enum" AS ENUM ('USD', 'EUR', 'GBP', 'INR');
    `);

    await queryRunner.query(`
      CREATE TYPE "transaction_type_enum" AS ENUM ('credit', 'debit', 'refund', 'reserve', 'release');
    `);

    await queryRunner.query(`
      CREATE TYPE "transaction_status_enum" AS ENUM ('pending', 'completed', 'failed', 'reversed');
    `);

    await queryRunner.query(`
      CREATE TYPE "transaction_channel_enum" AS ENUM ('sms', 'email', 'whatsapp', 'platform');
    `);

    await queryRunner.query(`
      CREATE TYPE "transaction_reference_type_enum" AS ENUM (
        'top_up', 'campaign', 'message', 'subscription', 'refund',
        'adjustment', 'auto_recharge', 'promo_credit'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "invoice_status_enum" AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');
    `);

    await queryRunner.query(`
      CREATE TYPE "invoice_type_enum" AS ENUM ('subscription', 'one_time', 'overage');
    `);

    // ==================== SUBSCRIPTION PLANS TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "subscription_plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "tier" "plan_tier_enum" NOT NULL,
        "description" text,
        "price" numeric(10,2) NOT NULL DEFAULT 0,
        "interval" "plan_interval_enum" NOT NULL DEFAULT 'monthly',
        "stripe_product_id" character varying(100),
        "stripe_price_id" character varying(100),
        "sms_quota" integer NOT NULL DEFAULT 0,
        "email_quota" integer NOT NULL DEFAULT 0,
        "whatsapp_quota" integer NOT NULL DEFAULT 0,
        "max_contacts" integer NOT NULL DEFAULT 100,
        "max_senders" integer NOT NULL DEFAULT 1,
        "max_users" integer NOT NULL DEFAULT 1,
        "max_campaigns_per_month" integer NOT NULL DEFAULT 10,
        "features" jsonb NOT NULL DEFAULT '{}',
        "trial_days" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscription_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_plans_tier" UNIQUE ("tier")
      );
    `);

    // ==================== TENANT SUBSCRIPTIONS TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "tenant_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "status" "subscription_status_enum" NOT NULL DEFAULT 'incomplete',
        "stripe_customer_id" character varying(100),
        "stripe_subscription_id" character varying(100),
        "stripe_payment_method_id" character varying(100),
        "current_period_start" TIMESTAMP WITH TIME ZONE,
        "current_period_end" TIMESTAMP WITH TIME ZONE,
        "trial_start" TIMESTAMP WITH TIME ZONE,
        "trial_end" TIMESTAMP WITH TIME ZONE,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "cancellation_reason" text,
        "last_payment_date" TIMESTAMP WITH TIME ZONE,
        "last_payment_amount" numeric(10,2),
        "next_billing_date" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_subscriptions_stripe_id" UNIQUE ("stripe_subscription_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_subscriptions_tenant_status" ON "tenant_subscriptions" ("tenant_id", "status");
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD CONSTRAINT "FK_tenant_subscriptions_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD CONSTRAINT "FK_tenant_subscriptions_plan"
      FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT;
    `);

    // ==================== USAGE QUOTAS TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "usage_quotas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "period_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sms_limit" integer NOT NULL DEFAULT 0,
        "sms_used" integer NOT NULL DEFAULT 0,
        "sms_overage" integer NOT NULL DEFAULT 0,
        "email_limit" integer NOT NULL DEFAULT 0,
        "email_used" integer NOT NULL DEFAULT 0,
        "email_overage" integer NOT NULL DEFAULT 0,
        "whatsapp_limit" integer NOT NULL DEFAULT 0,
        "whatsapp_used" integer NOT NULL DEFAULT 0,
        "whatsapp_overage" integer NOT NULL DEFAULT 0,
        "contacts_limit" integer NOT NULL DEFAULT 0,
        "contacts_used" integer NOT NULL DEFAULT 0,
        "campaigns_limit" integer NOT NULL DEFAULT 0,
        "campaigns_used" integer NOT NULL DEFAULT 0,
        "sms_cost" numeric(10,4) NOT NULL DEFAULT 0,
        "email_cost" numeric(10,4) NOT NULL DEFAULT 0,
        "whatsapp_cost" numeric(10,4) NOT NULL DEFAULT 0,
        "total_cost" numeric(10,4) NOT NULL DEFAULT 0,
        "last_reset_at" TIMESTAMP WITH TIME ZONE,
        "is_current" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usage_quotas" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_usage_quotas_tenant_period" ON "usage_quotas" ("tenant_id", "period_start", "period_end");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_usage_quotas_tenant_current" ON "usage_quotas" ("tenant_id", "is_current") WHERE "is_current" = true;
    `);

    await queryRunner.query(`
      ALTER TABLE "usage_quotas"
      ADD CONSTRAINT "FK_usage_quotas_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    // ==================== WALLETS TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "balance" numeric(12,4) NOT NULL DEFAULT 0,
        "reserved_balance" numeric(12,4) NOT NULL DEFAULT 0,
        "currency" "wallet_currency_enum" NOT NULL DEFAULT 'USD',
        "low_balance_threshold" numeric(10,2) NOT NULL DEFAULT 10,
        "low_balance_alert_sent" boolean NOT NULL DEFAULT false,
        "low_balance_alert_sent_at" TIMESTAMP WITH TIME ZONE,
        "auto_recharge_enabled" boolean NOT NULL DEFAULT false,
        "auto_recharge_amount" numeric(10,2) NOT NULL DEFAULT 50,
        "auto_recharge_threshold" numeric(10,2) NOT NULL DEFAULT 10,
        "total_credited" numeric(12,4) NOT NULL DEFAULT 0,
        "total_debited" numeric(12,4) NOT NULL DEFAULT 0,
        "last_topped_up_at" TIMESTAMP WITH TIME ZONE,
        "last_debited_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_tenant" UNIQUE ("tenant_id")
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets"
      ADD CONSTRAINT "FK_wallets_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    // ==================== WALLET TRANSACTIONS TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "wallet_id" uuid NOT NULL,
        "type" "transaction_type_enum" NOT NULL,
        "status" "transaction_status_enum" NOT NULL DEFAULT 'completed',
        "amount" numeric(12,4) NOT NULL,
        "balance_before" numeric(12,4) NOT NULL,
        "balance_after" numeric(12,4) NOT NULL,
        "description" text,
        "channel" "transaction_channel_enum",
        "reference_type" "transaction_reference_type_enum",
        "reference_id" uuid,
        "stripe_payment_intent_id" character varying(100),
        "stripe_charge_id" character varying(100),
        "message_count" integer,
        "unit_price" numeric(10,6),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "ip_address" character varying(45),
        "user_agent" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_tenant_created" ON "wallet_transactions" ("tenant_id", "created_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_wallet_type" ON "wallet_transactions" ("wallet_id", "type");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_reference" ON "wallet_transactions" ("reference_type", "reference_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_stripe" ON "wallet_transactions" ("stripe_payment_intent_id");
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "FK_wallet_transactions_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "FK_wallet_transactions_wallet"
      FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;
    `);

    // ==================== INVOICES TABLE ====================

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "invoice_number" character varying(50) NOT NULL,
        "type" "invoice_type_enum" NOT NULL DEFAULT 'subscription',
        "status" "invoice_status_enum" NOT NULL DEFAULT 'draft',
        "stripe_invoice_id" character varying(100),
        "stripe_payment_intent_id" character varying(100),
        "stripe_hosted_invoice_url" text,
        "stripe_invoice_pdf" text,
        "period_start" TIMESTAMP WITH TIME ZONE,
        "period_end" TIMESTAMP WITH TIME ZONE,
        "subtotal" numeric(10,2) NOT NULL DEFAULT 0,
        "tax" numeric(10,2) NOT NULL DEFAULT 0,
        "tax_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "discount" numeric(10,2) NOT NULL DEFAULT 0,
        "total" numeric(10,2) NOT NULL DEFAULT 0,
        "amount_paid" numeric(10,2) NOT NULL DEFAULT 0,
        "amount_due" numeric(10,2) NOT NULL DEFAULT 0,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "line_items" jsonb NOT NULL DEFAULT '[]',
        "issued_at" TIMESTAMP WITH TIME ZONE,
        "due_date" TIMESTAMP WITH TIME ZONE,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "voided_at" TIMESTAMP WITH TIME ZONE,
        "customer_email" character varying(255),
        "customer_name" character varying(255),
        "billing_address" jsonb,
        "notes" text,
        "footer" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invoices_number" UNIQUE ("invoice_number"),
        CONSTRAINT "UQ_invoices_stripe_id" UNIQUE ("stripe_invoice_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_tenant_status" ON "invoices" ("tenant_id", "status");
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "FK_invoices_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    // ==================== ADD STRIPE CUSTOMER ID TO TENANTS ====================

    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "stripe_customer_id" character varying(100);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenants_stripe_customer" ON "tenants" ("stripe_customer_id");
    `);

    // ==================== SEED DEFAULT SUBSCRIPTION PLANS ====================

    await queryRunner.query(`
      INSERT INTO "subscription_plans"
        ("name", "tier", "description", "price", "interval", "sms_quota", "email_quota", "whatsapp_quota",
         "max_contacts", "max_senders", "max_users", "max_campaigns_per_month", "trial_days", "features", "sort_order")
      VALUES
        ('Free', 'free', 'Get started with basic features', 0, 'monthly', 100, 500, 50,
         500, 1, 1, 5, 0,
         '{"apiAccess": false, "customDomain": false, "prioritySupport": false, "advancedAnalytics": false, "webhooks": false, "automations": false, "abTesting": false, "dedicatedIp": false, "whiteLabel": false}',
         0),
        ('Starter', 'starter', 'Perfect for small businesses', 29, 'monthly', 1000, 10000, 500,
         2500, 3, 3, 20, 14,
         '{"apiAccess": true, "customDomain": false, "prioritySupport": false, "advancedAnalytics": false, "webhooks": true, "automations": false, "abTesting": false, "dedicatedIp": false, "whiteLabel": false}',
         1),
        ('Growth', 'growth', 'Scale your marketing efforts', 99, 'monthly', 5000, 50000, 2500,
         10000, 10, 10, 50, 14,
         '{"apiAccess": true, "customDomain": true, "prioritySupport": false, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": false, "whiteLabel": false}',
         2),
        ('Pro', 'pro', 'For high-volume senders', 299, 'monthly', 20000, 200000, 10000,
         50000, -1, -1, -1, 14,
         '{"apiAccess": true, "customDomain": true, "prioritySupport": true, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": true, "whiteLabel": true}',
         3),
        ('Enterprise', 'enterprise', 'Custom solutions for large organizations', 0, 'monthly', -1, -1, -1,
         -1, -1, -1, -1, 30,
         '{"apiAccess": true, "customDomain": true, "prioritySupport": true, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": true, "whiteLabel": true}',
         4)
      ON CONFLICT ("tier") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "FK_invoices_tenant";`
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_wallet_transactions_wallet";`
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_wallet_transactions_tenant";`
    );
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_tenant";`);
    await queryRunner.query(
      `ALTER TABLE "usage_quotas" DROP CONSTRAINT IF EXISTS "FK_usage_quotas_tenant";`
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP CONSTRAINT IF EXISTS "FK_tenant_subscriptions_plan";`
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP CONSTRAINT IF EXISTS "FK_tenant_subscriptions_tenant";`
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_stripe_customer";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_tenant_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_stripe";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_reference";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_wallet_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_tenant_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_usage_quotas_tenant_current";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_usage_quotas_tenant_period";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_subscriptions_tenant_status";`);

    // Remove stripe_customer_id from tenants
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_customer_id";`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usage_quotas";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_subscriptions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_plans";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_reference_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_channel_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_currency_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plan_tier_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plan_interval_enum";`);
  }
}
