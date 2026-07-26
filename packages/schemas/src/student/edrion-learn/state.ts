import { z } from 'zod';

export const learnEntryPointSchema = z.enum([
  'learning_path',
  'free_chat_handoff',
  'library_document',
  'review_queue',
  'goal',
  'prep_countdown',
  'bad_result',
  'upcoming_exam',
]);

export type LearnEntryPoint = z.infer<typeof learnEntryPointSchema>;

export const learnOrchestratorStatusSchema = z.enum([
  'created',
  'active',
  'awaiting_response',
  'paused',
  'closing',
  'closed',
]);

export type LearnOrchestratorStatus = z.infer<typeof learnOrchestratorStatusSchema>;

export const sessionStateV1Schema = z.object({
  v: z.literal(1),
  free_questions_used: z.number().int().nonnegative().default(0),
  probe_turns: z.number().int().nonnegative().default(0),
  wrong_streak: z.number().int().nonnegative().default(0),
  time_extension_used: z.boolean().default(false),
  wrap_flag: z.boolean().default(false),
});

export type SessionStateV1 = z.infer<typeof sessionStateV1Schema>;
