import { Module } from '@nestjs/common';
import { PetrosAiRoutingModule } from '../petros-ai-routing/petros-ai-routing.module';
import { PetrosQualityController } from './petros-quality.controller';
import { PetrosQualityRepository } from './petros-quality.repository';
import { PetrosQualityService } from './petros-quality.service';

@Module({ imports: [PetrosAiRoutingModule], controllers: [PetrosQualityController], providers: [PetrosQualityRepository, PetrosQualityService], exports: [PetrosQualityService] })
export class PetrosQualityModule {}
