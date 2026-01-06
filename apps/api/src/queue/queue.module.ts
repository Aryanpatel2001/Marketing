import { Module } from '@nestjs/common';
// import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
// import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // RabbitMQ will be configured here
    // RabbitMQModule.forRootAsync(RabbitMQModule, {
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     uri: config.get<string>('rabbitmq.url'),
    //     exchanges: [
    //       { name: 'jobs', type: 'direct' },
    //       { name: 'events', type: 'topic' },
    //       { name: 'dlx', type: 'fanout' },
    //     ],
    //     connectionInitOptions: { wait: true },
    //     enableControllerDiscovery: true,
    //   }),
    // }),
  ],
  providers: [],
  exports: [],
})
export class QueueModule {}
