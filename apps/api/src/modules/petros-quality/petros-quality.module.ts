import { Module } from '@nestjs/common';
import { PetrosAiRoutingModule } from '../petros-ai-routing/petros-ai-routing.module';
import { PetrosQualityController } from './petros-quality.controller';
import { PetrosQualityRepository } from './petros-quality.repository';
import { PetrosQualityService } from './petros-quality.service';
import { PetrosReleaseModule } from './petros-release.module';
import { PetrosOperationsService } from './petros-operations.service';

@Module({ imports: [PetrosAiRoutingModule, PetrosReleaseModule], controllers: [PetrosQualityController], providers: [PetrosQualityRepository, PetrosQualityService, PetrosOperationsService], exports: [PetrosQualityService] })
export class PetrosQualityModule {}
