import { Module } from '@nestjs/common';
import { PortalModule } from './portal.module';
import { PetrosInstitutionalModule } from '../petros-institutional/petros-institutional.module';
import { PetrosTeachingPackModule } from '../student/knowledge/petros-teaching-pack.module';
import { PetrosAssignmentLearningController } from './petros-assignment-learning.controller';
import { PetrosAssignmentLearningService } from './petros-assignment-learning.service';

@Module({imports:[PortalModule,PetrosInstitutionalModule,PetrosTeachingPackModule],
  controllers:[PetrosAssignmentLearningController],providers:[PetrosAssignmentLearningService]})
export class PetrosAssignmentLearningModule {}
