import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const sensitiveReportPayloadSchema = z.object({
  category: z.enum(['safety', 'harassment', 'discrimination', 'other']),
  narrative: z.string().trim().min(30).max(8000),
  contact_ok: z.boolean().default(false),
});

export const sensitiveReportRequestType: RequestTypeConfig<z.infer<typeof sensitiveReportPayloadSchema>> = {
  key: 'sensitive_report',
  label: 'Sensitive report',
  humanCodePrefix: 'SR',
  category: 'campus',
  payloadSchema: sensitiveReportPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'safeguarding_lead' },
  slaDays: 2,
  cancellableStatuses: [],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  notifications: {},
  summaryLine: () => 'Sensitive report (identity sealed)',
};
