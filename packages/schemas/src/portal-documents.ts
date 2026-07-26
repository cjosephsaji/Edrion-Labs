import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-portal Documents & Policies (Administration) request contracts. A document is metadata
 * + an external https `url` for now (no file-storage service yet). Reads need `documents.view`;
 * writes the sensitive `documents.manage`.
 */
export const DOCUMENT_CATEGORIES = ['policy', 'handbook', 'form', 'other'] as const;

const httpsUrl = z
  .string()
  .trim()
  .url('Enter a valid URL')
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) link');

export const portalDocumentsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  published: z.enum(['true', 'false']).optional(),
});
export type PortalDocumentsListQuery = z.infer<typeof portalDocumentsListQuerySchema>;

export const createPortalDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  category: z.enum(DOCUMENT_CATEGORIES).default('policy'),
  description: z.string().trim().max(2000).nullish(),
  url: httpsUrl,
  requiresAck: z.coerce.boolean().default(false),
  published: z.coerce.boolean().default(false),
});
export type CreatePortalDocumentInput = z.infer<typeof createPortalDocumentSchema>;

export const updatePortalDocumentSchema = createPortalDocumentSchema.partial().extend({ version: versionSchema });
export type UpdatePortalDocumentInput = z.infer<typeof updatePortalDocumentSchema>;
