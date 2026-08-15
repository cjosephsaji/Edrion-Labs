import { describe, expect, it } from 'vitest';
import { rankStudentHomeCards, type StudentHomeCandidate } from './student-home-ranking';

function candidate(
  id: string,
  kind: StudentHomeCandidate['kind'],
  dynamicBoost = 0,
): StudentHomeCandidate {
  return {
    id,
    kind,
    eyebrow: kind,
    title: id,
    description: id,
    href: '/home',
    actionLabel: 'Open',
    reason: 'Test signal',
    dynamicBoost,
    source: 'program',
  };
}

describe('rankStudentHomeCards', () => {
  it('lets institution weights move any relevant category to the top', () => {
    const cards = rankStudentHomeCards(
      [candidate('exam', 'exam'), candidate('fees', 'fees'), candidate('work', 'due_work')],
      { exam: 20, fees: 100, due_work: 40 },
    );
    expect(cards.map((card) => card.id)).toEqual(['fees', 'work', 'exam']);
    expect(cards[0]?.prominence).toBe('featured');
  });

  it('allows live urgency to outrank a high configured category', () => {
    const cards = rankStudentHomeCards(
      [candidate('active-exam', 'exam', 120), candidate('fees', 'fees', 10)],
      { exam: 10, fees: 100 },
    );
    expect(cards[0]?.id).toBe('active-exam');
    expect(cards[0]?.priority).toBe('high');
  });

  it('uses recency as the stable tie-breaker and limits the response', () => {
    const older = { ...candidate('older', 'notification'), occurredAt: '2026-08-01T10:00:00.000Z' };
    const newer = { ...candidate('newer', 'notification'), occurredAt: '2026-08-02T10:00:00.000Z' };
    expect(rankStudentHomeCards([older, newer], null, 1).map((card) => card.id)).toEqual(['newer']);
  });
});
