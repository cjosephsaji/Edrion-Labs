// Frozen verbatim reader from 89c1ca2:packages/schemas/src/petros-learning.ts.
// This fixture must not import the new retrieval contract.
import { z } from 'zod';

export const petrosDetourSchema = z
  .object({
    id: z.string().uuid(),
    observationId: z.string().uuid(),
    question: z.string().max(2_000),
    status: z.enum(['pending', 'active', 'parked', 'clarifying', 'rejoined']),
    action: z.enum(['pending', 'answer_now', 'clarify', 'park', 'change_subgoal']),
    acknowledgement: z.string().nullable(),
    routeChange: z.string().nullable(),
    returnPlan: z.string().nullable(),
    changedDecisionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    rejoinedAt: z.string().datetime().nullable(),
  })
  .strict();
