import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { AiGovernanceModule } from '../../ai-governance/ai-governance.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { LearnRepository } from '../learn/learn.repository';
import { StudentTutorPolicyService } from './student-tutor-policy.service';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { MovePlannerService } from './move-planner.service';
import { BlockRendererService } from './block-renderer.service';
import { OrchestratorSessionService } from './orchestrator-session.service';
import { LearnEvidenceService } from './learn-evidence.service';
import { LearnStreamService } from './learn-stream.service';
import { LearnGoalObligationService } from './learn-goal-obligation.service';
import { EdrionLearnController } from './edrion-learn.controller';

@Module({
  imports: [AiGovernanceModule, FeatureControlsModule, LearningEventsModule],
  controllers: [EdrionLearnController],
  providers: [
    StudentTutorPolicyService,
    EdrionLearnRepository,
    LearnRepository,
    MovePlannerService,
    BlockRendererService,
    OrchestratorSessionService,
    LearnEvidenceService,
    LearnStreamService,
    LearnGoalObligationService,
  ],
  exports: [
    StudentTutorPolicyService,
    OrchestratorSessionService,
    LearnGoalObligationService,
    LearnEvidenceService,
    LearnStreamService,
  ],
})
export class EdrionLearnModule {}
