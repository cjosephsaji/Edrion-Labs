import { z } from 'zod';

export const debateConsentScopesSchema = z.object({
  record_audio: z.boolean(),
  store_transcript: z.boolean(),
  ai_analysis: z.boolean(),
  human_review_for_calibration: z.boolean().optional().default(false),
  share_with_institution: z.boolean().optional().default(false),
});

export const debateConsentSchema = z.object({
  policyVersion: z.string().min(1),
  scopes: debateConsentScopesSchema,
  evidence: z
    .object({
      ip_hash: z.string().optional(),
      ua_hash: z.string().optional(),
      locale: z.string().optional(),
      screen_copy_hash: z.string().optional(),
    })
    .optional(),
});

export const audioSeamChunkSchema = z.object({
  idx: z.number().int().nonnegative(),
  storage_ref: z.string().uuid(),
  bytes: z.number().int().nonnegative(),
  started_ms: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
});

export const audioSeamSchema = z.object({
  codec: z.string().optional(),
  container: z.string().optional(),
  sample_rate: z.number().int().optional(),
  channels: z.number().int().optional(),
  chunks: z.array(audioSeamChunkSchema).default([]),
  total_duration_ms: z.number().int().nonnegative().optional(),
  gaps_ms: z
    .array(
      z.object({
        at_ms: z.number().int(),
        length_ms: z.number().int(),
        cause: z.string(),
      }),
    )
    .default([]),
  client: z.record(z.string(), z.unknown()).optional(),
  synthetic: z.boolean().optional(),
});

export const sttWordSchema = z.object({
  w: z.string(),
  s_ms: z.number().int().nonnegative(),
  e_ms: z.number().int().nonnegative(),
  conf: z.number().min(0).max(1),
});

export const transcriptDisplaySchema = z.object({
  canonicalText: z.string(),
  displayText: z.string().nullable(),
  words: z.array(sttWordSchema),
  metrics: z.record(z.string(), z.unknown()),
});

export const debateChunkUploadSchema = z.object({
  chunkIdx: z.number().int().nonnegative(),
  mimeType: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
});

export type DebateConsentInput = z.infer<typeof debateConsentSchema>;
export type AudioSeam = z.infer<typeof audioSeamSchema>;
