import { z } from 'zod';

export const documentBatchKindSchema = z.enum(['hall_ticket', 'id_card', 'report_card', 'manual_upload']);

export const documentBatchStatusSchema = z.enum([
  'draft',
  'generating',
  'review',
  'signing',
  'delivering',
  'completed',
  'completed_with_errors',
  'cancelled',
]);

export const createDocumentBatchSchema = z.object({
  kind: documentBatchKindSchema,
  campus_id: z.string().uuid().optional(),
  template_id: z.string().uuid().optional(),
  scope: z.record(z.unknown()).default({}),
});

export const reportCardReissueSchema = z.object({
  batch_item_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
});
