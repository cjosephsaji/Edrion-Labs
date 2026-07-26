import { z } from 'zod';

export const createDebateSchema = z.object({
  motion: z.string().min(3).max(500),
  side: z.enum(['for', 'against', 'surprise']),
  format: z.enum(['quick_clash', 'structured']),
  mode: z.enum(['solo', 'friend']),
});

export const debateTurnSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const debateFeedbackSchema = z.object({
  strongest: z.string(),
  weakest: z.string(),
  technique: z.string(),
  perSide: z
    .object({
      for: z.object({ strongest: z.string(), weakest: z.string() }).optional(),
      against: z.object({ strongest: z.string(), weakest: z.string() }).optional(),
    })
    .optional(),
});

export const debateDtoSchema = z.object({
  id: z.string().uuid(),
  motion: z.string(),
  side: z.enum(['for', 'against']),
  format: z.enum(['quick_clash', 'structured']),
  mode: z.enum(['solo', 'friend']),
  stage: z.string(),
  turnSeconds: z.number().int(),
  inviteUrl: z.string().optional(),
  feedback: debateFeedbackSchema.nullable().optional(),
  participants: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.string(),
      displayName: z.string(),
      side: z.string().nullable(),
    }),
  ),
  turns: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int(),
      round: z.string(),
      speakerRole: z.string(),
      text: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type CreateDebateInput = z.infer<typeof createDebateSchema>;
export type DebateDto = z.infer<typeof debateDtoSchema>;
export type DebateFeedbackDto = z.infer<typeof debateFeedbackSchema>;
