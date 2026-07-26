import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const idCardReissuePayloadSchema = z.object({
  reason: z.enum(['lost', 'damaged', 'details_changed']),
  reason_text: z.string().trim().max(400).optional().default(''),
});

export type IdCardReissuePayload = z.infer<typeof idCardReissuePayloadSchema>;

export const idCardReissueRequestType: RequestTypeConfig<IdCardReissuePayload> = {
  key: 'id_card_reissue',
  label: 'ID card reissue',
  humanCodePrefix: 'ID',
  category: 'campus',
  payloadSchema: idCardReissuePayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'registrar' },
  slaDays: 7,
  cancellableStatuses: ['submitted'],
  requiresPayment: false,
  producesDocument: true,
  bulkApprovable: false,
  approvalSideEffectKey: 'id_card_reissue',
  notifications: { fulfilled: { title: 'ID card ready', body: 'Your new ID card is ready in Documents.' } },
  summaryLine: (p) => `ID reissue · ${p.reason}`,
};
