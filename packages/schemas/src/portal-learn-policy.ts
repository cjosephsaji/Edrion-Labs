import { z } from 'zod';
import {
  answerDirectnessSchema,
  curriculumBoundsSchema,
  sessionVisibilitySchema,
} from './student/learn/policy';
import { reasonSchema, versionSchema } from './common';

export const portalLearnPolicyDtoSchema = z.object({
  id: z.string().uuid().optional(),
  curriculum_bounds: curriculumBoundsSchema,
  answer_directness: answerDirectnessSchema,
  session_visibility: sessionVisibilitySchema,
  enabled: z.boolean(),
  killSwitch: z.boolean(),
  version: z.number().int().nonnegative(),
  effectivePreview: z
    .object({
      curriculum_bounds: curriculumBoundsSchema,
      answer_directness: answerDirectnessSchema,
      session_visibility: sessionVisibilitySchema,
      effective_mode: z.enum(['enabled', 'disabled']),
    })
    .optional(),
});

export type PortalLearnPolicyDto = z.infer<typeof portalLearnPolicyDtoSchema>;

export const upsertPortalLearnPolicySchema = z.object({
  curriculum_bounds: curriculumBoundsSchema,
  answer_directness: answerDirectnessSchema,
  session_visibility: sessionVisibilitySchema,
  enabled: z.boolean().default(true),
  killSwitch: z.boolean().default(false),
  reason: reasonSchema,
  version: versionSchema.optional(),
});

export type UpsertPortalLearnPolicyInput = z.infer<typeof upsertPortalLearnPolicySchema>;

export const learnSessionAggregateSchema = z.object({
  studentId: z.string().uuid(),
  sessionsCompleted: z.number().int().nonnegative(),
  sessionsActive: z.number().int().nonnegative(),
  topicsStudied: z.number().int().nonnegative(),
  avgSessionMinutes: z.number().nonnegative().nullable(),
  visibility: sessionVisibilitySchema,
});

export type LearnSessionAggregateDto = z.infer<typeof learnSessionAggregateSchema>;

export const learnSessionTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  topicTitle: z.string(),
  entryPoint: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  goal: z.string(),
  blocks: z.array(
    z.object({
      id: z.string().uuid(),
      moveType: z.string().nullable(),
      blockType: z.string(),
      reasoning: z.string().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});

export type LearnSessionTranscriptDto = z.infer<typeof learnSessionTranscriptSchema>;
