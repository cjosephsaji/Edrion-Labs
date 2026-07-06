import { z } from 'zod';

export const askContextSchema = z.object({
  kind: z.enum(['session', 'concept', 'practice', 'homework', 'quick']),
  id: z.string().uuid(),
  blockId: z.string().uuid().optional(),
  contextLabel: z.string(),
});

export const askInputSchema = z.object({
  context: askContextSchema,
  question: z.string().min(1).max(2000),
  conversation: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .optional(),
});

export const askResponseSchema = z.object({
  answer: z.string(),
  refused: z.boolean().optional(),
  refusalNote: z.string().optional(),
  policyNotice: z.string().optional(),
});

export const pinAskInputSchema = z.object({
  sessionId: z.string().uuid(),
  blockAfterId: z.string().uuid().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
});

export type AskInput = z.infer<typeof askInputSchema>;
export type AskResponseDto = z.infer<typeof askResponseSchema>;
export type PinAskInput = z.infer<typeof pinAskInputSchema>;
