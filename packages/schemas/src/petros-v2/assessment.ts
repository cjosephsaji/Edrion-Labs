import { z } from 'zod';
import { teachingReferenceSchema, v2Hash, v2Key, v2Uuid, v2Version } from './content';
import { releaseScopePinSchema } from './proposal';

/** Public assessment DTOs contain only issued opaque references. Private schema is API-only. */
export const publicStudentTaskSchema = z.object({ schemaVersion: z.literal('petros.v2.public-task.v1'),
  taskId: v2Uuid, familyId: v2Key, familyVersion: v2Version, scope: releaseScopePinSchema,
  prompt: z.string().min(1).max(4000), sources: z.array(teachingReferenceSchema).max(16),
  responseKind: z.enum(['text', 'choice', 'number', 'canvas_snapshot']),
  choices: z.array(z.object({ id: v2Key, label: z.string().min(1).max(500) }).strict()).max(16),
  assessmentRef: v2Uuid,
}).strict();
export const committedResponseSchema = z.object({ schemaVersion: z.literal('petros.v2.committed-response.v1'),
  id: v2Uuid, taskId: v2Uuid, sessionId: v2Uuid, commandId: v2Uuid, responseHash: v2Hash,
  text: z.string().max(16000).nullable(), snapshotId: v2Uuid.nullable(), snapshotHash: v2Hash.nullable(),
  committedAt: z.string().datetime(), draftRevision: z.number().int().nonnegative(),
}).strict().refine(v => (v.snapshotId === null) === (v.snapshotHash === null) && (v.text !== null || v.snapshotId !== null), 'Committed response requires text or an exact snapshot hash');
export const criterionEvaluationSchema = z.object({ criterionId: v2Key,
  status: z.enum(['satisfied', 'not_satisfied', 'unsupported', 'abstained']),
  origin: z.enum(['trusted_kernel', 'qualified_reviewer', 'model_formative']),
  reason: z.string().min(1).max(1000), evidence: z.array(v2Uuid).max(16),
}).strict();
export const evidenceClassificationSchema = z.object({ exposure: z.enum(['unassisted', 'assisted', 'equivalent_repeat', 'unknown']),
  eligibility: z.enum(['formative_only', 'review_required', 'eligible', 'ineligible']),
  criteria: z.array(criterionEvaluationSchema).max(32), outsideHelp: z.enum(['unknown', 'observed', 'supervised']),
}).strict().refine(v => v.eligibility !== 'eligible' || (v.exposure === 'unassisted' && v.criteria.length > 0 &&
  v.criteria.every(c => c.status === 'satisfied' && c.origin !== 'model_formative')), 'Evidence cannot self-admit');
export function projectPublicTask(value: z.infer<typeof publicStudentTaskSchema>) {
  return publicStudentTaskSchema.parse(value);
}
