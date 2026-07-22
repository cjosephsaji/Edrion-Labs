import { z } from 'zod';
import { revaluationApproveFormSchema } from '../grading/dto';
import type { RequestTypeConfig } from './types';

export const revaluationPayloadSchema = z.object({
  grade_entry_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  current_score: z.number().int(),
  reason: z.enum(['total_recheck', 'revaluation']),
  note: z.string().trim().max(500).default(''),
});

export type RevaluationPayload = z.infer<typeof revaluationPayloadSchema>;

export const revaluationRequestType: RequestTypeConfig<RevaluationPayload> = {
  key: 'revaluation',
  label: 'Revaluation',
  humanCodePrefix: 'RV',
  category: 'academics',
  entrySurface: 'results',
  payloadSchema: revaluationPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'exams_office' },
  slaDays: 10,
  cancellableStatuses: ['draft', 'submitted'],
  requiresPayment: true,
  feeLine: { label: 'Revaluation fee', amountMinor: 50_000, category: 'exam' },
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'revaluation',
  approveFormSchema: revaluationApproveFormSchema,
  notifications: {},
  summaryLine: (payload) => `Revaluation · score ${payload.current_score}`,
};
