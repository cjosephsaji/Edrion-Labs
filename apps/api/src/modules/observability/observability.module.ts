import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';

/** Receives client-side crash reports. Logger + reporter come from the global CoreModule. */
@Module({
  controllers: [ObservabilityController],
})
export class ObservabilityModule {}
