import { z } from 'zod';

export const publicDocumentVerifyProjectionSchema = z.object({
  code: z.string(),
  title: z.string(),
  doc_type: z.string(),
  status: z.enum(['valid', 'revoked', 'superseded']),
  issued_at: z.string().datetime().optional(),
  issuer_initials: z.string().optional(),
  show_full_name: z.boolean().default(false),
});
