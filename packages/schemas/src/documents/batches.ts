import { z } from 'zod';
import { versionSchema } from '../common';
import { batchKindSchema, batchStatusSchema } from './catalog';

export const createDocumentBatchSchema = z.object({
  kind: batchKindSchema,
  templateId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
  scope: z.record(z.string(), z.unknown()).default({}),
});
export type CreateDocumentBatchInput = z.infer<typeof createDocumentBatchSchema>;

export const documentBatchActionSchema = z.object({
  version: versionSchema,
  acknowledgePreview: z.boolean().optional(),
});

export const manualUploadMapSchema = z.object({
  version: versionSchema,
  mappings: z
    .array(
      z.object({
        storageKey: z.string().trim().min(1).max(500),
        regNo: z.string().trim().min(1).max(80),
        filename: z.string().trim().max(260).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ManualUploadMapInput = z.infer<typeof manualUploadMapSchema>;

export const issuanceRegisterQuerySchema = z.object({
  verifyCode: z.string().trim().min(4).max(32).optional(),
  q: z.string().trim().max(120).optional(),
});
export type IssuanceRegisterQuery = z.infer<typeof issuanceRegisterQuerySchema>;

export const issuancePickupSchema = z.object({
  pickupNote: z.string().trim().max(1000).optional(),
});

export const issuanceReissueSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const batchCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  rendered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  signed: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
});

export const documentBatchResponseSchema = z.object({
  id: z.string().uuid(),
  kind: batchKindSchema,
  status: batchStatusSchema,
  counts: batchCountsSchema,
  version: z.number().int(),
  lockedAt: z.string().datetime().nullable().optional(),
});
