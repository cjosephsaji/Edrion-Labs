import { describe, expect, it } from 'vitest';
import { TOPICS } from '../simulations/runtime';
import {
  advanceInvestigation,
  buildInvestigation,
  evidenceLabel,
  freshProgress,
  parseInvestigationSession,
} from '../core/investigation';
import {
  composeVisual,
  reviewGeometry,
  reviewVisual,
} from '../core/visual-review';

describe('controlled investigations', () => {
  it('uses independent linear arithmetic and changes the answer when input changes sign', () => {
    const a = buildInvestigation('neural'),
      b = buildInvestigation('neural', 1),
      c = buildInvestigation('neural', 2);
    expect(a.measures[0].reference).toBe(1);
    expect(a.measures[0].changed).toBeCloseTo(2.2);
    expect(a.measures[2].changed).toBeCloseTo(0.5 * (2.2 - 4) ** 2);
    expect(a.correctPrediction).toBe('less');
    expect(b.measures[0].changed).toBeCloseTo(-2.2);
    expect(b.correctPrediction).toBe('more');
    expect(b.correctReason).toBe('negative');
    expect(c.correctPrediction).toBe('more');
    expect(c.correctReason).toBe('overshoot');
  });
  it('distinguishes upward acceleration, reversal over time, and insufficient thrust', () => {
    const short = buildInvestigation('rocket'),
      long = buildInvestigation('rocket', 1),
      heavy = buildInvestigation('rocket', 2);
    expect(short.measures[0].changed).toBeLessThan(0);
    expect(short.measures[2].changed).toBeGreaterThan(0);
    expect(short.correctReason).toBe('gradual');
    expect(long.measures[0].changed).toBeGreaterThan(0);
    expect(long.correctReason).toBe('reversed');
    expect(heavy.measures[2].changed).toBeLessThan(0);
    expect(heavy.correctReason).toBe('heavy');
  });
  it('checks masking in both directions and the last-query boundary', () => {
    const on = buildInvestigation('attention'),
      off = buildInvestigation('attention', 1),
      last = buildInvestigation('attention', 2);
    expect(on.measures[0].changed).toBe(0);
    expect(off.measures[0].changed).toBeGreaterThan(0);
    expect(last.measures[0].reference).toBe(0);
    expect(last.measures[0].changed).toBe(0);
    expect(last.correctPrediction).toBe('same');
    expect(on.measures[2].changed).toBeCloseTo(100);
  });
  it('checks local following effects against a matched untouched road', () => {
    for (const i of [0, 1]) {
      const t = buildInvestigation('traffic', i);
      expect(t.measures[0].changed).toBeLessThan(t.measures[0].reference);
      expect(t.correctPrediction).toBe('less');
    }
    const ahead = buildInvestigation('traffic', 2);
    expect(ahead.measures[0].changed).toBeCloseTo(
      ahead.measures[0].reference,
      7,
    );
    expect(ahead.correctPrediction).toBe('same');
  });
  it('agrees with the analytic proper-time expression, including zero speed', () => {
    for (const i of [0, 1, 2]) {
      const t = buildInvestigation('relativity', i),
        pair = t.frames.at(-1)!;
      expect(t.measures[0].reference).toBeCloseTo(
        t.duration * Math.sqrt(1 - (+pair.reference.params.beta) ** 2),
        8,
      );
      expect(t.measures[0].changed).toBeCloseTo(
        t.duration * Math.sqrt(1 - (+pair.changed.params.beta) ** 2),
        8,
      );
      expect(t.measures[1].reference).toBeCloseTo(t.measures[1].changed, 8);
    }
  });
  it.each(TOPICS)(
    '%s has three publishable, matched-time comparisons',
    (topic) => {
      for (const i of [0, 1, 2]) {
        const t = buildInvestigation(topic, i),
          review = reviewVisual(composeVisual(t), t);
        expect(review.checks.filter((c) => !c.ok)).toEqual([]);
        expect(t.prediction.some((c) => c.id === t.correctPrediction)).toBe(
          true,
        );
        expect(t.reasons.some((c) => c.id === t.correctReason)).toBe(true);
      }
    },
  );
});

