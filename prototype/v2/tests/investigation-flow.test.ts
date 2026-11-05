import { expect, it } from 'vitest';
import { TOPICS } from '../simulations/runtime';
import {
  advanceInvestigation,
  buildInvestigation,
  evidenceLabel,
  freshProgress,
  parseInvestigationSession,
  type InvestigationSession,
} from '../core/investigation';
import {
  checkpoints,
  frameInsight,
  frameMeasurements,
} from '../core/investigation-playback';

it.each(TOPICS)(
  '%s snapshot values agree with final evidence for all cases',
  (topic) => {
    for (const index of [0, 1, 2]) {
      const task = buildInvestigation(topic, index);
      const final = frameMeasurements(task, task.frames.length - 1);
      task.measures.forEach((m, i) => {
        expect(final[i].reference).toBeCloseTo(m.reference, 8);
        expect(final[i].changed).toBeCloseTo(m.changed, 8);
      });
      expect(frameMeasurements(task, 999)).toEqual(final);
      for (const point of checkpoints(task)) {
        expect(frameInsight(task, point.index).text).not.toMatch(
          /NaN|undefined|Infinity/,
        );
        expect(point.index).toBeLessThan(task.frames.length);
      }
    }
  },
);
it('describes the actual intermediate neural result and initial relativity clocks', () => {
  const neural = buildInvestigation('neural');
  expect(frameMeasurements(neural, 0)[0].changed).toBe(1);
  expect(frameMeasurements(neural, 12)[0].changed).toBeCloseTo(1.6);
  expect(frameMeasurements(neural, 24)[0].changed).toBeCloseTo(2.2);
  expect(frameInsight(neural, 12).text).toContain('1.6');
  expect(
    frameMeasurements(buildInvestigation('relativity'), 0)[0].changed,
  ).toBe(0);
});
it('restores long reflections and retains first evidence after extensive practice', () => {
  const session: InvestigationSession = { version: 1, active: 'neural', topics: {} };
  for (const topic of TOPICS) {
    let p = freshProgress();
    const cases = [0, 1, 2].map((index) => buildInvestigation(topic, index));
    for (let run = 0; run < 35; run++) {
      const index = Math.min(run, 2);
      const t = cases[index];
      if (run > 2) p = advanceInvestigation(p, t, { type: 'revisit', caseIndex: index });
      p = advanceInvestigation(p, t, { type: 'predict', id: t.correctPrediction });
      p = advanceInvestigation(p, t, { type: 'inspect' });
      p = advanceInvestigation(p, t, { type: 'explain', id: t.correctReason });
      p = advanceInvestigation(p, t, { type: 'reflect', text: '\u0001'.repeat(1000) });
      if (run < 2) p = advanceInvestigation(p, t, { type: 'next' });
    }
    expect(p.attempts).toHaveLength(30);
    expect(p.attempts.slice(0, 3).map((a) => a.caseId)).toEqual([0, 1, 2].map((i) => `${topic}:${i}:v1`));
    expect(p.attempts[2].revisited).toBeUndefined();
    expect(p.attempts.at(-1)?.revisited).toBe(true);
    session.topics[topic] = p;
  }
  const raw = JSON.stringify(session);
  expect(raw.length).toBeGreaterThan(60000);
  expect(parseInvestigationSession(raw)).toEqual(session);
  expect(() => parseInvestigationSession('x'.repeat(1000001))).toThrow('too large');
});
it('rejects a missing saved case index instead of defaulting silently', () => {
  const { caseIndex, ...incomplete } = freshProgress();
  expect(() => parseInvestigationSession(JSON.stringify({
    version: 1, active: 'neural', topics: { neural: incomplete },
  }))).toThrow('Invalid case');
});
it('keeps the original evidence and reflection when practising a completed case', () => {
  const t = buildInvestigation('neural');
  let p = advanceInvestigation(freshProgress(), t, {
    type: 'predict',
    id: 'more',
  });
  p = advanceInvestigation(p, t, { type: 'inspect' });
  p = advanceInvestigation(p, t, { type: 'explain', id: 'negative' });
  p = advanceInvestigation(p, t, {
    type: 'reflect',
    text: 'I forgot the input sign.',
  });
  p = advanceInvestigation(p, t, { type: 'revisit', caseIndex: 0 });
  expect(p.stage).toBe('predict');
  expect(p.attempts[0].reflection).toBe('I forgot the input sign.');
  p = advanceInvestigation(p, t, { type: 'predict', id: t.correctPrediction });
  p = advanceInvestigation(p, t, { type: 'inspect' });
  p = advanceInvestigation(p, t, { type: 'explain', id: t.correctReason });
  expect(p.attempts).toHaveLength(2);
  expect(p.attempts[0].reasonCorrect).toBe(false);
  expect(evidenceLabel(p.attempts[1])).toBe('Practised after feedback');
  expect(
    parseInvestigationSession(
      JSON.stringify({ version: 1, active: 'neural', topics: { neural: p } }),
    ).topics.neural,
  ).toEqual(p);
});
it('prevents practising unvisited cases and editing evidence before reflection', () => {
  const t = buildInvestigation('rocket'),
    p = freshProgress();
  expect(advanceInvestigation(p, t, { type: 'revisit', caseIndex: 1 })).toBe(p);
  expect(
    advanceInvestigation(p, t, { type: 'reflect', text: 'pretend evidence' }),
  ).toBe(p);
  expect(advanceInvestigation(p, t, { type: 'revisit', caseIndex: NaN })).toBe(
    p,
  );
});
it('bounds reflection text and rejects mismatched final saved evidence', () => {
  const t = buildInvestigation('attention');
  let p = advanceInvestigation(freshProgress(), t, {
    type: 'predict',
    id: t.correctPrediction,
  });
  p = advanceInvestigation(p, t, { type: 'inspect' });
  p = advanceInvestigation(p, t, { type: 'explain', id: t.correctReason });
  p = advanceInvestigation(p, t, { type: 'reflect', text: 'a'.repeat(1200) });
  expect(p.attempts[0].reflection).toHaveLength(1000);
  p.attempts.push({ ...p.attempts[0], reason: 'last' });
  expect(() =>
    parseInvestigationSession(
      JSON.stringify({
        version: 1,
        active: 'attention',
        topics: { attention: p },
      }),
    ),
  ).toThrow('Missing evidence');
});
