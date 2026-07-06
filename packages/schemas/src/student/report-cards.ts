import { z } from 'zod';

export const reportCardEntrySchema = z.object({
  subjectLabel: z.string(),
  component: z.string().nullable(),
  marks: z.number().int(),
  maxMarks: z.number().int(),
  gradeLetter: z.string().nullable(),
  remarks: z.string().nullable(),
  credits: z.number().int().nullable(),
});

export const reportCardTermGroupSchema = z.object({
  yearLabel: z.string(),
  terms: z.array(
    z.object({
      id: z.string().uuid(),
      termLabel: z.string(),
      publishedAt: z.string().nullable(),
      kind: z.enum(['uploaded_pdf', 'structured']),
      superseded: z.boolean(),
    }),
  ),
});

export const reportCardListSchema = z.object({
  groups: z.array(reportCardTermGroupSchema),
  sgpaByTerm: z.record(z.string(), z.number()).optional(),
  cgpa: z.number().nullable().optional(),
});

export const reportCardDetailSchema = z.object({
  id: z.string().uuid(),
  termLabel: z.string(),
  kind: z.enum(['uploaded_pdf', 'structured']),
  publishedAt: z.string().nullable(),
  pdfObjectId: z.string().uuid().nullable(),
  entries: z.array(reportCardEntrySchema).optional(),
  gpa: z.number().nullable().optional(),
  supersededNote: z.string().nullable(),
});

export type ReportCardListDto = z.infer<typeof reportCardListSchema>;
export type ReportCardDetailDto = z.infer<typeof reportCardDetailSchema>;
