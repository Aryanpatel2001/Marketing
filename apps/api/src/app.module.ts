import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

// Configuration
import configuration from './config/configuration';
import { databaseConfig } from './config/database.config';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { BillingModule } from './modules/billing/billing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';

// Provider Modules
import { EmailModule } from './providers/email/email.module';
import { SmsModule } from './providers/sms/sms.module';
import { WhatsappModule } from './providers/whatsapp/whatsapp.module';
import { StorageModule } from './providers/storage/storage.module';

// Redis Module (Global)
import { RedisModule } from './providers/redis/redis.module';

// RabbitMQ Module (Global)
import { RabbitMQModule } from './providers/queue/queue.module';

// Legacy Queue Module (commented out)
// import { QueueModule } from './queue/queue.module';

// Health Module
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['./apps/api/.env.local', './apps/api/.env', '.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl', 60) * 1000,
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),

    // Event Emitter for real-time SSE events
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Scheduler for cron jobs (scheduled campaigns)
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    UsersModule,
    TenantsModule,
    ContactsModule,
    CampaignsModule,
    TemplatesModule,
    BillingModule,
    AnalyticsModule,
    WebhooksModule,
    ApiKeysModule,

    // Provider Modules
    EmailModule,
    SmsModule,
    WhatsappModule,
    StorageModule,

    // Redis Module (Global - for caching and counters)
    RedisModule,

    // RabbitMQ Module (Global - for queue-based sending)
    RabbitMQModule,

    // Health Check
    HealthModule,
  ],
})
export class AppModule {}
