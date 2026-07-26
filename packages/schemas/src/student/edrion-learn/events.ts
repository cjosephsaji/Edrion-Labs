import { z } from 'zod';

export const learnSessionEventTypeSchema = z.enum([
  'session_created',
  'status_changed',
  'block_committed',
  'answer_recorded',
  'policy_notice',
  'stream_checkpoint',
  'session_closed',
]);

export const learnSessionEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  event_type: learnSessionEventTypeSchema,
  payload: z.record(z.unknown()).default({}),
  created_at: z.string().datetime(),
});

export type LearnSessionEventDto = z.infer<typeof learnSessionEventSchema>;

export const learnerModelEventTypeSchema = z.enum([
  'mastery_updated',
  'profile_refresh',
  'evidence_recorded',
  'backfill_checkpoint',
]);
