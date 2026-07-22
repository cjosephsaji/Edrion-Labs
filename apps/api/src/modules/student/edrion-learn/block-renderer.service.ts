import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  blockV1Schema,
  type BlockV1,
  type PlanV1,
} from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import { PROMPT_VERSION } from '../learn-ai/prompts/version';
import { buildRenderSystemPrompt, buildRenderUserPrompt } from './prompts/render.prompt';

@Injectable()
export class BlockRendererService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  async render(
    principal: StudentPrincipal,
    opts: {
      sessionId: string;
      blockId: string;
      blockSeq: number;
      plan: PlanV1;
      topicTitle: string;
      groundingExcerpt?: string;
      degraded?: boolean;
    },
  ): Promise<{ block: BlockV1; degraded: boolean }> {
    if (!this.ai.available || opts.degraded) {
      return { block: this.fallbackBlock(opts.plan, opts.topicTitle), degraded: true };
    }

    const started = Date.now();
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_render',
        tier: 'small',
        system: buildRenderSystemPrompt(opts.plan.move),
        user: buildRenderUserPrompt({
          plan: opts.plan,
          topicTitle: opts.topicTitle,
          groundingExcerpt: opts.groundingExcerpt,
        }),
        schema: blockV1Schema,
        schemaName: 'BlockV1',
        maxOutputTokens: 1600,
      });

      await this.callLog.log(principal, 'learn_render', usage, {
        sessionId: opts.sessionId,
        blockId: opts.blockId,
        blockSeq: opts.blockSeq,
        promptVersion: PROMPT_VERSION,
      });

      return { block: result, degraded: false };
    } catch {
      const usage = { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: Date.now() - started };
      await this.callLog.log(principal, 'learn_render', usage, {
        sessionId: opts.sessionId,
        blockId: opts.blockId,
        blockSeq: opts.blockSeq,
        promptVersion: PROMPT_VERSION,
        error: 'render_failed',
        degraded: true,
      });
      return { block: this.fallbackBlock(opts.plan, opts.topicTitle), degraded: true };
    }
  }

  fallbackBlock(plan: PlanV1, topic: string): BlockV1 {
    const atomId = randomUUID();
    switch (plan.move) {
      case 'worked_example':
        return blockV1Schema.parse({
          block_type: 'worked_example',
          title: topic,
          problem_md: `Work through this **${topic}** problem.`,
          steps: [
            { step_md: 'Identify what the question is asking.' },
            { step_md: 'Recall the key rule or definition.', predict_prompt: 'What rule applies here?' },
            { step_md: 'Apply it step by step to reach the answer.' },
          ],
        });
      case 'retrieval_check':
      case 'prereq_pulse':
        return blockV1Schema.parse({
          block_type: 'question_set',
          purpose: plan.move === 'prereq_pulse' ? 'prereq' : 'retrieval',
          questions: [
            {
              id: 'q1',
              type: 'mcq_single',
              prompt_md: `Which statement about **${topic}** is correct?`,
              options: [
                { id: 'a', label_md: 'The core idea is well understood.' },
                { id: 'b', label_md: 'It contradicts the basics.' },
                { id: 'c', label_md: 'It only applies in edge cases.' },
              ],
              correct_option_id: 'a',
              atom_id: atomId,
              difficulty: 'medium',
              why_md: 'The core idea is the foundation for everything else in this topic.',
            },
          ],
        });
      case 'socratic_probe':
        return blockV1Schema.parse({
          block_type: 'probe',
          question_md: `Why does **${topic}** work the way it does?`,
          chain_id: randomUUID(),
          turn: 1,
        });
      case 'synthesis':
        return blockV1Schema.parse({
          block_type: 'synthesis',
          prompt_md: 'Say the main idea in one sentence.',
        });
      case 'artifact_commit':
        return blockV1Schema.parse({
          block_type: 'artifact_commit',
          cards: [
            {
              front_md: `What is the key idea in ${topic}?`,
              back_md: 'The central concept you practiced in this lesson.',
              source_block_id: randomUUID(),
            },
          ],
          include_canvas: false,
        });
      case 'visual_spawn':
        return blockV1Schema.parse({
          block_type: 'explanation',
          body_md: `Here's the idea behind **${topic}** in words instead of a diagram.`,
        });
      default:
        return blockV1Schema.parse({
          block_type: 'explanation',
          title: topic,
          body_md: `Let's work through **${topic}** step by step. I'll keep this clear and focused.`,
        });
    }
  }
}
