import { z } from 'zod';
import type { RequestTypeConfig } from './types';

const isoDateTime = z.string().datetime({ offset: true });

export const hostelOutpassPayloadSchema = z.object({
  reason: z.enum(['family', 'medical', 'academic', 'other']),
  reason_text: z.string().trim().max(500).optional().default(''),
  leave_at: isoDateTime,
  expected_return_at: isoDateTime,
  destination: z.string().trim().min(2).max(200),
  guardian_ack: z.literal(true),
});

export type HostelOutpassPayload = z.infer<typeof hostelOutpassPayloadSchema>;

export const hostelOutpassRequestType: RequestTypeConfig<HostelOutpassPayload> = {
  key: 'hostel_outpass',
  label: 'Hostel outpass',
  humanCodePrefix: 'HO',
  category: 'campus',
  payloadSchema: hostelOutpassPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'hostel_warden' },
  slaDays: 1,
  cancellableStatuses: ['submitted', 'needs_info'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'hostel_outpass_gate_pass',
  notifications: {},
  summaryLine: (p) => `${p.destination} · ${p.leave_at.slice(0, 10)}`,
};
