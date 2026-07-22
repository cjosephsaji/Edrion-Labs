import { Injectable } from '@nestjs/common';
import type { SchedulerResult } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { ExamBoostResolver } from './exam-boost.resolver';

@Injectable()
export class ExamBoostService {
  constructor(private readonly resolver: ExamBoostResolver) {}

  async applyCap(
    principal: StudentPrincipal,
    deckId: string,
    result: SchedulerResult,
    reviewedAt: Date,
  ): Promise<Date> {
    const boost = await this.resolver.resolveForDeck(principal, deckId);
    if (!boost) return result.fsrsDueAt;
    const daysOut = Math.ceil((boost.examDate.getTime() - reviewedAt.getTime()) / 86_400_000);
    if (daysOut <= 0 || daysOut > 14) return result.fsrsDueAt;
    const capDays = Math.max(1, Math.ceil(daysOut / 2));
    const capped = new Date(reviewedAt.getTime() + capDays * 86_400_000);
    return result.fsrsDueAt.getTime() <= capped.getTime() ? result.fsrsDueAt : capped;
  }
}
