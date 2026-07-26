import { z } from 'zod';

/**
 * Admission info-request (staff-built custom form) contracts. Staff define fields; the parent submits
 * responses over a token-secured public link. File fields collect uploaded documents (multiple).
 */
export const INFO_FIELD_TYPES = ['text', 'textarea', 'select', 'mcq', 'date', 'file'] as const;

export const infoFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(60).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers or underscore'),
    label: z.string().trim().min(1, 'Required').max(200),
    type: z.enum(INFO_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    required: z.boolean().optional(),
    multiple: z.boolean().optional(),
  })
  .superRefine((f, ctx) => {
    if ((f.type === 'select' || f.type === 'mcq') && (!f.options || f.options.length < 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add at least one choice', path: ['options'] });
    }
  });
export type InfoFieldInput = z.infer<typeof infoFieldSchema>;

export const createInfoRequestSchema = z.object({
  message: z.string().trim().max(2000).nullish(),
  fields: z.array(infoFieldSchema).min(1, 'Add at least one field').max(30),
});
export type CreateInfoRequestInput = z.infer<typeof createInfoRequestSchema>;

/** Parent's answers, keyed by field key. Values are validated against the stored fields server-side. */
export const submitInfoResponsesSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
});
export type SubmitInfoResponsesInput = z.infer<typeof submitInfoResponsesSchema>;
