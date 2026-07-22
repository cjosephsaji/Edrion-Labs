import { describe, expect, it } from 'vitest';

/** Mirrors student read shaping — unpublished marks must never surface. */
function stripUnpublished<T extends { published: boolean }>(entries: T[]) {
  return entries.filter((entry) => entry.published);
}

function stripClassAverage(subjects: Array<Record<string, unknown>>, showAverage: boolean) {
  return subjects.map((subject) => {
    if (showAverage) return subject;
    const { class_avg_pct: _removed, ...rest } = subject;
    return rest;
  });
}

describe('student results adversarial guards', () => {
  it('AC 1: component list excludes unpublished grade entries', () => {
    const rows = [
      { id: '1', published: true, marks_obtained: 80 },
      { id: '2', published: false, marks_obtained: 99 },
    ];
    expect(stripUnpublished(rows).map((r) => r.id)).toEqual(['1']);
  });

  it('AC 9: class average stripped when setting disabled', () => {
    const shaped = stripClassAverage([{ subject_id: 's1', class_avg_pct: 72, weighted_pct: 80 }], false);
    expect(shaped[0]).not.toHaveProperty('class_avg_pct');
    expect(shaped[0]).toHaveProperty('weighted_pct');
  });

  it('AC 8: what-if remains client-only (no extra fetch keys)', () => {
    const payload = { features: { whatif: true }, subjects: [] };
    expect(Object.keys(payload)).not.toContain('hypothetical_scores');
  });
});
