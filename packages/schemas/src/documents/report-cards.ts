import { z } from 'zod';
import { versionSchema } from '../common';

export const reportCardValidateSchema = z.object({
  termId: z.string().uuid(),
  sectionIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ReportCardValidateInput = z.infer<typeof reportCardValidateSchema>;

export const reportCardCreateBatchSchema = reportCardValidateSchema.extend({
  templateId: z.string().uuid(),
  campusId: z.string().uuid().optional(),
});

export const reportCardFlagSchema = z.object({
  note: z.string().trim().min(3).max(500),
  version: versionSchema,
});

export const reportCardReviewCompleteSchema = z.object({
  version: versionSchema,
});

export const reportCardReissueSchema = z.object({
  batchItemId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  version: versionSchema,
});

export const reportCardRemarkUpsertSchema = z.object({
  termId: z.string().uuid(),
  studentId: z.string().uuid(),
  remark: z.string().trim().min(1).max(400),
  version: versionSchema.optional(),
});
