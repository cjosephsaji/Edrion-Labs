import { Module } from '@nestjs/common';
import { PetrosAiRoutingModule } from '../petros-ai-routing/petros-ai-routing.module';
import { PetrosTopicProfilesController } from './petros-topic-profiles.controller';
import { PetrosTopicProfilesRepository } from './petros-topic-profiles.repository';
import { PetrosTopicProfilesService } from './petros-topic-profiles.service';

@Module({
  imports: [PetrosAiRoutingModule],
  controllers: [PetrosTopicProfilesController],
  providers: [PetrosTopicProfilesRepository, PetrosTopicProfilesService],
  exports: [PetrosTopicProfilesRepository, PetrosTopicProfilesService],
})
export class PetrosTopicProfilesModule {}
