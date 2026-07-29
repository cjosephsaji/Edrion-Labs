import { z } from 'zod';
import { paginationQuerySchema, versionSchema } from './common';

/** Document generation (Petros Phase 4) contracts. */

export const DOC_TYPES = [
  'exam_paper',
  'assignment',
  'circular',
  'certificate',
  'letter',
  'report',
  'bonafide',
  'transcript',
  'migration',
  'conduct',
  'report_card',
  'hall_ticket',
  'id_card',
  'manual_upload',
  'fee_receipt',
  'fee_statement',
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const docTypeSchema = z.enum(DOC_TYPES);

/** Form-driven header configuration (raw HTML editing sits behind the "advanced" tab). */
export const headerConfigSchema = z
  .object({
    logoPosition: z.enum(['left', 'center', 'right', 'none']).default('left'),
    showInstitutionName: z.boolean().default(true),
    subtitle: z.string().trim().max(200).nullish(),
    // Exam-paper toggles/labels
    showDate: z.boolean().default(true),
    showTime: z.boolean().default(false),
    showDuration: z.boolean().default(true),
    showExaminer: z.boolean().default(false),
    showMaxMarks: z.boolean().default(true),
    showRollNumberBoxes: z.boolean().default(false),
    rollNumberBoxCount: z.number().int().min(0).max(16).default(0),
    instructions: z.string().trim().max(4000).nullish(),
    labels: z.record(z.string(), z.string().max(80)).default({}),
  })
  .partial()
  .default({});
export type HeaderConfig = z.infer<typeof headerConfigSchema>;

export const createDocumentTemplateSchema = z.object({
  docType: docTypeSchema,
  name: z.string().trim().min(1).max(160),
  html: z.string().min(1).max(200_000),
  css: z.string().max(100_000).default(''),
  fieldsSchema: z.record(z.string(), z.unknown()).default({}),
  headerConfig: headerConfigSchema,
  isDefault: z.boolean().default(false),
  requiresSignOff: z.boolean().default(false),
});
export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;

export const updateDocumentTemplateSchema = createDocumentTemplateSchema.partial().extend({
  version: versionSchema,
});
export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateSchema>;

export const documentTemplatesListQuerySchema = paginationQuerySchema.extend({
  docType: docTypeSchema.optional(),
});
export type DocumentTemplatesListQuery = z.infer<typeof documentTemplatesListQuerySchema>;

/** Render request: title + free-form field payload merged into the resolved template. */
export const createDocumentRenderSchema = z.object({
  docType: docTypeSchema,
  title: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()).default({}),
  templateId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});
export type CreateDocumentRenderInput = z.infer<typeof createDocumentRenderSchema>;

/** Live template preview (no persistence). */
export const previewDocumentTemplateSchema = z.object({
  html: z.string().min(1).max(200_000),
  css: z.string().max(100_000).default(''),
  headerConfig: headerConfigSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type PreviewDocumentTemplateInput = z.infer<typeof previewDocumentTemplateSchema>;

/** Vision format-capture: strict structured output the big model must produce. */
export const formatCaptureResultSchema = z.object({
  headerConfig: headerConfigSchema,
  suggestedName: z.string().max(160),
  notes: z.string().max(2000).nullable(),
});
export type FormatCaptureResult = z.infer<typeof formatCaptureResultSchema>;
