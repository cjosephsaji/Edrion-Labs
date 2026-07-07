import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { QuickAnswerDto, QuickAnswerInput } from '@edrion/schemas';
import { LEARN_AI_PROVIDER, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { LearnRepository } from './learn.repository';

const quickOutputSchema = z.object({
  answerShort: z.string(),
  answerDetail: z.string(),
  visual: z.record(z.unknown()).optional(),
  visualOffer: z.boolean(),
});

@Injectable()
export class QuickService {
  constructor(
    private readonly repo: LearnRepository,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async create(principal: StudentPrincipal, input: QuickAnswerInput): Promise<QuickAnswerDto> {
    let answerShort = 'Here is a concise answer.';
    let answerDetail = `Regarding "${input.question}", this is a quick explanation without a full lesson attached.`;
    let visual: Record<string, unknown> | undefined;
    let visualOffer = false;

    if (this.ai.available) {
      await this.budgets.spend(principal, 'quick', 800);
      const { result, usage } = await this.ai.completeJson({
        purpose: 'quick',
        tier: 'small',
        system: 'Answer briefly. No lesson plan. No scores. Return answerShort, answerDetail, optional visual svgSpec, visualOffer boolean.',
        user: input.question,
        schema: quickOutputSchema,
        schemaName: 'quick_answer',
        maxOutputTokens: 8192,
      });
      await this.callLog.log(principal, 'quick', usage);
      answerShort = result.answerShort;
      answerDetail = result.answerDetail;
      visual = result.visual;
      visualOffer = result.visualOffer;
    }

    const owner =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : {
            institutionId: null,
            studentId: null,
            independentUserId: principal.independentUserId,
          };

    const row = await this.repo.createQuickAnswer({
      ...owner,
      question: input.question,
      answerShort,
      answerDetail,
      visual: visual ?? null,
      onLearningList: 0,
    });
    if (!row) throw new Error('Failed to create quick answer');

    await this.ledger.log({
      principal,
      eventType: 'quick.asked',
      payload: {
        quickId: row.id,
        question: input.question,
        routedFrom: input.from,
      },
    });

    return this.toDto(row, visualOffer);
  }

  async get(principal: StudentPrincipal, id: string): Promise<QuickAnswerDto> {
    const row = await this.repo.getQuickAnswer(principal, id);
    if (!row) throw new NotFoundException('Quick answer not found');
    return this.toDto(row);
  }

  async toggleLearningList(principal: StudentPrincipal, id: string, on: boolean): Promise<QuickAnswerDto> {
    const row = await this.repo.getQuickAnswer(principal, id);
    if (!row) throw new NotFoundException('Quick answer not found');
    const updated = await this.repo.updateQuickAnswer(id, { onLearningList: on ? 1 : 0 });
    if (!updated) throw new NotFoundException('Quick answer not found');
    return this.toDto(updated);
  }

  private toDto(
    row: {
      id: string;
      question: string;
      answerShort: string;
      answerDetail: string;
      visual: Record<string, unknown> | null;
      onLearningList: number;
      createdAt: Date;
    },
    visualOffer = false,
  ): QuickAnswerDto {
    return {
      id: row.id,
      question: row.question,
      answerShort: row.answerShort,
      answerDetail: row.answerDetail,
      visual: (row.visual as QuickAnswerDto['visual']) ?? undefined,
      visualOffer: Boolean(row.visual) || visualOffer,
      onLearningList: row.onLearningList === 1,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
