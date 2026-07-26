import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const campusLibraryRenewalPayloadSchema = z.object({
  loan_id: z.string().uuid(),
  renewal_days: z.number().int().min(1).max(14).default(7),
});

export type CampusLibraryRenewalPayload = z.infer<typeof campusLibraryRenewalPayloadSchema>;

export const campusLibraryRenewalRequestType: RequestTypeConfig<CampusLibraryRenewalPayload> = {
  key: 'campus_library_renewal',
  label: 'Renew library book',
  humanCodePrefix: 'LR',
  category: 'campus',
  payloadSchema: campusLibraryRenewalPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'librarian' },
  slaDays: 2,
  cancellableStatuses: ['submitted'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: true,
  approvalSideEffectKey: 'campus_library_renewal',
  notifications: {},
  summaryLine: (p) => `Renew loan ${p.loan_id.slice(0, 8)}…`,
};
