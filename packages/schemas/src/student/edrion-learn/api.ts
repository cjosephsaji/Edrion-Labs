import { z } from 'zod';
import { selfDeclaredGoalV1Schema } from './goal';
import { learnEntryPointSchema } from './state';

export const learnSessionEntrySchema = z.object({
  entryPoint: learnEntryPointSchema,
  topicKey: z.string().optional(),
  knowledgeItemId: z.string().uuid().optional(),
  goal: selfDeclaredGoalV1Schema.optional(),
  sessionContext: z.record(z.unknown()).default({}),
});

export type LearnSessionEntry = z.infer<typeof learnSessionEntrySchema>;

export const createOrchestratorSessionInputSchema = z.discriminatedUnion('entryPoint', [
  z.object({
    entryPoint: z.literal('learning_path'),
    topicKey: z.string().min(1),
    pathItemId: z.string().uuid().optional(),
    timeBudgetMinutes: z.number().int().positive().optional(),
    sessionContext: z.record(z.unknown()).optional(),
  }),
  z.object({
    entryPoint: z.literal('library_document'),
    knowledgeItemId: z.string().uuid(),
    topicKey: z.string().optional(),
    timeBudgetMinutes: z.number().int().positive().optional(),
    sessionContext: z.record(z.unknown()).optional(),
  }),
  z.object({
    entryPoint: z.literal('goal'),
    goal: selfDeclaredGoalV1Schema,
    topicKey: z.string().optional(),
    timeBudgetMinutes: z.number().int().positive().optional(),
    sessionContext: z.record(z.unknown()).optional(),
  }),
  z.object({
    entryPoint: z.enum([
      'free_chat_handoff',
      'review_queue',
      'prep_countdown',
      'bad_result',
      'upcoming_exam',
    ]),
    topicKey: z.string().optional(),
    knowledgeItemId: z.string().uuid().optional(),
    timeBudgetMinutes: z.number().int().positive().optional(),
    sessionContext: z.record(z.unknown()).optional(),
  }),
]);

export type CreateOrchestratorSessionInput = z.infer<typeof createOrchestratorSessionInputSchema>;