describe('learning evidence', () => {
  it('cannot reveal or claim an explanation before a prediction is committed', () => {
    const t = buildInvestigation('neural'),
      p = freshProgress();
    expect(advanceInvestigation(p, t, { type: 'inspect' })).toBe(p);
    expect(
      advanceInvestigation(p, t, { type: 'explain', id: t.correctReason }),
    ).toBe(p);
    expect(
      advanceInvestigation(p, t, { type: 'predict', id: 'invented' }),
    ).toBe(p);
  });
  it('records a corrected misconception without mislabelling it an independent correct prediction', () => {
    const t = buildInvestigation('neural');
    let p = advanceInvestigation(freshProgress(), t, {
      type: 'predict',
      id: 'more',
    });
    expect(p.attempts).toEqual([]);
    p = advanceInvestigation(p, t, { type: 'inspect' });
    p = advanceInvestigation(p, t, { type: 'explain', id: t.correctReason });
    expect(evidenceLabel(p.attempts[0])).toBe('Revised after observing');
    const next = advanceInvestigation(p, t, { type: 'next' });
    expect(next.caseIndex).toBe(1);
    expect(next.prediction).toBeNull();
    expect(next.attempts).toHaveLength(1);
  });
  it('remembers help and refuses duplicate evidence from repeated submissions', () => {
    const t = buildInvestigation('attention');
    let p = advanceInvestigation(freshProgress(), t, { type: 'hint' });
    p = advanceInvestigation(p, t, {
      type: 'predict',
      id: t.correctPrediction,
    });
    p = advanceInvestigation(p, t, { type: 'inspect' });
    p = advanceInvestigation(p, t, { type: 'explain', id: t.correctReason });
    expect(evidenceLabel(p.attempts[0])).toBe('Explained with a hint');
    expect(
      advanceInvestigation(p, t, { type: 'explain', id: t.correctReason })
        .attempts,
    ).toHaveLength(1);
    const raw = { version: 1, active: 'attention', topics: { attention: p } };
    expect(parseInvestigationSession(JSON.stringify(raw))).toEqual(raw);
  });
  it('recomputes restored scores and rejects impossible saved stages', () => {
    const t = buildInvestigation('neural');
    let p = advanceInvestigation(freshProgress(), t, {
      type: 'predict',
      id: 'more',
    });
    p = advanceInvestigation(p, t, { type: 'inspect' });
    p = advanceInvestigation(p, t, { type: 'explain', id: 'negative' });
    p.attempts[0].predictionCorrect = true;
    p.attempts[0].reasonCorrect = true;
    const restored = parseInvestigationSession(
      JSON.stringify({ version: 1, active: 'neural', topics: { neural: p } }),
    );
    expect(restored.topics.neural!.attempts[0].predictionCorrect).toBe(false);
    expect(restored.topics.neural!.attempts[0].reasonCorrect).toBe(false);
    expect(() =>
      parseInvestigationSession(
        JSON.stringify({
          version: 1,
          active: 'neural',
          topics: { neural: { ...freshProgress(), stage: 'explain' } },
        }),
      ),
    ).toThrow();
  });
});

describe('visual publication gate', () => {
  it('rejects stale measurements, misleading scales, wrong units and a different objective', () => {
    const task = buildInvestigation('neural');
    for (const mutate of [
      (s: ReturnType<typeof composeVisual>) => {
        s.marks[0].changed = 999;
      },
      (s: ReturnType<typeof composeVisual>) => {
        s.scales.prediction.max = 1;
      },
      (s: ReturnType<typeof composeVisual>) => {
        s.marks[0].unit = 'kg';
      },
      (s: ReturnType<typeof composeVisual>) => {
        s.objective = 'Unrelated objective';
      },
      (s: ReturnType<typeof composeVisual>) => {
        s.marks = [];
      },
    ]) {
      const draft = composeVisual(task);
      mutate(draft);
      expect(reviewVisual(draft, task).ok).toBe(false);
    }
    expect(reviewVisual(null as never, task).ok).toBe(false);
  });
  it('rejects an unadvertised second intervention and invalid snapshots', () => {
    const task = buildInvestigation('rocket');
    task.frames.at(-1)!.changed.params.gravity = 2;
    expect(reviewVisual(composeVisual(task), task).ok).toBe(false);
    task.frames.at(-1)!.changed.time = NaN;
    expect(reviewVisual(composeVisual(task), task).ok).toBe(false);
  });
  it('rejects labels that overlap, clip, or shrink below the legibility threshold', () => {
    const label = {
      id: 'one',
      x: 10,
      y: 10,
      width: 60,
      height: 16,
      fontPx: 14,
    };
    expect(reviewGeometry([label], 360, 370)).toEqual([]);
    expect(
      reviewGeometry([label, { ...label, id: 'two', x: 40 }], 360, 370),
    ).toContain('Overlapping labels: one, two');
    expect(reviewGeometry([{ ...label, x: 350, fontPx: 9 }], 360, 370)).toEqual(
      ['Small label: one', 'Clipped label: one'],
    );
  });
});
