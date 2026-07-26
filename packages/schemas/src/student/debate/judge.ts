import { z } from 'zod';
import { debateAnatomyAxisSchema } from './lifecycle';

export const debateArgumentRefSchema = z.object({
  id: z.string().min(1).max(32),
  label: z.string().min(1).max(200),
  side: z.enum(['proposition', 'opposition']),
  summary: z.string().min(1).max(800),
  strength: z.number().int().min(0).max(100),
});

export const debateQuoteRefSchema = z.object({
  argument_id: z.string().min(1).max(32),
  verbatim: z.string().min(3).max(500),
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(0),
});

export const debateSpeechAnalysisSchema = z.object({
  turn_index: z.number().int().min(0),
  arguments: z.array(debateArgumentRefSchema).min(1).max(12),
  anatomy_axis_scores: z.record(debateAnatomyAxisSchema, z.number().int().min(0).max(100)),
  manner: z
    .object({
      pace_wpm: z.number().optional(),
      filler_rate: z.number().optional(),
      clarity: z.number().int().min(0).max(100).optional(),
    })
    .default({}),
  quotes: z.array(debateQuoteRefSchema).max(8).default([]),
  undefended_assumptions: z.array(z.string().max(300)).max(6).default([]),
});

export const debateClashDraftSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(10).max(600),
  prop_argument_refs: z.array(z.string()).min(1),
  opp_argument_refs: z.array(z.string()).min(1),
  winner: z.enum(['proposition', 'opposition', 'tied']),
  margin: z.enum(['clear', 'narrow', 'razor']),
  reasoning: z.string().min(10).max(800),
  weight: z.number().min(0).max(1),
});

export const debateVerdictDraftSchema = z.object({
  winner: z.enum(['proposition', 'opposition', 'tied']),
  reasoning: z.string().min(10).max(600),
  decisive_clash_index: z.number().int().min(0),
  ranking: z
    .array(
      z.object({
        side: z.enum(['proposition', 'opposition']),
        rank: z.number().int().min(1),
        margin: z.enum(['clear', 'narrow', 'razor']),
      }),
    )
    .min(1),
});

export const debateFeedbackItemSchema = z.object({
  text: z.string().min(3).max(400),
  quote_ref: debateQuoteRefSchema.nullable(),
  drill_hint: z.string().max(200).nullable().optional(),
});

export const debateSpeakerFeedbackSchema = z.object({
  participant_label: z.string().max(80),
  score: z.number().int().min(50).max(100),
  band_label: z.string().max(80),
  strengths: z.array(debateFeedbackItemSchema).min(1).max(3),
  fixes: z.array(debateFeedbackItemSchema).min(1).max(3),
  focus_directive: z.string().min(10).max(300),
  focus_met_from_prior: z.boolean().nullable().optional(),
});

export const debateFeedbackReportSchema = z.object({
  round_summary: z.string().min(10).max(1200),
  per_speaker: z.array(debateSpeakerFeedbackSchema).min(1).max(4),
});

export const debateStageAOutputSchema = z.object({
  speeches: z.array(debateSpeechAnalysisSchema).min(1),
});

export const debateStageBOutputSchema = z.object({
  clashes: z.array(debateClashDraftSchema).min(1).max(8),
});

export const debateStageCOutputSchema = debateVerdictDraftSchema;

export const debateStageDOutputSchema = debateFeedbackReportSchema;

export type DebateSpeechAnalysis = z.infer<typeof debateSpeechAnalysisSchema>;
export type DebateQuoteRef = z.infer<typeof debateQuoteRefSchema>;
