import { z } from 'zod';
import { conceptPinSchema, teachingReferenceSchema, v2Key, v2Uuid } from './content';
import { authorizedTeachingActionSchema } from './teaching-actions';
import { releaseScopePinSchema } from './proposal';
export const teachingDecisionSchema = z.object({ schemaVersion: z.literal('petros.v2.decision.v1'),
  id: v2Uuid, objective: conceptPinSchema, scope: releaseScopePinSchema,
  proposedAction: authorizedTeachingActionSchema.nullable(), evidenceRefs: z.array(v2Uuid).max(32),
  hypothesisRefs: z.array(v2Uuid).max(16), sources: z.array(teachingReferenceSchema).max(24),
  expectedObservation: z.string().max(2000), branches: z.array(z.object({ observation: v2Key, nextActionFamily: v2Key }).strict()).max(8),
  studentExplanation: z.string().max(2000), origin: z.enum(['deterministic_policy', 'model_proposal', 'teacher']),
  termination: z.enum(['complete', 'budget', 'student_stop', 'scope_unavailable']).nullable(),
  abstention: z.enum(['unsupported', 'uncertain', 'no_source', 'no_review']).nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.proposedAction === null && v.termination === null && v.abstention === null)
    ctx.addIssue({ code: 'custom', message: 'Decision requires action or stop reason' });
  if (v.origin === 'model_proposal' && v.proposedAction?.operation.type === 'evaluate_submission')
    ctx.addIssue({ code: 'custom', message: 'Model decisions cannot invoke assessment' });
});
export const modelTeachingDecisionSchema = teachingDecisionSchema.refine(d => d.origin === 'model_proposal',
  'Model output cannot impersonate deterministic policy or teacher authority');
