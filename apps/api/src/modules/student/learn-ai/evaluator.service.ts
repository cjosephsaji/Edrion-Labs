import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { ApiEnv } from '@edrion/config';
import type { CheckpointBlock, PracticeItemBlock } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { API_ENV, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from './provider';
import { BudgetsService } from './budgets.service';
import { LearnAiCallLogger } from './learn-ai-call.logger';

export interface EvaluationResult {
  correct: boolean;
  accepted?: boolean;
  feedback: string;
  evidenceNote?: string;
  transcription?: string;
  evidenceTags?: string[];
}

const evalSchema = z.object({
  correct: z.boolean().optional(),
  accepted: z.boolean().optional(),
  feedback: z.string().optional(),
  evidenceNote: z.string().optional(),
  transcription: z.string().optional(),
});

function normalizeEval(
  result: z.infer<typeof evalSchema>,
  fallbackFeedback: string,
): EvaluationResult {
  const accepted = result.accepted ?? result.correct ?? false;
  return {
    correct: result.correct ?? accepted,
    accepted,
    feedback: result.feedback?.trim() || fallbackFeedback,
    evidenceNote: result.evidenceNote,
    transcription: result.transcription,
  };
}

@Injectable()
export class EvaluatorService {
  private readonly logger = new Logger(EvaluatorService.name);

  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  async evaluateCheckpointMcq(
    block: CheckpointBlock,
    choice: string,
  ): Promise<EvaluationResult> {
    const option = block.options.find((o) => o.key === choice);
    if (!option) {
      return { correct: false, feedback: 'Please select one of the options.' };
    }
    if (option.correct) {
      return { correct: true, feedback: 'Correct — practice unlocked.', evidenceNote: 'Checkpoint passed on MCQ' };
    }
    return {
      correct: false,
      feedback: option.feedbackWrong ?? 'Not quite — read the diagnostic hint and try again.',
    };
  }

  async evaluateCheckpointExplain(
    principal: StudentPrincipal,
    block: CheckpointBlock,
    explanation: string,
  ): Promise<EvaluationResult> {
    if (explanation.trim().length < 12) {
      return { correct: false, accepted: false, feedback: 'Say a bit more — at least a sentence or two.' };
    }
    if (!this.ai.available) {
      const accepted = explanation.trim().length >= 20;
      return {
        correct: accepted,
        accepted,
        feedback: accepted ? 'Good explanation — practice unlocked.' : 'Try connecting the idea to an example from the lesson.',
      };
    }
    await this.budgets.spend(principal, 'evaluate', 600);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'evaluate',
        tier: 'small',
        system:
          'Evaluate explain-back answers. Be encouraging and diagnostic. No scores. ' +
          'Return JSON with accepted (boolean) and feedback (string). Set accepted:true when the student demonstrates understanding.',
        user: `Prompt: ${block.explainPrompt}\nStudent: ${explanation}`,
        schema: evalSchema,
        schemaName: 'checkpoint_eval',
        maxOutputTokens: 800,
        reasoningEffort: 'minimal',
      });
      await this.callLog.log(principal, 'evaluate', usage);
      return normalizeEval(
        result,
        'Thanks — compare your explanation with the concept card if anything still feels fuzzy.',
      );
    } catch (err) {
      this.logger.error(`Checkpoint explain evaluation failed: ${(err as Error).message}`);
      const accepted = explanation.trim().length >= 20;
      return {
        correct: accepted,
        accepted,
        feedback: accepted
          ? 'Good explanation — practice unlocked.'
          : 'Try connecting the idea to an example from the lesson.',
      };
    }
  }

  async evaluatePractice(
    principal: StudentPrincipal,
    block: PracticeItemBlock,
    answer: string,
    images?: { objectId: string; base64: string; mimeType: string }[],
  ): Promise<EvaluationResult> {
    if (!this.ai.available) {
      const trimmed = answer.trim().toLowerCase();
      const ok = trimmed.length >= 1;
      return {
        correct: ok,
        feedback: ok ? 'Looks reasonable — compare with the worked example.' : 'Write your answer and try again.',
      };
    }
    const tier = images?.length ? 'vision' : 'small';
    await this.budgets.spend(principal, images?.length ? 'vision' : 'evaluate', 800);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: images?.length ? 'vision' : 'evaluate',
        tier,
        system:
          'Evaluate practice answers. Diagnostic feedback only — no scores or percentages. ' +
          'Return JSON with correct (boolean) and feedback (string).',
        user: `Problem: ${block.statement}\nExpected form: ${block.expectedForm ?? 'any clear answer'}\nStudent answer: ${answer}`,
        images,
        schema: evalSchema,
        schemaName: 'practice_eval',
        maxOutputTokens: 800,
        reasoningEffort: 'minimal',
      });
      await this.callLog.log(principal, tier === 'vision' ? 'vision' : 'evaluate', usage);
      const ok = Boolean(result.correct ?? result.accepted);
      return normalizeEval(
        result,
        ok ? 'Nice work — that looks right.' : 'Not quite — use the hints and worked example, then try again.',
      );
    } catch (err) {
      this.logger.error(`Practice evaluation failed: ${(err as Error).message}`);
      const trimmed = answer.trim();
      const ok = trimmed.length >= 3;
      return {
        correct: ok,
        feedback: ok
          ? 'Auto-check is unavailable right now — compare your answer with the worked example.'
          : 'Write a fuller answer and try again.',
      };
    }
  }

  async evaluateReflection(): Promise<EvaluationResult> {
    return { correct: true, feedback: 'Reflection recorded.' };
  }

  async evaluateMockBatch(
    principal: StudentPrincipal,
    items: Array<{
      qtype: 'mcq' | 'short' | 'long';
      prompt: string;
      correctKey?: string | null;
      markingNote?: string | null;
      choiceKey?: string | null;
      answerText?: string | null;
      photoObjectId?: string | null;
    }>,
    imagesByObjectId?: Map<string, { base64: string; mimeType: string }>,
  ): Promise<Array<{ correct: boolean; note?: string }>> {
    const out: Array<{ correct: boolean; note?: string }> = [];
    for (const item of items) {
      if (item.qtype === 'mcq') {
        const correct = !!item.correctKey && item.choiceKey === item.correctKey;
        out.push({ correct, note: correct ? undefined : 'Review this topic.' });
        continue;
      }
      if (item.photoObjectId && imagesByObjectId?.has(item.photoObjectId)) {
        const img = imagesByObjectId.get(item.photoObjectId)!;
        if (!this.ai.available) {
          out.push({ correct: false, note: 'Photo recorded — review after the test.' });
          continue;
        }
        await this.budgets.spend(principal, 'mock_eval', 1200);
        try {
          const { result, usage } = await this.ai.completeJson({
            purpose: 'mock_eval',
            tier: 'vision',
            system: 'Evaluate handwritten work. Return correct boolean and short qualitative note only.',
            user: `Question: ${item.prompt}\nMarking: ${item.markingNote ?? ''}`,
            images: [{ objectId: item.photoObjectId, ...img }],
            schema: mockEvalSchema,
            schemaName: 'mock_eval',
            maxOutputTokens: 300,
          });
          await this.callLog.log(principal, 'mock_eval', usage);
          out.push({ correct: result.correct, note: result.note });
        } catch (err) {
          const status = (err as { status?: number }).status;
          const message = (err as Error).message ?? String(err);
          const modelId = this.env.OPENAI_BIG_MODEL;
          this.logger.error(
            `OpenAI error (model=${modelId}, status=${status ?? 'n/a'}): ${message}; falling back to heuristic routing`,
          );
          out.push({ correct: false, note: 'Could not read the photo.' });
        }
        continue;
      }
      if (!item.answerText?.trim()) {
        out.push({ correct: false, note: 'No answer given.' });
        continue;
      }
      if (!this.ai.available) {
        out.push({ correct: item.answerText.trim().length > 2, note: 'Answer recorded.' });
        continue;
      }
      await this.budgets.spend(principal, 'mock_eval', 500);
      try {
        const { result, usage } = await this.ai.completeJson({
          purpose: 'mock_eval',
          tier: 'small',
          system: 'Grade answers qualitatively. No scores or percentages.',
          user: `Question: ${item.prompt}\nMarking: ${item.markingNote ?? ''}\nAnswer: ${item.answerText}`,
          schema: mockEvalSchema,
          schemaName: 'mock_eval',
          maxOutputTokens: 250,
        });
        await this.callLog.log(principal, 'mock_eval', usage);
        out.push({ correct: result.correct, note: result.note });
      } catch (err) {
        const status = (err as { status?: number }).status;
        const message = (err as Error).message ?? String(err);
        const modelId = this.env.OPENAI_SMALL_MODEL;
        this.logger.error(
          `OpenAI error (model=${modelId}, status=${status ?? 'n/a'}): ${message}; falling back to heuristic routing`,
        );
        out.push({ correct: false, note: 'Answer recorded.' });
      }
    }
    return out;
  }

  async evaluateQuizItems(
    principal: StudentPrincipal,
    items: Array<{
      qtype: 'mcq' | 'short';
      correctKey?: string;
      markingNote?: string;
      choiceKey?: string;
      answerText?: string;
    }>,
  ): Promise<{ total: number; correct: number; notes: string[] }> {
    const evals = await this.evaluateMockBatch(
      principal,
      items.map((i) => ({ ...i, qtype: i.qtype, prompt: '' })),
    );
    const notes = evals.map((e) => e.note).filter((n): n is string => !!n);
    return { total: items.length, correct: evals.filter((e) => e.correct).length, notes };
  }
}

const mockEvalSchema = z.object({
  correct: z.boolean(),
  note: z.string().optional(),
});
