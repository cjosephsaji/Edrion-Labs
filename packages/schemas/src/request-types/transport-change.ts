import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const transportChangePayloadSchema = z.object({
  assignment_id: z.string().uuid(),
  requested_route_id: z.string().uuid().optional(),
  requested_stop: z.string().trim().min(2).max(120).optional(),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reason: z.string().trim().min(10).max(400),
});

export type TransportChangePayload = z.infer<typeof transportChangePayloadSchema>;

export const transportChangeRequestType: RequestTypeConfig<TransportChangePayload> = {
  key: 'transport_change',
  label: 'Transport route change',
  humanCodePrefix: 'TC',
  category: 'campus',
  entrySurface: 'transport',
  payloadSchema: transportChangePayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'transport_coordinator' },
  slaDays: 3,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  notifications: {},
  summaryLine: (p) => p.reason.slice(0, 60),
};
