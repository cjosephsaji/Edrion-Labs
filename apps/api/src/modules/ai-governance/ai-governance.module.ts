import { Module } from '@nestjs/common';
import { AiGovernanceController } from './ai-governance.controller';
import { AiGovernanceService } from './ai-governance.service';
import { AiGovernanceRepository } from './ai-governance.repository';

@Module({
  controllers: [AiGovernanceController],
  providers: [AiGovernanceService, AiGovernanceRepository],
  exports: [AiGovernanceService, AiGovernanceRepository],
})
export class AiGovernanceModule {}
