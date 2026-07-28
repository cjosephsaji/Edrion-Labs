import { z } from 'zod';
import { selfDeclaredGoalV1Schema } from './goal';
import { sessionGoalSchema, emotionalContextSchema, entryPointSchema, entryRefSchema } from './state';
import { learnPolicyV1Schema } from './policy';
import { sessionBlockV1Schema } from './blocks';
import { orchestratorStatusSchema, endReasonSchema } from './state';

export const createLearnSessionInputSchema = z
  .object({
    entryPoint: entryPointSchema,
    topicKey: z.string().min(1).optional(),
    knowledgeItemId: z.string().uuid().optional(),
    pathItemId: z.string().uuid().optional(),
    reportCardEntryId: z.string().uuid().optional(),
    examScheduleId: z.string().uuid().optional(),
    goal: sessionGoalSchema.default('acquisition'),
    emotionalContext: emotionalContextSchema.optional(),
    timeBudgetMinutes: z.number().int().min(5).max(120).optional(),
    sessionContext: z.record(z.unknown()).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((val, ctx) => {
    if (val.entryPoint === 'learning_path' && !val.pathItemId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pathItemId is required', path: ['pathItemId'] });
    }
    if (val.entryPoint === 'library_document' && !val.knowledgeItemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'knowledgeItemId is required',
        path: ['knowledgeItemId'],
      });
    }
    if (val.entryPoint === 'bad_result' && !val.reportCardEntryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reportCardEntryId is required',
        path: ['reportCardEntryId'],
      });
    }
    if (
      (val.entryPoint === 'upcoming_exam' || val.entryPoint === 'prep_countdown') &&
      !val.examScheduleId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'examScheduleId is required',
        path: ['examScheduleId'],
      });
    }
    const needsTopicKey =
      val.entryPoint !== 'learning_path' &&
      val.entryPoint !== 'library_document' &&
      val.entryPoint !== 'bad_result' &&
      val.entryPoint !== 'upcoming_exam' &&
      val.entryPoint !== 'prep_countdown';
    if (needsTopicKey && !val.topicKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'topicKey is required', path: ['topicKey'] });
    }
  });

export type CreateLearnSessionInput = z.infer<typeof createLearnSessionInputSchema>;

export const learnSessionV1Schema = z.object({
  id: z.string().uuid(),
  /** Null for ad-hoc free/material sessions (DEC-14 / AC3). */
  topicId: z.string().uuid().nullable(),
  topicKey: z.string(),
  topicTitle: z.string(),
  subjectLabel: z.string(),
  entryPoint: entryPointSchema.nullable().optional(),
  entryRef: entryRefSchema.nullable().optional(),
  orchestratorStatus: orchestratorStatusSchema.nullable().optional(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  state: z.record(z.unknown()).default({}),
  sessionContext: z.record(z.unknown()).default({}),
  policySnapshot: learnPolicyV1Schema,
  timeBudgetMinutes: z.number().int().nullable().optional(),
  elapsedMinutes: z.number().int().nonnegative().default(0),
  checkpointsTotal: z.number().int().nonnegative().default(0),
  checkpointsDone: z.number().int().nonnegative().default(0),
  planMoveCount: z.number().int().nonnegative().default(0),
  endReason: endReasonSchema.nullable().optional(),
  blocks: z.array(sessionBlockV1Schema).default([]),
  streamUrl: z.string().url().optional(),
  readOnly: z.boolean().default(false),
  pathItemId: z.string().uuid().nullable().optional(),
  groundingKnowledgeItemId: z.string().uuid().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  /** Written at close; shown on the completion card (AC-8). */
  summary: z.record(z.unknown()).nullable().optional(),
  startedAt: z.string().datetime(),
  pausedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  version: z.number().int().nonnegative(),
});

export type LearnSessionV1Dto = z.infer<typeof learnSessionV1Schema>;

export const createLearnSessionResponseSchema = z.object({
  session: learnSessionV1Schema,
  streamUrl: z.string(),
});

export const activeSessionConflictSchema = z.object({
  code: z.literal('SESSION_ACTIVE'),
  activeSessionId: z.string().uuid(),
});

export const answerBlockInputSchema = z.object({
  questionId: z.string().min(1).max(40),
  response: z.unknown(),
  /** Real hint count for half-weight K on hinted success (hyperspec §6). */
  hintsUsed: z.number().int().nonnegative().max(20).default(0),
  idempotencyKey: z.string().uuid(),
  expectedInteractionVersion: z.number().int().nonnegative().optional(),
});

export const interactBlockInputSchema = z.object({
  action: z.string().min(1).max(40),
  data: z.record(z.unknown()).optional(),
  expectedInteractionVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});

export const askSessionInputSchema = z.object({
  text: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
});

export const commitArtifactsInputSchema = z.object({
  cardSelections: z.array(z.string().uuid()),
  includeCanvas: z.boolean().default(false),
  idempotencyKey: z.string().uuid(),
});

export const endSessionInputSchema = z.object({
  saveToLibrary: z.boolean().default(false),
  idempotencyKey: z.string().uuid().optional(),
});

export const streamReconnectQuerySchema = z.object({
  lastSeq: z.coerce.number().int().nonnegative().optional(),
});

export const blockAnswerResultSchema = z.object({
  evaluation: z.object({
    correct: z.boolean().nullable().optional(),
    feedback: z.string().optional(),
    /** Present only after a wrong MCQ — never on the streamed block payload. */
    correctOptionId: z.string().optional(),
  }),
  session: learnSessionV1Schema,
});

export type BlockAnswerResult = z.infer<typeof blockAnswerResultSchema>;

export const patchTopicProfileInputSchema = z.object({
  profile: z.record(z.unknown()).optional(),
  title: z.string().min(1).max(200).optional(),
});

export const createPathWithGoalInputSchema = z.object({
  goal: selfDeclaredGoalV1Schema,
  title: z.string().min(1).max(200).optional(),
  subjectLabel: z.string().min(1).max(120).optional(),
});
