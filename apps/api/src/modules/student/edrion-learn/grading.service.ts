import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { StudentPrincipal } from '../student.types';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import { PROMPT_VERSION } from '../learn-ai/prompts/version';

const gradeResultSchema = z.object({
  correct: z.boolean().nullable(),
  feedback: z.string().max(500),
});

const synthesisGradeSchema = z.object({
  tightened: z.string().max(400),
  note: z.string().max(300).optional(),
});

@Injectable()
export class GradingService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  async grade(
    principal: StudentPrincipal,
    opts: {
      sessionId: string;
      blockId: string;
      questionId: string;
      promptMd: string;
      expectedAnswer?: string;
      response: unknown;
    },
  ): Promise<{ correct: boolean | null; feedback: string }> {
    const text =
      typeof opts.response === 'object' && opts.response !== null && 'text' in opts.response
        ? String((opts.response as { text: string }).text)
        : typeof opts.response === 'object' && opts.response !== null && 'value' in opts.response
          ? String((opts.response as { value: string | number }).value)
          : String(opts.response ?? '');

    if (!this.ai.available) {
      return { correct: null, feedback: "Recorded — couldn't auto-check this one." };
    }

    const started = Date.now();
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_grade',
        tier: 'small',
        system: 'Grade a student short answer. Output JSON {correct: boolean|null, feedback: string}.',
        user: JSON.stringify({
          question: opts.promptMd,
          expected: opts.expectedAnswer,
          student_answer: text.slice(0, 500),
        }),
        schema: gradeResultSchema,
        schemaName: 'LearnGrade',
        maxOutputTokens: 120,
      });
      await this.callLog.log(principal, 'learn_grade', usage, {
        sessionId: opts.sessionId,
        blockId: opts.blockId,
        promptVersion: PROMPT_VERSION,
      });
      return result;
    } catch {
      await this.callLog.log(
        principal,
        'learn_grade',
        { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: Date.now() - started },
        { sessionId: opts.sessionId, blockId: opts.blockId, error: 'grade_failed' },
      );
      return { correct: null, feedback: "Recorded — couldn't auto-check this one." };
    }
  }

  async gradeSynthesis(
    principal: StudentPrincipal,
    opts: { sessionId: string; blockId: string; promptMd: string; text: string },
  ): Promise<{ tightened: string; note?: string }> {
    const student = opts.text.trim().slice(0, 280);
    if (!student) {
      return { tightened: opts.text, note: 'Empty synthesis.' };
    }
    if (!this.ai.available) {
      return { tightened: student };
    }
    const started = Date.now();
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_grade',
        tier: 'small',
        system:
          'Tighten a student synthesis in one or two sentences. Output JSON {tightened, note?}. Keep their meaning; improve clarity.',
        user: JSON.stringify({ prompt: opts.promptMd, student_synthesis: student }),
        schema: synthesisGradeSchema,
        schemaName: 'LearnSynthesisGrade',
        maxOutputTokens: 180,
      });
      await this.callLog.log(principal, 'learn_grade', usage, {
        sessionId: opts.sessionId,
        blockId: opts.blockId,
        promptVersion: PROMPT_VERSION,
        outcome: 'synthesis',
      });
      return result;
    } catch {
      await this.callLog.log(
        principal,
        'learn_grade',
        { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: Date.now() - started },
        { sessionId: opts.sessionId, blockId: opts.blockId, error: 'synthesis_grade_failed' },
      );
      return { tightened: student };
    }
  }
}
