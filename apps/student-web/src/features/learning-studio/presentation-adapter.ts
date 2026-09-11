import {
  PETROS_TEACHING_PRESENTATION_VERSION,
  petrosTeachingPresentationSchema,
  type PetrosTeachingPresentation,
} from '@edrion/schemas';

/**
 * Presentation instructions are treated as data, never selectors. Unknown or unavailable
 * targets fall back to a safe docked explanation of the already-valid visible content.
 */
export function resolveTeachingPresentation({
  candidate,
  unitId,
  title,
  explanation,
  declaredTargets,
}: {
  candidate: unknown;
  unitId: string;
  title: string;
  explanation: string;
  declaredTargets: ReadonlySet<string>;
}): PetrosTeachingPresentation {
  const parsed = petrosTeachingPresentationSchema.safeParse(candidate);
  if (
    parsed.success &&
    parsed.data.unitId === unitId &&
    parsed.data.beats.every((beat) => beat.targetId === null || declaredTargets.has(beat.targetId))
  ) {
    return parsed.data;
  }
  return {
    schemaVersion: PETROS_TEACHING_PRESENTATION_VERSION,
    id: `${unitId}:deterministic`,
    unitId,
    title,
    objective: `Understand ${title}`,
    beats: [
      {
        id: 'visible-content',
        narration: explanation,
        targetId: null,
        reveals: [],
        gesture: 'rest',
        advancement: 'student_continue',
      },
    ],
  };
}
