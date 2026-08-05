import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const transportRenewalPayloadSchema = z.object({
  assignment_id: z.string().uuid(),
  term_months: z.number().int().min(1).max(12).default(12),
  reason: z.string().trim().max(400).optional().default(''),
});

export type TransportRenewalPayload = z.infer<typeof transportRenewalPayloadSchema>;

export const transportRenewalRequestType: RequestTypeConfig<TransportRenewalPayload> = {
  key: 'transport_renewal',
  label: 'Renew transport pass',
  humanCodePrefix: 'TR',
  category: 'campus',
  entrySurface: 'transport',
  payloadSchema: transportRenewalPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'transport_coordinator' },
  slaDays: 5,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: true,
  feeLine: { label: 'Transport renewal', amountMinor: 500_000, category: 'transport' },
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'transport_renewal',
  notifications: {},
  summaryLine: (p) => `Renew transport · ${p.term_months} mo`,
};
