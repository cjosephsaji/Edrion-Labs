import { Module } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, LEARN_AI_PROVIDER } from '../../../common/tokens';
import { AtomCacheService } from './atom-cache.service';
import { BlockGeneratorService } from './block-generator.service';
import { BudgetsService } from './budgets.service';
import { EvaluatorService } from './evaluator.service';
import { LearnAiCallLogger } from './learn-ai-call.logger';
import { NullLearnAiProvider } from './null.provider';
import { OpenAiLearnProvider } from './openai.provider';
import { PlannerService } from './planner.service';
import { RouterService } from './router.service';
import { DefaultHomeworkPolicyPort, HOMEWORK_POLICY_PORT } from './homework-policy.port';

@Module({
  providers: [
    BudgetsService,
    LearnAiCallLogger,
    AtomCacheService,
    EvaluatorService,
    RouterService,
    PlannerService,
    BlockGeneratorService,
    OpenAiLearnProvider,
    NullLearnAiProvider,
    {
      provide: LEARN_AI_PROVIDER,
      useFactory: (env: ApiEnv, openai: OpenAiLearnProvider, nil: NullLearnAiProvider) =>
        env.OPENAI_API_KEY ? openai : nil,
      inject: [API_ENV, OpenAiLearnProvider, NullLearnAiProvider],
    },
    { provide: HOMEWORK_POLICY_PORT, useClass: DefaultHomeworkPolicyPort },
  ],
  exports: [
    LEARN_AI_PROVIDER,
    HOMEWORK_POLICY_PORT,
    BudgetsService,
    LearnAiCallLogger,
    EvaluatorService,
    RouterService,
    PlannerService,
    BlockGeneratorService,
    AtomCacheService,
    OpenAiLearnProvider,
  ],
})
export class LearnAiModule {}
