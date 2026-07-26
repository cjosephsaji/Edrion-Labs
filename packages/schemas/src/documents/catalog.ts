import { z } from 'zod';

export const documentFamilySchema = z.enum([
  'certificate',
  'transcript',
  'receipt',
  'hall_ticket',
  'id_card',
  'report_card',
  'letter',
]);

export const documentCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  institution_id: z.string().uuid(),
  subtype_key: z.string(),
  family: documentFamilySchema,
  doc_type: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  active: z.boolean(),
  fee_amount_minor: z.number().int().nonnegative(),
  requires_payment: z.boolean(),
});

export type DocumentCatalogEntry = z.infer<typeof documentCatalogEntrySchema>;
