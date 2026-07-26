import { planV1Schema, type LearnEntryPoint, type PlanV1 } from '@edrion/schemas';

/** Mirrors production MovePlannerService for offline eval (no Nest). */
export function planFirstMove(entryPoint: LearnEntryPoint): PlanV1 {
  const move =
    entryPoint === 'review_queue' ? 'retrieval_check' : ('direct_explanation' as const);
  return planV1Schema.parse({
    v: 1,
    move,
    reasoning: `Opening move for ${entryPoint}`,
  });
}
