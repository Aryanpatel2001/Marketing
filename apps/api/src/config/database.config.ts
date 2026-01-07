import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('database.host'),
  port: configService.get<number>('database.port'),
  username: configService.get<string>('database.username'),
  password: configService.get<string>('database.password'),
  database: configService.get<string>('database.name'),
  ssl: configService.get<boolean>('database.ssl')
    ? {
        rejectUnauthorized: false,
      }
    : false,

  // Entity and Migration paths
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],

  // Synchronize should be false in production
  synchronize: configService.get<string>('nodeEnv') === 'development',

  // Logging
  logging: ['error'],

  // Connection pool settings
  extra: {
    max: 20, // Maximum number of connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
});
