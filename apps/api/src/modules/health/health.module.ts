import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LearnAiModule } from '../student/learn-ai/learn-ai.module';

@Module({
  imports: [LearnAiModule],
  controllers: [HealthController],
})
export class HealthModule {}
