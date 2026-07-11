import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { blockTypeSchema, spineStepSchema, sessionPlanSchema, type SessionPlan } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from './provider';
import { AtomCacheService } from './atom-cache.service';
import { BudgetsService } from './budgets.service';
import type { PedagogyDirectives } from './pedagogy-matrix';
import { LearnAiCallLogger } from './learn-ai-call.logger';
import { buildGroundedPlannerSystemPrompt, buildPlannerSystemPrompt } from './prompts/planner.prompt';

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
  private readonly logger = new Logger(PlannerService.name);

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
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'session_plan',
        tier: 'large',
        system: buildPlannerSystemPrompt(directives),
        user: `Topic: ${topicTitle}\nSubject: ${subjectLabel}\nKind: ${kind}`,
        schema: plannerOutputSchema,
        schemaName: 'session_plan',
        maxOutputTokens: 4096,
        reasoningEffort: 'low',
      });
      await this.callLog.log(principal, 'session_plan', usage);
      await this.atoms.put(topicId, 'session_plan', result, usage.model);
      return sessionPlanSchema.parse({ ...result, kind });
    } catch (err) {
      this.logger.error(`Session planner AI failed — using default plan: ${(err as Error).message}`);
      return kind === 'refresh10' ? REFRESH_PLAN : DEFAULT_PLAN;
    }
  }

  /** Plans a session grounded in a student's uploaded document (library tutor). Not atom-cached: content is doc+focus specific. */
  async planGrounded(
    principal: StudentPrincipal,
    docTitle: string,
    sourceText: string,
    focusConcept: string | undefined,
    directives: PedagogyDirectives,
  ): Promise<SessionPlan> {
    if (!this.ai.available) return DEFAULT_PLAN;

    await this.budgets.spend(principal, 'session_plan', 2000);
    try {
      const user = [
        `Document: ${docTitle}`,
        focusConcept ? `Focus concept: ${focusConcept}` : null,
        `SOURCE TEXT (with [p.N] page markers):`,
        sourceText.slice(0, 14_000),
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
      const { result, usage } = await this.ai.completeJson({
        purpose: 'session_plan',
        tier: 'large',
        system: buildGroundedPlannerSystemPrompt(directives),
        user,
        schema: plannerOutputSchema,
        schemaName: 'session_plan',
        maxOutputTokens: 4096,
        reasoningEffort: 'low',
      });
      await this.callLog.log(principal, 'session_plan', usage);
      return sessionPlanSchema.parse({ ...result, kind: 'standard' });
    } catch (err) {
      this.logger.error(`Grounded session planner AI failed — using default plan: ${(err as Error).message}`);
      return DEFAULT_PLAN;
    }
  }
}

