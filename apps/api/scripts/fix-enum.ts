import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

// Try to load env from different possible locations
config({ path: resolve(__dirname, '../.env') }); // apps/api/.env
config({ path: resolve(__dirname, '../../../.env') }); // root .env

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'marketing',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  console.log('Connecting to database...');
  try {
    await dataSource.initialize();
    console.log('Connected!');
  } catch (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    console.log('Starting enum repair (LOWERCASE)...');

    // Check indexes
    const indexes = await queryRunner.query(`
      SELECT i.relname as indexname, pg_get_indexdef(ix.indexrelid) as def
      FROM pg_class i, pg_index ix
      WHERE i.oid = ix.indexrelid AND ix.indrelid = 'campaigns'::regclass
    `);

    console.log('Indexes on campaigns:', indexes);

    // Drop any index that involves "status"
    for (const idx of indexes) {
      if (idx.def.includes('status')) {
        console.log(`Dropping index ${idx.indexname}...`);
        await queryRunner.query(`DROP INDEX "${idx.indexname}"`);
      }
    }

    // Drop default constraint first
    console.log('Dropping default value...');
    try {
      await queryRunner.query('ALTER TABLE "campaigns" ALTER COLUMN "status" DROP DEFAULT');
    } catch (e) {
      console.log('Default might not exist, verifying...', e.message);
    }

    // Rename existing enum to process it
    try {
      await queryRunner.query(
        'ALTER TYPE campaigns_status_enum RENAME TO campaigns_status_enum_old'
      );
    } catch (e) {
      console.log('Rename info:', e.message);
    }

    // Create new enum with LOWERCASE values (matching entity definition)
    try {
      console.log('Creating new enum type (LOWERCASE)...');
      await queryRunner.query(
        "CREATE TYPE campaigns_status_enum AS ENUM ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed', 'preparing', 'ready')"
      );
    } catch (e: any) {
      console.log('Create enum info:', e.message);
    }

    // Update column - Convert to LOWERCASE
    try {
      console.log('Altering column type to TEXT...');
      await queryRunner.query(
        'ALTER TABLE "campaigns" ALTER COLUMN "status" TYPE text USING status::text'
      );

      console.log('Altering column type to new ENUM (converting to lowercase)...');
      await queryRunner.query(
        'ALTER TABLE "campaigns" ALTER COLUMN "status" TYPE campaigns_status_enum USING lower(status)::campaigns_status_enum'
      );

      console.log('Restoring default value...');
      await queryRunner.query(
        'ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT \'draft\'::campaigns_status_enum'
      );

      console.log('Column updated successfully.');
    } catch (e: any) {
      console.error('Failed to update column:', e.message);
    }

    // Drop old enum
    try {
      console.log('Cleaning up old enum...');
      await queryRunner.query('DROP TYPE campaigns_status_enum_old');
    } catch (e: any) {
      console.log('Drop old enum info:', e.message);
    }

    console.log('Repair complete!');
  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

run();
