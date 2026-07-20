import { z } from 'zod';
import type { RequestTypeConfig } from './types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Choose a valid date');

export const leaveSessionRefSchema = z.object({
  session_id: z.string().uuid(),
  date: isoDate,
  subject_id: z.string().uuid().nullable(),
  period: z.string(),
});

export const leaveRequestPayloadSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    scope: z.literal('full_day').default('full_day'),
    reason: z.enum(['medical', 'family', 'event', 'other']),
    reason_text: z.string().trim().max(500).optional().default(''),
    /** Server-derived snapshot of existing attendance sessions covered by the range. */
    notify_sessions: z.array(leaveSessionRefSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.end_date < value.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_date'],
        message: 'End date must be after start date',
      });
    }
    if (value.reason === 'other' && value.reason_text.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_text'],
        message: 'Tell us the reason in at least 10 characters',
      });
    }
    if (value.reason_text && value.reason_text.trim().length > 0 && value.reason_text.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_text'],
        message: 'Use at least 10 characters',
      });
    }
  });

export type LeaveRequestPayload = z.infer<typeof leaveRequestPayloadSchema>;

export const leaveRequestType: RequestTypeConfig<LeaveRequestPayload> = {
  key: 'leave_request',
  label: 'Leave request',
  humanCodePrefix: 'LV',
  category: 'academics',
  payloadSchema: leaveRequestPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { classTeacherOf: 'student' },
  slaDays: 2,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'leave_attendance',
  notifications: {},
  summaryLine: (payload) => `${payload.start_date} – ${payload.end_date}`,
};
