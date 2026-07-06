import { z } from 'zod';
import { aiPolicySchema } from './student/homework';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

export const homeworkQuestionInputSchema = z.object({
  promptText: z.string().max(10000).nullish(),
  promptImageObjectId: z.string().uuid().nullish(),
  maxMarks: z.number().int().min(0).max(1000).nullish(),
});

export const createHomeworkSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000).nullish(),
  dueAt: z.string().datetime(),
  aiPolicy: aiPolicySchema.default('off'),
  questions: z.array(homeworkQuestionInputSchema).min(1),
  assignees: z.array(z.string().uuid()).optional(),
});

export const updateHomeworkSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(5000).nullish(),
  dueAt: z.string().datetime().optional(),
  aiPolicy: aiPolicySchema.optional(),
  version: versionSchema,
});

export const returnHomeworkSubmissionSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      teacherMarks: z.number().int().min(0).nullish(),
      teacherFeedback: z.string().max(2000).nullish(),
    }),
  ),
  totalMarks: z.number().int().min(0).nullish(),
  totalMax: z.number().int().min(0).nullish(),
  teacherNote: z.string().max(2000).nullish(),
});

export const homeworkListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  classId: z.string().uuid().optional(),
  status: z.enum(['draft', 'assigned', 'closed']).optional(),
});

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type ReturnHomeworkSubmissionInput = z.infer<typeof returnHomeworkSubmissionSchema>;
export type HomeworkListQuery = z.infer<typeof homeworkListQuerySchema>;
