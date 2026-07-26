import { Injectable } from '@nestjs/common';
import { planV1Schema, type LearnEntryPoint, type PlanV1 } from '@edrion/schemas';

@Injectable()
export class MovePlannerService {
  planFirstMove(entryPoint: LearnEntryPoint): PlanV1 {
    const move =
      entryPoint === 'review_queue' ? 'retrieval_check' : ('direct_explanation' as const);
    const plan = {
      v: 1 as const,
      move,
      reasoning: `Opening move for ${entryPoint}`,
    };
    return planV1Schema.parse(plan);
  }
}
