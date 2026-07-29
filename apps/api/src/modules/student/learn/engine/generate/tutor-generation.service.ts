import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import type { LessonGoal, LessonShapeV1, TopicShapeV1 } from '@edrion/schemas';
import { API_ENV, LEARN_AI_PROVIDER } from '../../../../../common/tokens';
import type { StudentPrincipal } from '../../../student.types';
import { LearnAiCallLogger } from '../../../learn-ai/learn-ai-call.logger';
import {
  AiUnavailableError,
  type LearnAiProvider,
} from '../../../learn-ai/provider';
import type { CapabilitySet } from '../capabilities/capability-resolver';
import { buildFixtureLesson, type FixtureBlock } from './fixture-lesson';
import {
  generatedLessonSchema,
  TUTOR_GENERATION_PROMPT_VERSION,
} from './lesson-blocks.schema';
import {
  buildTutorGenerationSystem,
  buildTutorGenerationUser,
} from './tutor-generation.prompt';
import { validateGeneratedLesson } from './validate-lesson';

export type LessonBuildResult = {
  blocks: FixtureBlock[];
  source: 'ai' | 'fixture';
  degraded: boolean;
  summaryMd?: string;
};

/**
 * Sole Learn teaching-content consumer of LEARN_AI_PROVIDER.
 * Gated by LEARN_SESSION_GENERATE — off by default; never called from tests.
 */
@Injectable()
export class TutorGenerationService {
  private readonly logger = new Logger(TutorGenerationService.name);

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  get generationEnabled(): boolean {
    return this.env.LEARN_SESSION_GENERATE === true;
  }

  async buildLesson(
    principal: StudentPrincipal,
    opts: {
      topicTitle: string;
      goal: LessonGoal;
      shape: TopicShapeV1;
      lesson: LessonShapeV1;
      capabilities: CapabilitySet;
      timeBudgetMinutes: number;
      /** Explicit opt-in from client; still requires LEARN_SESSION_GENERATE. */
      useAi?: boolean;
    },
  ): Promise<LessonBuildResult> {
    const fixtures = (): LessonBuildResult => ({
      blocks: buildFixtureLesson(opts.topicTitle, opts.shape, opts.lesson),
      source: 'fixture',
      degraded: false,
    });

    const wantAi = this.generationEnabled && opts.useAi !== false;
    if (!wantAi || !this.ai.available) {
      return fixtures();
    }

    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'block_gen',
        tier: 'large',
        system: buildTutorGenerationSystem({
          topicTitle: opts.topicTitle,
          goal: opts.goal,
          shape: opts.shape,
          capabilities: opts.capabilities,
        }),
        user: buildTutorGenerationUser({
          topicTitle: opts.topicTitle,
          goal: opts.goal,
          shape: opts.shape,
          lesson: opts.lesson,
          timeBudgetMinutes: opts.timeBudgetMinutes,
        }),
        schema: generatedLessonSchema,
        schemaName: 'learn_generated_lesson',
        maxOutputTokens: 4500,
        reasoningEffort: 'low',
        verbosity: 'medium',
      });

      await this.callLog.log(principal, 'block_gen', usage, {
        promptVersion: TUTOR_GENERATION_PROMPT_VERSION,
        outcome: 'ok',
      });

      const checked = validateGeneratedLesson(result, {
        topicTitle: opts.topicTitle,
        capabilities: opts.capabilities,
      });

      if (!checked.ok) {
        this.logger.warn(
          `Learn generation failed validation: ${checked.issues.map((i) => i.code).join(',')}`,
        );
        await this.callLog.log(principal, 'block_gen', usage, {
          promptVersion: TUTOR_GENERATION_PROMPT_VERSION,
          degraded: true,
          outcome: 'validation_failed',
          error: checked.issues.map((i) => i.code).join(','),
        });
        return { ...fixtures(), degraded: true };
      }

      return {
        blocks: checked.blocks,
        source: 'ai',
        degraded: false,
        summaryMd: result.summaryMd,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Learn generation degraded to fixtures: ${message}`);
      if (!(err instanceof AiUnavailableError)) {
        await this.callLog.log(
          principal,
          'block_gen',
          { inputTokens: 0, outputTokens: 0, model: 'n/a', durationMs: 0 },
          {
            promptVersion: TUTOR_GENERATION_PROMPT_VERSION,
            degraded: true,
            outcome: 'error',
            error: message.slice(0, 500),
          },
        );
      }
      return { ...fixtures(), degraded: true };
    }
  }
}
