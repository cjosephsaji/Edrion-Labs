import { z } from 'zod';
import { aiPolicySchema } from './homework';

export const assignmentListFilterSchema = z.enum(['all', 'progress', 'submitted', 'returned']);
export type AssignmentListFilter = z.infer<typeof assignmentListFilterSchema>;

export const studentAssignmentListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  courseCode: z.string().nullable(),
  professorName: z.string().nullable(),
  dueLabel: z.string(),
  badge: z.object({ label: z.string(), tone: z.string() }),
  status: z.string(),
  late: z.boolean(),
  latePenaltyLabel: z.string().nullable(),
});

export const assignmentVersionSchema = z.object({
  versionNo: z.number().int(),
  submittedAt: z.string(),
  late: z.boolean(),
  note: z.string().nullable(),
});

const studentAssignmentDetailBaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  instructions: z.string().nullable(),
  dueDate: z.string().nullable(),
  maxPoints: z.number().int(),
});

export const studentQuizAssignmentDetailSchema = studentAssignmentDetailBaseSchema.extend({
  deliveryMode: z.literal('quiz'),
});

export const studentFileAssignmentDetailSchema = studentAssignmentDetailBaseSchema.extend({
  deliveryMode: z.literal('file'),
  aiPolicy: aiPolicySchema,
  attachmentUrls: z.array(z.object({ objectId: z.string().uuid(), url: z.string() })),
  latePolicyLine: z.string().nullable(),
  allowResubmission: z.boolean(),
  status: z.string(),
  versions: z.array(assignmentVersionSchema),
  pointsAwarded: z.number().int().nullable(),
  feedback: z.string().nullable(),
});

export const studentAssignmentDetailSchema = z.discriminatedUnion('deliveryMode', [
  studentQuizAssignmentDetailSchema,
  studentFileAssignmentDetailSchema,
]);

export const submitAssignmentSchema = z
  .object({
    fileObjectIds: z.array(z.string().uuid()).default([]),
    note: z.string().max(2000).nullish(),
  })
  .superRefine((value, ctx) => {
    if (!value.fileObjectIds.length && !value.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileObjectIds'],
        message: 'Attach a file or include a submission note',
      });
    }
  });

export type StudentAssignmentListItemDto = z.infer<typeof studentAssignmentListItemSchema>;
export type StudentAssignmentDetailDto = z.infer<typeof studentAssignmentDetailSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
