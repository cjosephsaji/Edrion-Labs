import { describe, expect, it } from 'vitest';
import { defaultFsrsScheduler, mapSm2ToFsrs } from '../index';

describe('mapSm2ToFsrs', () => {
  const base = {
    nextDueAt: new Date('2026-07-21T10:00:00Z'),
    updatedAt: new Date('2026-07-20T10:00:00Z'),
    lastReviewAt: null as Date | null,
  };

  it('preserves next_due_at for new cards (A1)', () => {
    const mapped = mapSm2ToFsrs({ ...base, reps: 0, intervalDays: 0, ease: 2.5 });
    expect(mapped.srsState).toBe('new');
    expect(mapped.fsrsDueAt).toEqual(base.nextDueAt);
  });

  it('preserves next_due_at for reviewed cards (AC A-2)', () => {
    const due = new Date('2026-08-01T10:00:00Z');
    const mapped = mapSm2ToFsrs({
      ...base,
      reps: 3,
      intervalDays: 5,
      ease: 2.5,
      nextDueAt: due,
      lastReviewAt: new Date('2026-07-15T10:00:00Z'),
    });
    expect(mapped.srsState).toBe('review');
    expect(mapped.fsrsDueAt).toEqual(due);
    expect(mapped.stability).toBe(5);
  });

  it('maps learning state when interval < 1 day', () => {
    const mapped = mapSm2ToFsrs({ ...base, reps: 1, intervalDays: 0.5, ease: 2.5 });
    expect(mapped.srsState).toBe('learning');
  });
});

describe('FsrsScheduler', () => {
  it('preview matches applyGrade for good (AC A-4 path)', () => {
    const now = new Date('2026-07-21T12:00:00Z');
    const card = {
      srsState: 'new' as const,
      stability: 0,
      difficulty: 0,
      fsrsDueAt: now,
      lastReviewAt: null,
      reps: 0,
      lapses: 0,
    };
    const previews = defaultFsrsScheduler.preview(card, now);
    const applied = defaultFsrsScheduler.applyGrade(card, 'good', now);
    expect(applied.fsrsDueAt.getTime()).toBe(previews.good.dueAt.getTime());
  });
});
