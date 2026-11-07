import { describe, it, expect } from 'vitest';
import {
  initial,
  observe,
  setParams,
  execute,
  namedAnchors,
} from '../simulations/runtime';
import {
  attentionStageState,
  beamPoints,
  contextPosition,
  nextAttentionQuery,
  queryPosition,
  shareWidth,
  tokenPosition,
} from '../stage/attention-logic';
import { createAttentionLesson } from '../stage/lessons/attention';
import { resolveStageAction } from '../stage/lesson';
import { isStageTopic, stageTarget } from '../stage/navigation';
describe('Attention Stage uses existing attention observations', () => {
  it('binds the default selected row, queries, keys, values and context without changing the engine', () => {
    const sim = initial('attention'),
      s = attentionStageState(sim),
      o = observe(sim);
    expect(s.tokens).toEqual(['the', 'cat', 'chased', 'the', 'ball']);
    expect(s.query).toBe(4);
    expect(s.causal).toBe(true);
    expect(s.weights).toEqual(JSON.parse(String(o.weights)));
    expect(s.context).toEqual(JSON.parse(String(o.context)));
    expect(s.queries).toEqual(JSON.parse(String(o.queries)));
    expect(s.keys).toEqual(JSON.parse(String(o.keys)));
    expect(s.values).toEqual(JSON.parse(String(o.values)));
    expect(s.row).toEqual(s.weights[4]);
    expect(s.rowSum).toBeCloseTo(1);
    expect(s.eligible).toBe(5);
    expect(s.tokens[s.strongest]).toBe(o.strongestToken);
    expect(() => attentionStageState(initial('rocket'))).toThrow();
  });
  it('the mask zeros future words before normalization; the first query is exactly itself', () => {
    for (let query = 0; query < 5; query++) {
      const s = attentionStageState(
        initial('attention', { query, causal: true }),
      );
      expect(s.eligible).toBe(query + 1);
      expect(s.rowSum).toBeCloseTo(1);
      s.row.forEach((w, j) =>
        j > query ? expect(w).toBe(0) : expect(w).toBeGreaterThan(0),
      );
      if (query === 0) {
        expect(s.row).toEqual([1, 0, 0, 0, 0]);
        expect(s.context).toEqual(s.values[0]);
      }
    }
  });
  it('turning the mask off makes future words eligible without pretending that words are probabilities', () => {
    const s = attentionStageState(
      initial('attention', { query: 0, causal: false }),
    );
    expect(s.eligible).toBe(5);
    expect(s.row.every((w) => w > 0)).toBe(true);
    expect(s.rowSum).toBeCloseTo(1);
    expect(s.context).not.toEqual(s.values[0]);
    expect(s.keys[0]).toEqual(s.keys[3]);
    expect(s.row[0]).toBe(s.row[3]);
  });
  it('cat→dog recomputes actual shares/context and a shorter sentence clamps the query', () => {
    const start = initial('attention'),
      dog = setParams(start, { tokens: 'the dog chased the ball' });
    expect(attentionStageState(dog).row).not.toEqual(
      attentionStageState(start).row,
    );
    expect(attentionStageState(dog).context).not.toEqual(
      attentionStageState(start).context,
    );
    const one = attentionStageState(setParams(dog, { tokens: 'cat' }));
    expect(one.query).toBe(0);
    expect(one.row).toEqual([1]);
    expect(one.context).toEqual(one.values[0]);
  });
  it('supports signed unknown vectors and 1–12 tokens without non-finite geometry', () => {
    for (const count of [1, 2, 5, 6, 7, 12]) {
      const s = attentionStageState(
        initial('attention', {
          tokens: Array.from({ length: count }, (_, i) => 'word' + i).join(' '),
          query: Math.min(11, count - 1),
        }),
      );
      expect(s.values.flat().some((v) => v < 0)).toBe(true);
      expect(s.context.every(Number.isFinite)).toBe(true);
      const points = s.tokens.map((_, i) => tokenPosition(i, count));
      expect(new Set(points.map((p) => p.join(','))).size).toBe(count);
      points.forEach((p) => {
        expect(p.every(Number.isFinite)).toBe(true);
        expect(Math.abs(p[0])).toBeLessThanOrEqual(2.75);
      });
      s.tokens.forEach((_, i) =>
        beamPoints(i, s).forEach((p) =>
          expect(p.every(Number.isFinite)).toBe(true),
        ),
      );
      expect(queryPosition(s)).toEqual(points[s.query]);
    }
    expect(contextPosition[1]).toBeGreaterThan(0);
    expect(shareWidth(0)).toBe(0);
    expect(shareWidth(0.5)).toBeLessThan(shareWidth(1));
  });
  it('Next word changes only query through the real parameter tool and wraps around', () => {
    let sim = initial('attention');
    for (let i = 0; i < 6; i++) {
      const s = attentionStageState(sim),
        lesson = createAttentionLesson(s.tokens),
        action = resolveStageAction(lesson.train.action, s),
        next = execute(sim, action.tool, action.args).state;
      expect(next.params.query).toBe(nextAttentionQuery(s));
      expect(next.time).toBe(sim.time);
      expect(next.params.tokens).toBe(sim.params.tokens);
      expect(next.params.causal).toBe(sim.params.causal);
      sim = next;
    }
  });
});
describe('Attention content and semantics', () => {
  it('each short answer has a valid real part, camera shot, demonstration and glossary link', () => {
    for (const tokens of [
      'the cat chased the ball',
      'cat',
      'word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11',
    ])
      for (const causal of [true, false]) {
        const sim = initial('attention', { tokens, causal, query: 0 }),
          s = attentionStageState(sim),
          lesson = createAttentionLesson(s.tokens),
          parts = lesson.parts.map((p) => p.id),
          shots = lesson.shots.map((p) => p.part),
          anchors = namedAnchors(sim);
        expect(lesson.chips.length).toBe(9);
        for (const part of lesson.parts) {
          expect(shots).toContain(part.id);
          expect(anchors).toContain(stageTarget('attention', part.id));
        }
        for (const chip of lesson.chips) {
          expect(parts).toContain(chip.part);
          for (const p of chip.also ?? []) expect(parts).toContain(p);
          expect(
            chip.answer(s).trim().split(/\s+/).length,
            chip.id,
          ).toBeLessThanOrEqual(50);
          expect(chip.answer(s)).not.toMatch(/NaN|undefined/);
          expect(lesson.demos[chip.demo]).toBeDefined();
        }
        for (const chip of Object.values(lesson.glossary))
          expect(lesson.chips.some((q) => q.id === chip)).toBe(true);
      }
  });
  it('prepared mask and substitution demonstrations use original engine tools', () => {
    let sim = initial('attention');
    const l = createAttentionLesson(attentionStageState(sim).tokens),
      phases = l.demos.mask;
    if (typeof phases === 'function')
      throw Error('static mask comparison expected');
    expect(phases[0].closeCard).toBe(true);
    for (const phase of phases) {
      const a = phase.action?.(attentionStageState(sim));
      if (a) sim = execute(sim, a.tool, a.args).state;
    }
    expect(sim.params.query).toBe(0);
    expect(sim.params.causal).toBe(true);
    expect(attentionStageState(sim).row).toEqual([1, 0, 0, 0, 0]);
    const swap = l.demos.swap;
    if (typeof swap === 'function') throw Error('static substitution expected');
    for (const phase of swap) {
      const a = phase.action?.(attentionStageState(sim));
      if (a) sim = execute(sim, a.tool, a.args).state;
    }
    expect(sim.params.tokens).toBe('the dog chased the ball');
    expect(sim.params.query).toBe(4);
  });
  it('explains the toy limits and distinguishes attention shares from trained weights', () => {
    const s = attentionStageState(initial('attention')),
      l = createAttentionLesson(s.tokens);
    expect(isStageTopic('attention')).toBe(true);
    expect(l.chips.find((c) => c.id === 'a-beams')!.answer(s)).toContain(
      'not the learned dial',
    );
    expect(l.chips.find((c) => c.id === 'a-chatgpt')!.answer(s)).toContain(
      'does not generate language',
    );
  });
});
