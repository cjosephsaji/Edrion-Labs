import { z } from 'zod';
import { petrosLearningSessionDocumentSchema } from './petros-learning';
import { petrosKnowledgePolicySchema, petrosAdmissionDenialSchema } from './petros-knowledge-policy';

export const PETROS_QUESTION_EXECUTION_VERSION = 'petros.document-question-execution.v1' as const;
export const petrosQuestionExecutionSchema = z
  .object({
    schemaVersion: z.literal(PETROS_QUESTION_EXECUTION_VERSION),
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    version: z.number().int().positive(),
    attempts: z.number().int().min(0).max(3),
    processingEnabled: z.boolean(),
    retryable: z.boolean(),
    errorCode: z.string().max(80).nullable(),
    result: petrosLearningSessionDocumentSchema.nullable(),
    knowledgePolicy: petrosKnowledgePolicySchema.nullable().optional(),
    admission: petrosAdmissionDenialSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.state === 'succeeded') !== (value.result !== null) ||
      (value.result && value.result.id !== value.sessionId) ||
      (value.retryable && (value.state !== 'failed' || value.attempts >= 3)) ||
      (value.state === 'running' && value.attempts === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Question status must match its committed result and attempt state',
      });
    }
  });
export type PetrosQuestionExecution = z.infer<typeof petrosQuestionExecutionSchema>;
export const petrosQuestionExecutionCommandSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(['cancel', 'retry']),
  })
  .strict();
export const petrosQuestionJobSchema = z
  .object({
    id: z.string().uuid(),
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
  })
  .strict();
