import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import type { StudentPrincipal } from '../student.types';

const ACADEMIC =
  /\b(math|maths|algebra|geometry|calculus|physics|chemistry|biology|history|geography|english|hindi|science|chapter|exam|revise|revision|cbse|ktu|class|grade|topic|notes|formula|theorem|cell|atom|force|energy|poem|essay|literature)\b/i;

const topicalityResultSchema = z.object({
  on_topic: z.boolean(),
  confidence: z.number(),
  category: z.string().nullable(),
});

/**
 * Student-scoped topicality pre-screen for manual exam topics.
 * Modeled on Petros topicality: cheap regex gate, then small-model classifier.
 * Declines do not generate an exam.
 */
@Injectable()
export class ExamTopicalityService {
  private readonly logger = new Logger(ExamTopicalityService.name);

  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
  ) {}

  async check(
    principal: StudentPrincipal,
    topic: string,
    subjectLabel?: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const text = topic.trim();
    if (text.length < 2) {
      return { ok: false, reason: 'Enter a topic that looks like something you study.' };
    }
    if (ACADEMIC.test(text) || (subjectLabel && ACADEMIC.test(subjectLabel))) {
      return { ok: true };
    }
    if (!this.ai.available) {
      // Fail open for academic-looking free text when AI is down — still block obvious junk.
      if (/buy|shop|game|movie|dating|crypto|nft/i.test(text)) {
        return { ok: false, reason: 'That does not look like a study topic.' };
      }
      return { ok: true };
    }
    try {
      await this.budgets.spend(principal, 'mock_gen', 200);
      const { result } = await this.ai.completeJson({
        purpose: 'mock_gen',
        tier: 'nano',
        system:
          'Classify whether a student wants an academic mock-exam topic. on_topic=true for school/college subjects. on_topic=false for shopping, entertainment, personal life, or harmful requests. Return JSON only.',
        user: `Subject: ${subjectLabel ?? 'unspecified'}\nTopic: ${text}`,
        schema: topicalityResultSchema,
        schemaName: 'exam_topicality',
        maxOutputTokens: 80,
      });
      if (!result.on_topic && result.confidence >= 0.7) {
        return {
          ok: false,
          reason: 'That topic is off the study path — pick something from your subjects or notes.',
        };
      }
      return { ok: true };
    } catch (e) {
      this.logger.warn(`exam topicality failed: ${e instanceof Error ? e.message : e}`);
      return { ok: true };
    }
  }
}
