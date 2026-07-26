import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsDeliveriesController } from './integrations-deliveries.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsRepository } from './integrations.repository';

/** Webhook endpoints + signed delivery (Phase 10f-4). Queue infra is global (QueueModule). */
@Module({
  controllers: [IntegrationsController, IntegrationsDeliveriesController],
  providers: [IntegrationsService, IntegrationsRepository],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
