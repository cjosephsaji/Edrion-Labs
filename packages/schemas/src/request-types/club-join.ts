import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const clubJoinPayloadSchema = z.object({
  club_id: z.string().uuid(),
  statement: z.string().trim().min(10).max(500),
});

export const clubJoinRequestType: RequestTypeConfig<z.infer<typeof clubJoinPayloadSchema>> = {
  key: 'club_join',
  label: 'Join a club',
  humanCodePrefix: 'CJ',
  category: 'campus',
  payloadSchema: clubJoinPayloadSchema,
  payloadSchemaVersion: 1,
  routing: { role: 'clubs_coordinator' },
  slaDays: 7,
  cancellableStatuses: ['submitted'],
  requiresPayment: false,
  producesDocument: false,
  bulkApprovable: true,
  approvalSideEffectKey: 'club_join',
  notifications: {},
  summaryLine: (p) => `Club join ${p.club_id.slice(0, 8)}…`,
};
