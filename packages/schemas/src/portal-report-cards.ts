import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema } from './common';

export const createReportCardSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    termId: z.string().uuid().nullish(),
    termLabel: z.string().trim().min(1).max(80),
    kind: z.enum(['uploaded_pdf', 'structured']),
    academicYearId: z.string().uuid().nullish(),
  })
  .refine((v) => Boolean(v.studentId) !== Boolean(v.classId), {
    message: 'Provide exactly one of studentId or classId',
  });

export const reportCardEntryInputSchema = z.object({
  subjectLabel: z.string().trim().min(1),
  component: z.string().nullish(),
  marks: z.number().int().min(0),
  maxMarks: z.number().int().min(1),
  gradeLetter: z.string().nullish(),
  remarks: z.string().nullish(),
  credits: z.number().int().min(0).nullish(),
  sequence: z.number().int().default(0),
});

export const upsertReportCardEntriesSchema = z.object({
  entries: z.array(reportCardEntryInputSchema),
});

export const importReportCardGradesSchema = z.object({
  examId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

export const reportCardsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});

export type CreateReportCardInput = z.infer<typeof createReportCardSchema>;
export type UpsertReportCardEntriesInput = z.infer<typeof upsertReportCardEntriesSchema>;
export type ReportCardsListQuery = z.infer<typeof reportCardsListQuerySchema>;
