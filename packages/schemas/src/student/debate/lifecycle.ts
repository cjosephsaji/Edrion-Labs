import { z } from 'zod';

export const debateStatusSchema = z.enum([
  'draft',
  'consent_required',
  'prep',
  'speaking',
  'capture_complete',
  'adjudicating',
  'report_ready',
  'abandoned',
  'adjudication_failed',
]);

export const debateModeSchema = z.enum(['practice_vs_ai', 'spar_1v1', 'competition']);

export const debateAnatomyAxisSchema = z.enum([
  'claim',
  'mechanism',
  'example',
  'impact',
  'comparative',
]);

export const createDebateRoundSchema = z.object({
  formatKey: z.enum(['spar_1v1', 'practice_solo']),
  formatVersion: z.number().int().positive().optional(),
  mode: debateModeSchema.exclude(['competition']),
  motionText: z.string().min(10).max(500),
  motionId: z.string().uuid().optional(),
  side: z.enum(['proposition', 'opposition']).optional(),
  prepSeconds: z.number().int().min(0).max(3600).optional(),
  scaffoldsEnabled: z.boolean().optional(),
  aiOpponentDifficulty: z.enum(['novice', 'intermediate', 'circuit']).optional(),
  aiPersonaKey: z.enum(['steady', 'rapid', 'principled', 'circuit']).optional(),
});

export type DebateStatus = z.infer<typeof debateStatusSchema>;
export type CreateDebateRoundInput = z.infer<typeof createDebateRoundSchema>;
