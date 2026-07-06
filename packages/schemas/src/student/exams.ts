import { z } from 'zod';

export const institutionalExamSchema = z.object({
  examName: z.string(),
  subject: z.string().nullable(),
  date: z.string(),
  time: z.string().nullable(),
  hall: z.string().nullable(),
  seatInfo: z.string().nullable(),
  syllabusNote: z.string().nullable(),
  daysUntil: z.number().int(),
});

export const studentExamsSchema = z.object({
  items: z.array(institutionalExamSchema),
});

export const examGoalSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  examDate: z.string(),
  syllabusTopics: z.array(z.string()),
  status: z.enum(['active', 'done', 'archived']),
  daysUntil: z.number().int(),
});

export const createExamGoalSchema = z.object({
  name: z.string().trim().min(1).max(160),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  syllabusTopics: z.array(z.string().trim().min(1)).default([]),
});

export const updateExamGoalSchema = createExamGoalSchema.partial().extend({
  status: z.enum(['active', 'done', 'archived']).optional(),
  version: z.number().int().min(1),
});

export type StudentExamsDto = z.infer<typeof studentExamsSchema>;
export type CreateExamGoalInput = z.infer<typeof createExamGoalSchema>;
export type UpdateExamGoalInput = z.infer<typeof updateExamGoalSchema>;
