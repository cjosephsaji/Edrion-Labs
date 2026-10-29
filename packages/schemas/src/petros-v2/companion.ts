import { z } from 'zod';
import { canvasIdSchema } from './canvas';
import { v2Key, v2Uuid, v2Version } from './content';

/** Public current-art subset. No mouth, joint, pen or screen-coordinate controls. */
export const companionCueSchema = z
  .object({
    mode: z.enum(['teaching', 'listening', 'thinking', 'acknowledging', 'waiting', 'paused']),
    gesture: z.enum(['neutral', 'point-right', 'point-left']),
    targetId: canvasIdSchema.nullable(),
    caption: z.string().max(2000),
  })
  .strict();
export type CompanionCue = z.infer<typeof companionCueSchema>;

export const companionPresentationSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.companion.v1'),
    persona: z.object({ id: v2Key, version: v2Version }).strict(),
    rig: z
      .object({
        id: v2Key,
        version: v2Version,
        expressions: z.array(v2Key).max(32),
        gestures: z.array(v2Key).max(32),
      })
      .strict(),
    cueId: v2Uuid,
    publicCue: companionCueSchema,
    expression: v2Key,
    semanticTarget: v2Key.nullable(),
    utteranceId: v2Uuid.nullable(),
    captionId: v2Uuid.nullable(),
    epoch: z.number().int().nonnegative(),
    voiceState: z.enum([
      'unavailable',
      'text_only',
      'listening',
      'transcribing',
      'ready',
      'speaking',
      'paused',
      'interrupted',
    ]),
    assessmentBehavior: z.enum(['public_teaching', 'neutral_verification']),
    acknowledgment: z
      .object({
        status: z.enum(['pending', 'played', 'interrupted', 'cancelled']),
        segmentId: v2Uuid.nullable(),
        offsetMs: z.number().int().min(0).max(600000),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.rig.expressions.includes(c.expression) || !c.rig.gestures.includes(c.publicCue.gesture))
      ctx.addIssue({ code: 'custom', message: 'Unsupported rig control' });
    if (
      c.assessmentBehavior === 'neutral_verification' &&
      (c.publicCue.gesture !== 'neutral' ||
        c.semanticTarget !== null ||
        c.publicCue.targetId !== null ||
        c.expression !== 'neutral')
    )
      ctx.addIssue({ code: 'custom', message: 'Verification cannot signal an answer' });
  });

/** M6 public projection. No selectors, coordinates, generated markup or private evaluation input. */
export const companionEventSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.companion-event.v1'),
    eventId: z.string().min(1).max(240),
    sessionId: v2Uuid,
    revision: z.number().int().nonnegative(),
    epoch: z.number().int().nonnegative(),
    activityId: z.string().max(80).nullable(),
    activityRevision: z.number().int().nonnegative(),
    sourceRevisionId: v2Uuid.nullable(),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    actionId: v2Uuid.nullable(),
    beatId: z.string().max(240).nullable(),
    intent: z.enum([
      'introducing',
      'explaining',
      'demonstrating',
      'inviting',
      'waiting',
      'listening',
      'processing',
      'responding',
      'uncertain',
      'paused',
      'blocked',
    ]),
    expression: z.enum(['neutral', 'attentive', 'thoughtful', 'pleased', 'uncertain']),
    gesture: z.enum(['settled', 'lean', 'nod', 'acknowledge', 'open-hand', 'point']),
    targetId: canvasIdSchema.nullable(),
    utteranceId: z.string().max(240),
    caption: z.string().max(2000),
    assistancePolicy: z.enum([
      'public_teaching',
      'neutral_verification',
      'committed_feedback',
      'procedural',
    ]),
    result: z.enum(['none', 'pending', 'correct', 'incorrect', 'partial', 'review', 'unavailable']),
    priority: z.number().int().min(0).max(100),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    acknowledgment: z.literal('presentation-only'),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.expiresAt <= v.issuedAt || v.expiresAt - v.issuedAt > 120000)
      c.addIssue({ code: 'custom', message: 'Invalid cue lifetime' });
    if (
      v.assistancePolicy === 'neutral_verification' &&
      (v.expression !== 'neutral' ||
        v.targetId ||
        v.gesture !== 'settled' ||
        !['waiting', 'processing'].includes(v.intent))
    )
      c.addIssue({ code: 'custom', message: 'Verification must remain neutral' });
    if (
      v.expression === 'pleased' &&
      (v.result !== 'correct' || v.assistancePolicy !== 'committed_feedback')
    )
      c.addIssue({
        code: 'custom',
        message: 'Positive expression requires committed evaluated success',
      });
    if (
      ['pending', 'review', 'unavailable', 'incorrect', 'partial'].includes(v.result) &&
      ['nod', 'acknowledge'].includes(v.gesture)
    )
      c.addIssue({ code: 'custom', message: 'Unevaluated or unsuccessful work cannot celebrate' });
  });
export type CompanionEvent = z.infer<typeof companionEventSchema>;
