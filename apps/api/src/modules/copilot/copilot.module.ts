import { Module } from '@nestjs/common';
import { StubPlanner } from '@edrion/copilot';
import { IdempotencyService } from '../../common/idempotency.service';
import { InstitutionsModule } from '../institutions/institutions.module';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { AiGovernanceModule } from '../ai-governance/ai-governance.module';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotRepository } from './copilot.repository';
import { CopilotToolRegistry } from './tool-registry';
import { AiUsageLimiter } from './ai-usage-limiter.service';
import { COPILOT_PLANNER } from './copilot.tokens';

/**
 * Copilot run + confirmation lifecycle. Dispatches confirmed actions through the EXISTING audited
 * services (institutions, feature-controls) — the AI reuses the human path. The planner is behind
 * a DI seam (StubPlanner today; swap for a real model — default Opus 4.8 — without touching the
 * service). Guardrails are evaluated via AiGovernanceModule, server-side, before every execution.
 */
@Module({
  imports: [InstitutionsModule, FeatureControlsModule, AiGovernanceModule],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    CopilotRepository,
    CopilotToolRegistry,
    AiUsageLimiter,
    IdempotencyService,
    { provide: COPILOT_PLANNER, useValue: new StubPlanner() },
  ],
  exports: [CopilotService],
})
export class CopilotModule {}
