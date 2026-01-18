import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSubscriptionPlans1737300000000 implements MigrationInterface {
  name = 'SeedSubscriptionPlans1737300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if plans already exist
    const existingPlans = await queryRunner.query(
      `SELECT COUNT(*) as count FROM subscription_plans`
    );

    if (parseInt(existingPlans[0].count) > 0) {
      return;
    }

    // Insert subscription plans
    await queryRunner.query(`
      INSERT INTO subscription_plans (
        id, name, tier, description, price, interval,
        stripe_product_id, stripe_price_id,
        sms_quota, email_quota, whatsapp_quota,
        max_contacts, max_senders, max_users, max_campaigns_per_month,
        features, trial_days, is_active, sort_order,
        created_at, updated_at
      ) VALUES
      -- Free Plan
      (
        gen_random_uuid(), 'Free', 'free',
        'Get started with basic features',
        0, 'monthly',
        NULL, NULL,
        100, 1000, 0,
        500, 1, 1, 5,
        '{"apiAccess": false, "customDomain": false, "prioritySupport": false, "advancedAnalytics": false, "webhooks": false, "automations": false, "abTesting": false, "dedicatedIp": false, "whiteLabel": false}'::jsonb,
        0, true, 1,
        NOW(), NOW()
      ),
      -- Starter Plan
      (
        gen_random_uuid(), 'Starter', 'starter',
        'Perfect for small businesses',
        29, 'monthly',
        NULL, NULL,
        1000, 10000, 500,
        2500, 3, 2, 20,
        '{"apiAccess": true, "customDomain": false, "prioritySupport": false, "advancedAnalytics": false, "webhooks": true, "automations": false, "abTesting": false, "dedicatedIp": false, "whiteLabel": false}'::jsonb,
        14, true, 2,
        NOW(), NOW()
      ),
      -- Growth Plan
      (
        gen_random_uuid(), 'Growth', 'growth',
        'Scale your marketing efforts',
        79, 'monthly',
        NULL, NULL,
        5000, 50000, 2000,
        10000, 10, 5, 50,
        '{"apiAccess": true, "customDomain": true, "prioritySupport": true, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": false, "whiteLabel": false}'::jsonb,
        14, true, 3,
        NOW(), NOW()
      ),
      -- Pro Plan
      (
        gen_random_uuid(), 'Pro', 'pro',
        'Advanced features for larger teams',
        199, 'monthly',
        NULL, NULL,
        20000, 200000, 10000,
        50000, 25, 15, 100,
        '{"apiAccess": true, "customDomain": true, "prioritySupport": true, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": true, "whiteLabel": false}'::jsonb,
        14, true, 4,
        NOW(), NOW()
      ),
      -- Enterprise Plan
      (
        gen_random_uuid(), 'Enterprise', 'enterprise',
        'Custom solutions for large organizations',
        499, 'monthly',
        NULL, NULL,
        -1, -1, -1,
        -1, -1, -1, -1,
        '{"apiAccess": true, "customDomain": true, "prioritySupport": true, "advancedAnalytics": true, "webhooks": true, "automations": true, "abTesting": true, "dedicatedIp": true, "whiteLabel": true}'::jsonb,
        14, true, 5,
        NOW(), NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove seeded plans
    await queryRunner.query(`
      DELETE FROM subscription_plans
      WHERE tier IN ('free', 'starter', 'growth', 'pro', 'enterprise')
    `);
  }
}
