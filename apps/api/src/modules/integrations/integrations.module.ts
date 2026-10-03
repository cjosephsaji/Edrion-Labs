import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsDeliveriesController } from './integrations-deliveries.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsRepository } from './integrations.repository';
import { ProviderMappingsRepository } from './provider-mappings.repository';
import { ProviderMappingsService } from './provider-mappings.service';

/** Webhook endpoints + signed delivery (Phase 10f-4). Queue infra is global (QueueModule). */
@Module({
  controllers: [IntegrationsController, IntegrationsDeliveriesController],
  providers: [IntegrationsService, IntegrationsRepository, ProviderMappingsRepository, ProviderMappingsService],
  exports: [IntegrationsService, ProviderMappingsService],
})
export class IntegrationsModule {}
