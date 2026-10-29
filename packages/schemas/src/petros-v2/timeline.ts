import { z } from 'zod';
import { canvasIdSchema } from './canvas';
import { teachingActionEnvelopeSchema, type TeachingActionEnvelope } from './teaching-actions';
import {
  applyTeachingAction,
  commitFixtureSubmission,
  initialSharedCanvas,
} from './canvas-reducer';
import { v2Key, v2Uuid } from './content';

export type PresentationTimeline = {
  schemaVersion: 'petros.v2.timeline.v1';
  mode: 'public_fixture';
  id: string;
  activityId: string;
  branchId: string;
  beats: {
    id: string;
    action: TeachingActionEnvelope;
    reveal: 'progressive' | 'instant';
    accessibleAlternative: string;
    completion: 'text-step' | 'student-response';
  }[];
};
// Keep declaration emission bounded as registered canvas payloads grow; runtime
// parsing below remains the same strict schema.
export const presentationTimelineSchema: z.ZodType<PresentationTimeline> = z
  .object({
    schemaVersion: z.literal('petros.v2.timeline.v1'),
    mode: z.literal('public_fixture'),
    id: canvasIdSchema,
    activityId: canvasIdSchema,
    branchId: canvasIdSchema,
    beats: z
      .array(
        z
          .object({
            id: canvasIdSchema,
            action: teachingActionEnvelopeSchema,
            reveal: z.enum(['progressive', 'instant']),
            accessibleAlternative: z.string().min(1).max(500),
            completion: z.enum(['text-step', 'student-response']),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();
export const presentationCheckpointSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.presentation-checkpoint.v1'),
    timelineId: v2Uuid,
    epoch: z.number().int().nonnegative(),
    beats: z
      .array(
        z
          .object({
            id: v2Key,
            actionId: v2Uuid,
            canvasOperationIds: z.array(v2Uuid).max(32),
            speechSegmentId: v2Uuid.nullable(),
            cueId: v2Uuid.nullable(),
            studentCheckpointId: v2Uuid.nullable(),
            barrier: z.enum(['semantic_operation', 'actual_audio_ack', 'student_commit']),
          })
          .strict(),
      )
      .max(64),
    completedOperations: z.array(v2Uuid).max(100),
    completedBeatIds: z.array(v2Key).max(64),
    audioAck: z
      .object({
        segmentId: v2Uuid,
        offsetMs: z.number().int().min(0).max(600000),
        status: z.enum(['played', 'paused', 'interrupted']),
      })
      .strict()
      .nullable(),
    state: z.enum(['playing', 'paused', 'interrupted', 'cancelled', 'completed']),
    resumeEpoch: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const ids = t.beats.map((b) => b.id),
      operations = t.beats.flatMap((b) => b.canvasOperationIds);
    if (
      new Set(ids).size !== ids.length ||
      new Set(operations).size !== operations.length ||
      t.completedOperations.some((id, i) => operations[i] !== id) ||
      t.completedBeatIds.some((id, i) => ids[i] !== id) ||
      t.resumeEpoch < t.epoch ||
      (t.audioAck && !t.beats.some((b) => b.speechSegmentId === t.audioAck!.segmentId))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid replay prefix or epoch' });
  });
export function validatePresentationTimeline(input: unknown): PresentationTimeline {
  // Preflight before recursive schema parsing. This public subset contains no arbitrary code.
  if (JSON.stringify(input).length > 64000) throw new Error('Timeline exceeds fixture budget');
  const timeline = presentationTimelineSchema.parse(input),
    ids = new Set<string>();
  let state = initialSharedCanvas(timeline.activityId, timeline.branchId);
  for (const [index, beat] of timeline.beats.entries()) {
    if (ids.has(beat.id) || ids.has(beat.action.actionId))
      throw new Error('Duplicate beat/action ID');
    ids.add(beat.id);
    ids.add(beat.action.actionId);
    if (
      beat.action.sequence !== index + 1 ||
      beat.action.activityId !== timeline.activityId ||
      beat.action.branchId !== timeline.branchId
    )
      throw new Error('Invalid timeline binding');
    if (Boolean(beat.action.checkpoint) !== (beat.completion === 'student-response'))
      throw new Error('Checkpoint barrier mismatch');
    state = applyTeachingAction(state, { ...beat.action, expectedCanvasRevision: state.revision });
    if (state.invitation && !state.invitation.submitted)
      state = commitFixtureSubmission(state, state.invitation.id, state.revision);
  }
  return timeline;
}
