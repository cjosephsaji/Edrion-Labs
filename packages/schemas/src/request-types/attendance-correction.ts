import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const attendanceCorrectionRecordRefSchema = z.object({
  session_id: z.string().uuid(),
  claim: z.literal('was_present').default('was_present'),
});

export const attendanceCorrectionPayloadSchema = z.object({
  record_refs: z.array(attendanceCorrectionRecordRefSchema).min(1).max(5),
  claim: z.literal('was_present').default('was_present'),
  note: z.string().trim().max(500).default(''),
});

export type AttendanceCorrectionPayload = z.infer<typeof attendanceCorrectionPayloadSchema>;

export const attendanceCorrectionType: RequestTypeConfig<AttendanceCorrectionPayload> = {
  key: 'attendance_correction',
  label: 'Attendance correction',
  humanCodePrefix: 'AC',
  category: 'academics',
  entrySurface: 'attendance',
  payloadSchema: attendanceCorrectionPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'class_teacher' },
  slaDays: 3,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'attendance_correction',
  notifications: {},
  summaryLine: (payload) => `${payload.record_refs.length} session(s) disputed`,
};
