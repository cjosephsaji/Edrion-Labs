import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { blockTypeSchema, spineStepSchema, sessionPlanSchema, type SessionPlan } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from './provider';
import { AtomCacheService } from './atom-cache.service';
import { BudgetsService } from './budgets.service';
import type { PedagogyDirectives } from './pedagogy-matrix';
import { LearnAiCallLogger } from './learn-ai-call.logger';

const plannerOutputSchema = sessionPlanSchema.extend({
  blocks: z.array(
    z.object({
      blockType: blockTypeSchema,
      spineStep: spineStepSchema,
      brief: z.string(),
    }),
  ),
});

const DEFAULT_PLAN: SessionPlan = {
  kind: 'standard',
  spineMeta: {},
  blocks: [
    { blockType: 'concept_card', spineStep: 'understand', brief: 'Introduce the topic' },
    { blockType: 'visual_explainer', spineStep: 'see_it_visually', brief: 'Visual explanation' },
    { blockType: 'worked_example', spineStep: 'worked_example', brief: 'Worked example' },
    { blockType: 'checkpoint', spineStep: 'check_understanding', brief: 'Check understanding' },
    { blockType: 'practice_item', spineStep: 'solve_yourself', brief: 'Practice problem' },
    { blockType: 'reflection_summary', spineStep: 'wrap_up', brief: 'Wrap up takeaways' },
  ],
};

const REFRESH_PLAN: SessionPlan = {
  kind: 'refresh10',
  spineMeta: {},
  blocks: [
    { blockType: 'concept_card', spineStep: 'understand', brief: 'Quick recap' },
    { blockType: 'practice_item', spineStep: 'solve_yourself', brief: 'Practice 1' },
    { blockType: 'practice_item', spineStep: 'solve_yourself', brief: 'Practice 2' },
  ],
};

@Injectable()
export class PlannerService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly atoms: AtomCacheService,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  async plan(
    principal: StudentPrincipal,
    topicId: string,
    topicTitle: string,
    subjectLabel: string,
    directives: PedagogyDirectives,
    kind: 'standard' | 'refresh10' = 'standard',
  ): Promise<SessionPlan> {
    const cached = await this.atoms.get(topicId, 'session_plan');
    if (cached) return sessionPlanSchema.parse(cached);

    if (!this.ai.available) {
      return kind === 'refresh10' ? REFRESH_PLAN : DEFAULT_PLAN;
    }

    await this.budgets.spend(principal, 'session_plan', 2000);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'session_plan',
      tier: 'large',
      system: `Plan a learning session. Visual blocks: ${directives.visualBlocks}. Checkpoint: ${directives.checkpointStyle}. Practice: ${directives.practiceStyle}.`,
      user: `Topic: ${topicTitle}\nSubject: ${subjectLabel}\nKind: ${kind}`,
      schema: plannerOutputSchema,
      schemaName: 'session_plan',
      maxOutputTokens: 1500,
    });
    await this.callLog.log(principal, 'session_plan', usage);
    await this.atoms.put(topicId, 'session_plan', result, usage.model);
    return sessionPlanSchema.parse({ kind, ...result });
  }
}
