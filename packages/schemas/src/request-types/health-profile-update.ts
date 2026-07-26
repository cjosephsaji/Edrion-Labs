import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const healthProfileUpdatePayloadSchema = z.object({
  blood_group: z.string().trim().max(8).optional(),
  allergies: z.string().trim().max(1000).optional(),
  conditions: z.string().trim().max(1000).optional(),
  emergency_contact: z.string().trim().max(200).optional(),
});

export const healthProfileUpdateRequestType: RequestTypeConfig<z.infer<typeof healthProfileUpdatePayloadSchema>> = {
  key: 'health_profile_update',
  label: 'Update health profile',
  humanCodePrefix: 'HP',
  category: 'campus',
  payloadSchema: healthProfileUpdatePayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'school_nurse' },
  slaDays: 5,
  cancellableStatuses: ['submitted'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: false,
  approvalSideEffectKey: 'health_profile_update',
  notifications: {},
  summaryLine: () => 'Health profile update',
};
