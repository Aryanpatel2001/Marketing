/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

// Load .env manually
function loadEnv() {
  const env: Record<string, string> = {};
  const envPath = path.resolve(__dirname, '../.env');

  if (fs.existsSync(envPath)) {
    console.log(`Loading .env from ${envPath}`);
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
      }
    });
  }
  return env;
}

async function approveSenderId() {
  const env = loadEnv();

  const client = new Client({
    host: env.DATABASE_HOST || 'localhost',
    port: parseInt(env.DATABASE_PORT || '5432', 10),
    user: env.DATABASE_USERNAME || 'postgres',
    password: env.DATABASE_PASSWORD || 'postgres',
    database: env.DATABASE_NAME || 'marketing',
    ssl: env.DATABASE_SSL === 'true',
  });

  const targetId = '91129748-a957-4ecd-8e1d-1b3065c3ab3a';

  try {
    await client.connect();
    console.log('Connected to database.');

    const query = `
      UPDATE sms_sender_ids
      SET status = 'active', verified_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const res = await client.query(query, [targetId]);

    if (res.rowCount && res.rowCount > 0) {
      console.log(`✅ Successfully updated Sender ID ${targetId}`);
      console.log('New Status:', res.rows[0].status);
      console.log('Verified At:', res.rows[0].verified_at);
    } else {
      console.log(`❌ Sender ID ${targetId} not found.`);
    }
  } catch (err) {
    console.error('Error executing update:', err);
  } finally {
    await client.end();
  }
}

approveSenderId();
