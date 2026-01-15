import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { EmailModule } from '@/providers/email/email.module';

@Module({
  imports: [TerminusModule, EmailModule],
  controllers: [HealthController],
})
export class HealthModule {}
