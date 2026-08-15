import { Module } from "@nestjs/common";
import { PetrosLearnerModelController } from "./petros-learner-model.controller";
import { PetrosLearnerModelRepository } from "./petros-learner-model.repository";
import { PetrosLearnerModelService } from "./petros-learner-model.service";
import { PetrosLearningSourceIngestionService } from "./petros-learning-source-ingestion.service";

@Module({
  controllers: [PetrosLearnerModelController],
  providers: [
    PetrosLearnerModelRepository,
    PetrosLearnerModelService,
    PetrosLearningSourceIngestionService,
  ],
  exports: [
    PetrosLearnerModelRepository,
    PetrosLearnerModelService,
    PetrosLearningSourceIngestionService,
  ],
})
export class PetrosLearnerModelModule {}
