import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

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
  try {
    await dataSource.initialize();
    const id = '45289738-573f-47c6-8ddb-197650810e1f';
    console.log(`Fetching campaign ${id}...`);

    // Get current time in UTC
    const now = new Date();
    console.log('Current System Time (UTC):', now.toISOString());
    console.log('Current System Time (Local):', now.toString());

    const result = await dataSource.query(
      `SELECT id, name, status, scheduled_at, created_at, timezone FROM campaigns WHERE id = $1`,
      [id]
    );
    console.log('Campaign Record:', result[0]);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await dataSource.destroy();
  }
}

run();
