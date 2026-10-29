import { Module } from "@nestjs/common";
import { PetrosLearnerModelController } from "./petros-learner-model.controller";
import { PetrosLearnerModelRepository } from "./petros-learner-model.repository";
import { PetrosLearnerModelService } from "./petros-learner-model.service";
import { PetrosLearningSourceIngestionService } from "./petros-learning-source-ingestion.service";
import { PetrosEvidenceAdmissionService } from './petros-evidence-admission.service';

@Module({
  controllers: [PetrosLearnerModelController],
  providers: [
    PetrosEvidenceAdmissionService,
    PetrosLearnerModelRepository,
    PetrosLearnerModelService,
    PetrosLearningSourceIngestionService,
  ],
  exports: [
    PetrosEvidenceAdmissionService,
    PetrosLearnerModelRepository,
    PetrosLearnerModelService,
    PetrosLearningSourceIngestionService,
  ],
})
export class PetrosLearnerModelModule {}
