import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  // Connection pool size - configurable for high throughput workloads
  const poolSize = parseInt(configService.get<string>('DATABASE_POOL_SIZE', '50'), 10);
  const minPoolSize = parseInt(configService.get<string>('DATABASE_POOL_MIN', '10'), 10);
  const sslEnabled = configService.get<boolean>('database.ssl');
  const caCertPath = configService.get<string>('DATABASE_CA_CERT');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Build SSL configuration
  let sslConfig: boolean | object = false;
  if (sslEnabled) {
    sslConfig = {
      // In production, always verify certificates to prevent MITM attacks
      rejectUnauthorized: isProduction,
    };

    // If CA certificate path is provided, use it for verification
    if (caCertPath && fs.existsSync(caCertPath)) {
      sslConfig = {
        ...sslConfig,
        ca: fs.readFileSync(caCertPath).toString(),
      };
    } else if (isProduction) {
      console.warn(
        '[Database] WARNING: SSL enabled in production without CA certificate. ' +
          'Set DATABASE_CA_CERT for secure database connections.'
      );
    }
  }

  return {
    type: 'postgres',
    host: configService.get<string>('database.host'),
    port: configService.get<number>('database.port'),
    username: configService.get<string>('database.username'),
    password: configService.get<string>('database.password'),
    database: configService.get<string>('database.name'),
    ssl: sslConfig,

    // Entity and Migration paths
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],

    // Synchronize should be false in production
    synchronize: configService.get<string>('nodeEnv') === 'development',

    // Logging
    logging: ['error'],

    // Connection pool settings - optimized for high throughput
    extra: {
      max: poolSize, // Maximum number of connections (default: 50)
      min: minPoolSize, // Minimum pool size (default: 10)
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 10000, // Connection timeout 10s
      statement_timeout: 30000, // Query timeout 30s
    },
  };
};
