import { z } from 'zod';
import type { RequestTypeConfig } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const odSessionRefSchema = z.object({
  date: isoDate,
  slot_id: z.string().uuid().nullable(),
  subject_id: z.string().uuid().nullable(),
});

export const odRequestPayloadSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    event_name: z.string().trim().min(3).max(120),
    organizer: z.string().trim().min(3).max(120),
    reason: z.enum(['sports', 'cultural', 'placement', 'nss_ncc', 'conference', 'other']),
    reason_text: z.string().trim().max(500).optional().default(''),
    sessions_snapshot: z.array(odSessionRefSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.end_date < value.start_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_date'], message: 'End date must be on or after start date' });
    }
    if (value.reason === 'other' && value.reason_text.trim().length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason_text'], message: 'Tell us the reason in at least 10 characters' });
    }
  });

export type OdRequestPayload = z.infer<typeof odRequestPayloadSchema>;

export const odRequestType: RequestTypeConfig<OdRequestPayload> = {
  key: 'od_request',
  label: 'On-duty request',
  humanCodePrefix: 'OD',
  category: 'academics',
  entrySurface: 'attendance',
  payloadSchema: odRequestPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'faculty_advisor' },
  slaDays: 2,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'od_attendance',
  notifications: {},
  summaryLine: (payload) => `${payload.start_date} – ${payload.end_date} · ${payload.event_name}`,
};
