import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionCreditToTransactionType1737200000000 implements MigrationInterface {
  name = 'AddSubscriptionCreditToTransactionType1737200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'subscription_credit' to the transaction_type_enum if it doesn't exist
    // PostgreSQL requires ALTER TYPE ... ADD VALUE to add enum values

    // First check if we're using the original enum name or TypeORM's auto-generated name
    const enumExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'transaction_type_enum'
      );
    `);

    const typeormEnumExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'wallet_transactions_type_enum'
      );
    `);

    // Add to transaction_type_enum if it exists
    if (enumExists[0].exists) {
      const hasValue = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type_enum')
          AND enumlabel = 'subscription_credit'
        );
      `);

      if (!hasValue[0].exists) {
        await queryRunner.query(`
          ALTER TYPE "transaction_type_enum" ADD VALUE IF NOT EXISTS 'subscription_credit';
        `);
      }
    }

    // Add to wallet_transactions_type_enum if it exists (TypeORM auto-generated name)
    if (typeormEnumExists[0].exists) {
      const hasValue = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'wallet_transactions_type_enum')
          AND enumlabel = 'subscription_credit'
        );
      `);

      if (!hasValue[0].exists) {
        await queryRunner.query(`
          ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'subscription_credit';
        `);
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values directly
    // To remove an enum value, you would need to:
    // 1. Create a new enum type without the value
    // 2. Update the column to use the new type
    // 3. Drop the old type
    // This is intentionally left as a no-op for safety
  }
}
