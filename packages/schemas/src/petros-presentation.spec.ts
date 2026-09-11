import { describe, expect, it } from 'vitest';
import {
  PETROS_TEACHING_PRESENTATION_VERSION,
  petrosSavePresentationCheckpointSchema,
  petrosTeachingPresentationSchema,
} from './petros-presentation';

const presentation = {
  schemaVersion: PETROS_TEACHING_PRESENTATION_VERSION,
  id: 'integrals',
  unitId: 'antiderivatives',
  title: 'Integration reverses differentiation',
  objective: 'Explain the arbitrary constant.',
  beats: [
    {
      id: 'constant',
      narration: 'Differentiation erases constants, so integration restores the possibility as plus C.',
      targetId: 'equation:constant',
      reveals: ['constant'],
      gesture: 'point',
      advancement: 'student_continue',
    },
  ],
};

describe('Petros teaching presentation contracts', () => {
  it('accepts declared, serializable teaching beats', () => {
    expect(petrosTeachingPresentationSchema.parse(presentation).beats[0]?.targetId).toBe('equation:constant');
  });

  it('rejects duplicate beat IDs', () => {
    expect(() => petrosTeachingPresentationSchema.parse({
      ...presentation,
      beats: [presentation.beats[0], presentation.beats[0]],
    })).toThrow(/unique/i);
  });

  it('requires optimistic version and idempotency data for checkpoints', () => {
    expect(petrosSavePresentationCheckpointSchema.parse({
      expectedVersion: 8,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      checkpoint: {
        presentationVersion: PETROS_TEACHING_PRESENTATION_VERSION,
        unitId: 'antiderivatives',
        beatId: 'constant',
        mode: 'quiet',
      },
    }).expectedVersion).toBe(8);
  });
});
