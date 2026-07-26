import { z } from 'zod';

export const formatSpecSchema = z.object({
  teams: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      side: z.enum(['proposition', 'opposition', 'floor']),
      rank_eligible: z.boolean(),
    }),
  ),
  roles: z.array(
    z.object({
      key: z.string(),
      team_key: z.string(),
      display_name: z.string(),
      short_name: z.string(),
      expectations: z.array(z.unknown()).default([]),
      forbidden: z.array(z.string()).default([]),
    }),
  ),
  speech_order: z.array(
    z.object({
      index: z.number().int(),
      role_key: z.string(),
      kind: z.string(),
      duration_ms: z.number().int().positive(),
    }),
  ),
  prep: z.object({
    seconds: z.number().int(),
    private_pads: z.boolean(),
    ai_assist_allowed: z.boolean(),
  }),
  adjudication: z.object({
    template_key: z.string(),
    rank_teams: z.boolean(),
    speaker_scores: z.boolean(),
  }),
  score_scale: z.object({
    min: z.number(),
    max: z.number(),
    step: z.number(),
    label: z.string(),
    bands: z.array(z.unknown()).default([]),
  }),
});

export type FormatSpec = z.infer<typeof formatSpecSchema>;
