import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const helpdeskTicketPayloadSchema = z.object({
  topic: z.enum(['it', 'facilities', 'library', 'other']),
  summary: z.string().trim().min(5).max(120),
  details: z.string().trim().min(10).max(2000),
});

export const helpdeskTicketRequestType: RequestTypeConfig<z.infer<typeof helpdeskTicketPayloadSchema>> = {
  key: 'helpdesk_ticket',
  label: 'Campus helpdesk',
  humanCodePrefix: 'HD',
  category: 'campus',
  payloadSchema: helpdeskTicketPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'helpdesk' },
  slaDays: 3,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: true,
  notifications: {},
  summaryLine: (p) => p.summary,
};
