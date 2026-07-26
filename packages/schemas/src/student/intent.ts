import { z } from 'zod';

export const intentInputSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const intentResponseSchema = z.object({
  intent: z.enum(['quick_question', 'learn_topic', 'practice', 'revise', 'prepare_exam', 'continue']),
  topicGuess: z.string().optional(),
  subjectLabel: z.string().optional(),
  route: z.string(),
  depth: z.enum(['quick', 'deep']).optional(),
  helperCopy: z.string().optional(),
});

export type IntentInput = z.infer<typeof intentInputSchema>;
export type IntentResponseDto = z.infer<typeof intentResponseSchema>;
