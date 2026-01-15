import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { BullSmsQueueService } from './bull-sms-queue.service';

@Global()
@Module({
  providers: [QueueService, BullSmsQueueService],
  exports: [QueueService, BullSmsQueueService],
})
export class RabbitMQModule {}
