/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import { TwilioProvider } from '../src/providers/sms/providers/twilio.provider';

// Mock Logger
const _mockLogger = {
  log: (msg: string) => console.log(`[LOG] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};

// Mock ConfigService
class MockConfigService {
  private env: Record<string, string> = {};

  constructor() {
    this.loadEnv();
  }

  private loadEnv() {
    try {
      const envPath = path.resolve(__dirname, '../.env');
      if (fs.existsSync(envPath)) {
        console.log(`Loading .env from ${envPath}`);
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach((line) => {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
            this.env[key] = value;
            process.env[key] = value; // Also set process.env
          }
        });
      } else {
        console.warn('.env file not found at', envPath);
      }
    } catch (error) {
      console.error('Error loading .env file:', error);
    }
  }

  get<T>(key: string): T | undefined {
    return (this.env[key] || process.env[key]) as unknown as T;
  }
}

async function verifyTwilio() {
  console.log('Starting Twilio Verification...');

  const configService = new MockConfigService() as any;

  // Override Logger in TwilioProvider if necessary or just let it use ConsoleLogger (Nest default might fail without context)
  // But TwilioProvider creates its own Logger instance: private readonly logger = new Logger(TwilioProvider.name);
  // NestJS Logger might work if standard output is available.

  const provider = new TwilioProvider(configService);

  // Manually inject logger if need be, but let's try standard execution first.

  try {
    console.log('Checking credentials...');
    const result = await provider.checkCredentials();

    console.log('\n----------------------------------------');
    console.log('VERIFICATION RESULT:');
    console.log('----------------------------------------');
    console.log(`Success: ${result.success ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Configured: ${result.configured}`);
    console.log(`Credentials Valid: ${result.credentialsValid}`);
    if (result.balance !== undefined) {
      console.log(`Balance: $${result.balance}`);
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((e) => console.error(`- ${e}`));
    }

    if (result.recommendations && result.recommendations.length > 0) {
      console.log('\nRecommendations:');
      result.recommendations.forEach((r) => console.log(`- ${r}`));
    }
    console.log('----------------------------------------\n');
  } catch (error) {
    console.error('Unexpected error during verification:', error);
  }
}

verifyTwilio();
