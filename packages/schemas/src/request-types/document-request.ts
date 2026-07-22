import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const REQUEST_DOCUMENT_TYPES = ['bonafide', 'transcript', 'migration', 'conduct'] as const;

export const documentRequestPayloadSchema = z
  .object({
    /** Catalog subtype — defaults to doc_type for backward compatibility. */
    subtypeKey: z.string().trim().min(1).max(64).optional(),
    doc_type: z.enum(REQUEST_DOCUMENT_TYPES),
    purpose: z.enum(['bank_loan', 'visa', 'passport', 'scholarship', 'other']).optional(),
    purpose_text: z.string().trim().max(500).optional().default(''),
    copies: z.number().int().min(1).max(5).optional(),
    deliveryMode: z.enum(['digital', 'physical_pickup']).optional(),
    delivery: z.literal('digital').default('digital'),
  })
  .superRefine((value, ctx) => {
    if (value.doc_type === 'bonafide' && !value.purpose) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purpose'], message: 'Choose a purpose' });
    }
    if (
      value.doc_type === 'bonafide' &&
      value.purpose === 'other' &&
      value.purpose_text.trim().length < 3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purpose_text'],
        message: 'Tell us what the document is for',
      });
    }
    if (value.doc_type === 'transcript' && value.copies === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['copies'], message: 'Choose the number of copies' });
    }
  });

export type DocumentRequestPayload = z.infer<typeof documentRequestPayloadSchema>;

export const documentRequestType: RequestTypeConfig<DocumentRequestPayload> = {
  key: 'document_request',
  label: 'Document request',
  humanCodePrefix: 'DC',
  category: 'documents',
  entrySurface: 'documents',
  payloadSchema: documentRequestPayloadSchema,
  payloadSchemaVersion: 2,
  routing: { role: 'registrar' },
  slaDays: 3,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  /** Resolved at API via document_catalog — package must not DB-lookup. */
  dynamicPolicy: 'document_catalog',
  producesDocument: true,
  bulkApprovable: false,
  notifications: {
    fulfilled: { title: '{label} {code} approved', body: 'Your document is ready.' },
  },
  summaryLine: (payload) => (payload.subtypeKey ?? payload.doc_type).replace(/_/g, ' '),
};
