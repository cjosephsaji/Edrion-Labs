import { Module } from '@nestjs/common';
import { PetrosAiCredentialsService } from './petros-ai-credentials.service';
import { PetrosAiRoutingController } from './petros-ai-routing.controller';
import { PetrosAiRoutingRepository } from './petros-ai-routing.repository';
import { PetrosAiRoutingService } from './petros-ai-routing.service';
import { PetrosProviderConnectivityService } from './petros-provider-connectivity.service';
import { PetrosProviderAdapterRegistry } from './petros-provider-adapters';
import { PetrosAiGatewayService } from './petros-ai-gateway.service';

@Module({
  controllers: [PetrosAiRoutingController],
  providers: [
    PetrosAiCredentialsService,
    PetrosAiRoutingRepository,
    PetrosAiRoutingService,
    PetrosProviderConnectivityService,
    PetrosProviderAdapterRegistry,
    PetrosAiGatewayService,
  ],
  exports: [PetrosAiRoutingService, PetrosAiRoutingRepository, PetrosAiGatewayService],
})
export class PetrosAiRoutingModule {}
