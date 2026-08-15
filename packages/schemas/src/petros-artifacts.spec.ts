import { describe, expect, it } from 'vitest';
import {
  PETROS_REVIEW_SCHEDULER_VERSION,
  PETROS_ARTIFACT_FUNCTION_KEYS,
  PETROS_FUNCTION_CATALOG,
  firstPetrosReview,
  mixPetrosReviewTopics,
  petrosArtifactContentSchema,
  schedulePetrosReview,
} from './index';

describe('Petros Stage 7 artifact contracts', () => {
  it('registers independently routable flashcard, note, and structured-diagram functions', () => {
    const catalog = new Map(PETROS_FUNCTION_CATALOG.map((definition) => [definition.key, definition]));
    expect(catalog.get(PETROS_ARTIFACT_FUNCTION_KEYS.flashcard)?.category).toBe('Artifacts');
    expect(catalog.get(PETROS_ARTIFACT_FUNCTION_KEYS.note)?.category).toBe('Artifacts');
    expect(catalog.get(PETROS_ARTIFACT_FUNCTION_KEYS.diagram)).toMatchObject({ category: 'Artifacts', responseFormat: 'json' });
  });

  it('accepts structured editable diagrams and rejects hostile or broken graph structure', () => {
    const safe = {
      kind: 'diagram' as const,
      title: 'Energy flow',
      archetype: 'flowchart' as const,
      tags: ['photosynthesis'],
      nodes: [
        { id: 'light', label: 'Light', description: '' },
        { id: 'stored', label: 'Stored energy', description: '' },
      ],
      edges: [{ id: 'edge_1', from: 'light', to: 'stored', label: 'becomes' }],
      accessibleDescription: 'Light energy becomes stored chemical energy.',
    };
    expect(petrosArtifactContentSchema.safeParse(safe).success).toBe(true);
    expect(
      petrosArtifactContentSchema.safeParse({
        ...safe,
        edges: [{ id: 'edge_1', from: 'light', to: 'missing', label: '<script>alert(1)</script>' }],
      }).success,
    ).toBe(false);
  });
});

describe('Petros deterministic exam-aware scheduler', () => {
  it('places a new card on the next local study morning across a half-hour timezone', () => {
    const result = firstPetrosReview(
      new Date('2026-08-10T20:00:00.000Z'),
      'Asia/Kolkata',
      null,
    );
    expect(result.dueAt.toISOString()).toBe('2026-08-12T03:30:00.000Z');
    expect(result.schedulerVersion).toBe(PETROS_REVIEW_SCHEDULER_VERSION);
    expect(result.reps).toBe(0);
  });

  it('is timezone-aware across a daylight-saving boundary', () => {
    const result = firstPetrosReview(
      new Date('2026-03-07T15:00:00.000Z'),
      'America/New_York',
      null,
    );
    expect(result.dueAt.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('returns failed and fragile cards sooner without a retroactive due time', () => {
    const reviewedAt = new Date('2026-08-10T10:00:00.000Z');
    const state = {
      dueAt: reviewedAt,
      intervalDays: 4,
      ease: 2.5,
      reps: 2,
      lapses: 0,
    };
    const failed = schedulePetrosReview({
      state,
      grade: 'again',
      confidence: 'sure',
      reviewedAt,
      timezone: 'UTC',
    });
    const sure = schedulePetrosReview({
      state,
      grade: 'good',
      confidence: 'sure',
      reviewedAt,
      timezone: 'UTC',
    });
    const fragile = schedulePetrosReview({
      state,
      grade: 'good',
      confidence: 'guessing',
      reviewedAt,
      timezone: 'UTC',
    });
    expect(failed.dueAt.getTime()).toBeGreaterThanOrEqual(reviewedAt.getTime() + 10 * 60_000);
    expect(failed.dueAt.getTime()).toBeLessThan(fragile.dueAt.getTime());
    expect(fragile.dueAt.getTime()).toBeLessThan(sure.dueAt.getTime());
    expect(failed.lapses).toBe(1);
  });

  it('tightens a long interval before a known exam and ignores a past exam', () => {
    const reviewedAt = new Date('2026-08-10T10:00:00.000Z');
    const state = {
      dueAt: reviewedAt,
      intervalDays: 20,
      ease: 2.5,
      reps: 4,
      lapses: 0,
    };
    const tightened = schedulePetrosReview({
      state,
      grade: 'easy',
      confidence: 'sure',
      reviewedAt,
      timezone: 'Asia/Kolkata',
      examDate: '2026-08-16',
    });
    const past = schedulePetrosReview({
      state,
      grade: 'easy',
      confidence: 'sure',
      reviewedAt,
      timezone: 'Asia/Kolkata',
      examDate: '2026-08-01',
    });
    expect(tightened.examAware).toBe(true);
    expect(tightened.dueAt.getTime()).toBeLessThan(new Date('2026-08-16T18:30:00.000Z').getTime());
    expect(past.examAware).toBe(false);
  });

  it('mixes topics deterministically instead of returning blocked topic runs', () => {
    const mixed = mixPetrosReviewTopics([
      { id: 'a1', topic: 'algebra' },
      { id: 'a2', topic: 'algebra' },
      { id: 'b1', topic: 'biology' },
      { id: 'c1', topic: 'chemistry' },
    ]);
    expect(mixed.map((card) => card.id)).toEqual(['a1', 'b1', 'c1', 'a2']);
  });
});
