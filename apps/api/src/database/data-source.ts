import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '../../.env' });
dotenv.config({ path: '../../.env.local' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'aryanpatel',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'marketing_swe',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // Entity and Migration paths - use relative paths from project root
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/database/migrations/*{.ts,.js}'],

  // Logging
  logging: ['error', 'migration'],
});
