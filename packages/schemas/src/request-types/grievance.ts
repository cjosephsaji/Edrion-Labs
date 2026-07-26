import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const grievancePayloadSchema = z.object({
  category: z.enum(['academic', 'facilities', 'conduct', 'other']),
  subject: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(4000),
  desired_outcome: z.string().trim().max(500).optional(),
});

export const grievanceRequestType: RequestTypeConfig<z.infer<typeof grievancePayloadSchema>> = {
  key: 'grievance',
  label: 'Formal grievance',
  humanCodePrefix: 'GR',
  category: 'campus',
  payloadSchema: grievancePayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'grievance_officer' },
  slaDays: 10,
  cancellableStatuses: ['submitted'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  notifications: {},
  summaryLine: (p) => p.subject,
};
