import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  blockV1Schema,
  type BlockV1,
  type PlanV1,
} from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../../common/tokens';
import type { LearnAiProvider } from '../../learn-ai/provider';
import { LearnAiCallLogger } from '../../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../../student.types';
import { LearnConfigService } from './learn-config.service';
import { configTierToAiTier } from './learn-ai-tier';
import {
  RENDER_PROMPT_VERSION,
  buildRenderSystemPrompt,
  buildRenderUserPrompt,
  type RenderRecentBlockDigest,
} from './prompts/render.prompt';
import { LearnSessionsRepository } from './learn-sessions.repository';

const RENDER_TIMEOUT_MS = 45_000;

export type RenderProgress = {
  blockId: string;
  text: string;
  firstTokenMs?: number;
};

@Injectable()
export class BlockRendererService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
    private readonly repo: LearnSessionsRepository,
    private readonly config: LearnConfigService,
  ) {}

  async render(
    principal: StudentPrincipal,
    opts: {
      sessionId: string;
      blockId: string;
      blockSeq: number;
      plan: PlanV1;
      topicTitle: string;
      learnTopicId?: string | null;
      groundingExcerpt?: string;
      recentBlocks?: RenderRecentBlockDigest[];
      degraded?: boolean;
      speculative?: boolean;
      onProgress?: (p: RenderProgress) => void;
    },
  ): Promise<{ block: BlockV1; degraded: boolean; firstTokenMs: number | null }> {
    if (!this.ai.available || opts.degraded) {
      return {
        block: await this.fallbackBlock(opts.plan, opts.topicTitle, opts.learnTopicId),
        degraded: true,
        firstTokenMs: null,
      };
    }

    const cfg = await this.config.getAll(
      principal.kind === 'institutional'
        ? { institutionId: principal.institutionId }
        : { independentUserId: principal.independentUserId },
    );
    const tier = configTierToAiTier(cfg.render_model_tier);
    const atomIds = opts.learnTopicId
      ? (await this.repo.listConceptAtoms(opts.learnTopicId)).map((a) => a.id)
      : [];

    const started = Date.now();
    let firstTokenMs: number | null = null;
    let accumulated = '';

    try {
      const system = buildRenderSystemPrompt(opts.plan.move);
      const user = buildRenderUserPrompt({
        plan: opts.plan,
        topicTitle: opts.topicTitle,
        groundingExcerpt: opts.groundingExcerpt,
        atomIds,
        recentBlocks: opts.recentBlocks,
      });

      // Streamed render (§4.3): token-progressive deltas, Zod parse on stream end.
      const streamWork = async () => {
        for await (const ev of this.ai.streamText({
          purpose: 'learn_render',
          tier,
          system: `${system}\n\nReturn ONLY the JSON object — no markdown fences.`,
          user,
          maxOutputTokens: 1600,
        })) {
          if (ev.type === 'delta') {
            if (firstTokenMs == null) firstTokenMs = Date.now() - started;
            accumulated += ev.text;
            opts.onProgress?.({
              blockId: opts.blockId,
              text: accumulated,
              firstTokenMs: firstTokenMs ?? undefined,
            });
          } else if (ev.type === 'done') {
            const cleaned = accumulated
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```$/i, '')
              .trim();
            const parsed = blockV1Schema.parse(JSON.parse(cleaned));
            const sanitized = await this.sanitizeAtomIds(parsed, opts.learnTopicId);
            await this.callLog.log(principal, 'learn_render', ev.usage, {
              sessionId: opts.sessionId,
              blockId: opts.blockId,
              blockSeq: opts.blockSeq,
              promptVersion: RENDER_PROMPT_VERSION,
              speculative: opts.speculative,
              firstTokenMs: firstTokenMs ?? undefined,
              outcome: 'ok',
            });
            return sanitized;
          }
        }
        throw new Error('render_stream_ended_without_done');
      };

      const result = await Promise.race([
        streamWork(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('render_timeout')), RENDER_TIMEOUT_MS),
        ),
      ]);

      return { block: result, degraded: false, firstTokenMs };
    } catch {
      // One retry via blocking completeJson with Zod errors quoted (provider retry), then fallback.
      try {
        const { result, usage } = await Promise.race([
          this.ai.completeJson({
            purpose: 'learn_render',
            tier,
            system: buildRenderSystemPrompt(opts.plan.move),
            user: buildRenderUserPrompt({
              plan: opts.plan,
              topicTitle: opts.topicTitle,
              groundingExcerpt: opts.groundingExcerpt,
              atomIds,
              recentBlocks: opts.recentBlocks,
            }),
            schema: blockV1Schema,
            schemaName: 'BlockV1',
            maxOutputTokens: 1600,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('render_timeout')), RENDER_TIMEOUT_MS),
          ),
        ]);
        await this.callLog.log(principal, 'learn_render', usage, {
          sessionId: opts.sessionId,
          blockId: opts.blockId,
          blockSeq: opts.blockSeq,
          promptVersion: RENDER_PROMPT_VERSION,
          retry: true,
          speculative: opts.speculative,
          outcome: 'ok_retry',
        });
        return {
          block: await this.sanitizeAtomIds(result, opts.learnTopicId),
          degraded: false,
          firstTokenMs,
        };
      } catch {
        const usage = {
          inputTokens: 0,
          outputTokens: 0,
          model: 'fallback',
          durationMs: Date.now() - started,
        };
        await this.callLog.log(principal, 'learn_render', usage, {
          sessionId: opts.sessionId,
          blockId: opts.blockId,
          blockSeq: opts.blockSeq,
          promptVersion: RENDER_PROMPT_VERSION,
          error: 'render_failed',
          degraded: true,
          speculative: opts.speculative,
          firstTokenMs: firstTokenMs ?? undefined,
          outcome: 'degraded',
        });
        return {
          block: await this.fallbackBlock(opts.plan, opts.topicTitle, opts.learnTopicId),
          degraded: true,
          firstTokenMs,
        };
      }
    }
  }

  private async sanitizeAtomIds(block: BlockV1, learnTopicId?: string | null): Promise<BlockV1> {
    if (block.block_type !== 'question_set') return block;
    const ids = block.questions.map((q) => q.atom_id).filter(Boolean) as string[];
    const valid = await this.repo.filterValidAtomIds(learnTopicId, ids);
    if (learnTopicId) {
      const atoms = await this.repo.listConceptAtoms(learnTopicId);
      if (atoms.length) {
        return {
          ...block,
          questions: block.questions.map((q, i) => ({
            ...q,
            atom_id:
              q.atom_id && valid.has(q.atom_id)
                ? q.atom_id
                : atoms[Math.min(i, atoms.length - 1)]!.id,
          })),
        };
      }
    }
    return {
      ...block,
      questions: block.questions.map((q) => ({
        ...q,
        atom_id: q.atom_id && valid.has(q.atom_id) ? q.atom_id : null,
      })),
    };
  }

  async fallbackBlock(plan: PlanV1, topic: string, learnTopicId?: string | null): Promise<BlockV1> {
    const atoms = learnTopicId ? await this.repo.listConceptAtoms(learnTopicId) : [];
    const atomId = atoms[0]?.id;
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
      case 'prereq_pulse': {
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
              atom_id: atomId ?? null,
              difficulty: 'medium',
              why_md: 'The core idea is the foundation for everything else in this topic.',
            },
          ],
        });
      }
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
