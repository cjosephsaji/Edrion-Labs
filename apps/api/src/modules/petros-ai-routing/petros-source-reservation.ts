import { z } from 'zod';

export const sourceReservationSchema = z
  .object({
    kind: z.literal('staff_source'),
    institutionId: z.string().uuid(),
    staffActorId: z.string().uuid(),
    sourceRevisionId: z.string().uuid(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    preparationId: z.string().uuid(),
    fence: z.number().int().positive(),
    stage: z.enum(['document.understand', 'teaching.propose']),
    interpretationVersion: z.string().regex(/^[a-z0-9._-]{1,100}$/i),
    requestId: z.string().uuid(),
    approvalId: z.string().uuid(),
    routeId: z.string().uuid(),
    providerKey: z.string().min(1).max(100),
    modelKey: z.string().min(1).max(100),
    maxSpendMicros: z.number().int().positive().safe(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type SourceReservation = z.infer<typeof sourceReservationSchema>;

export function validateSourceReservation(raw: unknown, now = Date.now()) {
  const reservation = sourceReservationSchema.parse(raw);
  if (Date.parse(reservation.expiresAt) <= now) throw new Error('M2_SOURCE_APPROVAL_EXPIRED');
  return reservation;
}
