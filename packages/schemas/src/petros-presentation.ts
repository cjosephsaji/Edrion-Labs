import { z } from 'zod';

/** Presentation metadata is versioned independently from source and grading data. */
export const PETROS_TEACHING_PRESENTATION_VERSION = 'petros.presentation.v1' as const;

export const petrosTeachingGestureSchema = z.enum([
  'rest',
  'enter',
  'walk',
  'point',
  'look',
  'speak',
  'listen',
  'think',
  'acknowledge',
]);

export const petrosTeachingAdvancementSchema = z.enum([
  'after_narration',
  'student_continue',
  'student_response',
  'exploration_complete',
]);

export const petrosTeachingBeatSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    narration: z.string().trim().min(1).max(2_000),
    targetId: z.string().trim().min(1).max(160).nullable().default(null),
    reveals: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    gesture: petrosTeachingGestureSchema.default('speak'),
    advancement: petrosTeachingAdvancementSchema.default('student_continue'),
    audioSrc: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type PetrosTeachingBeat = z.infer<typeof petrosTeachingBeatSchema>;

export const petrosTeachingPresentationSchema = z
  .object({
    schemaVersion: z.literal(PETROS_TEACHING_PRESENTATION_VERSION),
    id: z.string().trim().min(1).max(120),
    unitId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    objective: z.string().trim().min(3).max(600),
    beats: z.array(petrosTeachingBeatSchema).min(1).max(64),
  })
  .strict()
  .superRefine((presentation, context) => {
    const beatIds = new Set<string>();
    for (const [index, beat] of presentation.beats.entries()) {
      if (beatIds.has(beat.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['beats', index, 'id'],
          message: 'Beat IDs must be unique within a presentation.',
        });
      }
      beatIds.add(beat.id);
    }
  });
export type PetrosTeachingPresentation = z.infer<typeof petrosTeachingPresentationSchema>;

export const petrosPlaybackCheckpointSchema = z
  .object({
    presentationVersion: z.literal(PETROS_TEACHING_PRESENTATION_VERSION),
    unitId: z.string().trim().min(1).max(120),
    beatId: z.string().trim().min(1).max(100),
    mode: z.enum(['voice', 'quiet']),
  })
  .strict();
export type PetrosPlaybackCheckpoint = z.infer<typeof petrosPlaybackCheckpointSchema>;

export const petrosSavePresentationCheckpointSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
    checkpoint: petrosPlaybackCheckpointSchema,
  })
  .strict();
export type PetrosSavePresentationCheckpointInput = z.infer<
  typeof petrosSavePresentationCheckpointSchema
>;
