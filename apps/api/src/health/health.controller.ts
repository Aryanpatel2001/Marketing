import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { EmailService } from '@/providers/email/email.service';
import { QueueService } from '@/providers/queue/queue.service';
import { EXCHANGES, QUEUES } from '@/providers/queue/queue.constants';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private emailService: EmailService,
    private queueService: QueueService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check API health status' })
  @HealthCheck()
  check() {
    return this.health.check([
      // Database check
      () => this.db.pingCheck('database'),

      // Memory check (heap should be less than 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // RSS memory check (should be less than 500MB)
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  @Get('aws-ses')
  @ApiOperation({ summary: 'Check AWS SES credentials and configuration' })
  async checkAwsSes() {
    return this.emailService.checkCredentials();
  }

  @Get('rabbitmq')
  @ApiOperation({ summary: 'Check RabbitMQ connection status' })
  async checkRabbitMQ() {
    const isReady = this.queueService.isReady();
    const channel = this.queueService.getChannel();

    return {
      connected: isReady,
      hasChannel: !!channel,
      message: isReady
        ? 'RabbitMQ is connected and ready'
        : 'RabbitMQ is not connected - check server logs',
    };
  }

  @Get('rabbitmq/reconnect')
  @ApiOperation({ summary: 'Force RabbitMQ reconnection' })
  async reconnectRabbitMQ() {
    try {
      // Force disconnect first
      await this.queueService.disconnect();
      // Then reconnect
      await this.queueService.connect();
      return {
        success: true,
        connected: this.queueService.isReady(),
        message: 'Disconnected and reconnected',
      };
    } catch (error: any) {
      return {
        success: false,
        connected: false,
        error: error.message,
      };
    }
  }

  @Get('rabbitmq/debug')
  @ApiOperation({ summary: 'Debug RabbitMQ configuration' })
  async debugRabbitMQ() {
    const exchangeCount = Object.keys(EXCHANGES).length;
    const queueCount = Object.keys(QUEUES).length;
    const exchangeNames = Object.values(EXCHANGES).map((e: any) => e.name);
    const queueNames = Object.values(QUEUES).map((q: any) => ({
      name: q.name,
      exchange: q.exchange || 'campaigns (default)',
      routingKey: q.routingKey,
    }));

    return {
      connected: this.queueService.isReady(),
      hasChannel: !!this.queueService.getChannel(),
      configuration: {
        exchangeCount,
        queueCount,
        exchanges: exchangeNames,
        queues: queueNames,
      },
    };
  }

  @Get('rabbitmq/setup')
  @ApiOperation({ summary: 'Manually trigger RabbitMQ setup' })
  async setupRabbitMQ() {
    return this.queueService.manualSetup();
  }
}
