import { describe, expect, it } from 'vitest';
import { step, setParams } from '../simulations/runtime';
import { lessonModel, transfers } from '../core/teaching';
import { neuralLesson } from '../stage/lessons/neural';
import {
  closeness,
  closenessColor,
  neuralStageState,
  numberLineRange,
  numberY,
} from '../stage/logic';
import { palette } from '../stage/palette';
import { Color } from 'three';
describe('Stage uses the existing Neural engine', () => {
  it('one step is one real update: .5 → 1.1, prediction 2.2, loss 1.62', () => {
    const s = neuralStageState(step(lessonModel('neural'), 1 / 60));
    expect(s.weight).toBeCloseTo(1.1);
    expect(s.prediction).toBeCloseTo(2.2);
    expect(s.loss).toBeCloseTo(1.62);
    expect(s.steps).toBe(1);
  });
  it('negative inputs learn the correct direction, without reference-only math', () => {
    const start = setParams(lessonModel('neural'), transfers.neural.patch),
      s = neuralStageState(step(start, 1 / 60));
    expect(s.weight).toBeCloseTo(-0.5);
    expect(s.prediction).toBeCloseTo(1);
    expect(s.loss).toBeLessThan(neuralStageState(start).loss);
  });
});
describe('range, color and content grounding', () => {
  it('contains zero, all fresh examples, and extreme current engine outputs without clipping', () => {
    for (const input of [-5, -2, 0, 2, 5])
      for (const weight of [-10, 0.5, 0.7, 10]) {
        const s = neuralStageState(
            setParams(lessonModel('neural'), { x1: input, weight }),
          ),
          r = numberLineRange(s);
        expect(r.min).toBeLessThan(0);
        expect(r.max).toBeGreaterThan(0);
        expect(r.ticks).toContain(0);
        for (const v of [s.prediction, s.target, -1, -1.4]) {
          expect(v).toBeGreaterThanOrEqual(r.min);
          expect(v).toBeLessThanOrEqual(r.max);
          expect(numberY(v, r)).toBeGreaterThanOrEqual(0.45);
          expect(numberY(v, r)).toBeLessThanOrEqual(4.8);
        }
        expect(numberY(0, r)).toBeGreaterThan(numberY(r.min, r));
      }
  });
  it('interpolates amber → mint, clamps and accounts for negative errors', () => {
    expect(closeness(4, 4)).toBe(1);
    expect(closeness(0, 4)).toBe(0);
    expect(closeness(8, 4)).toBe(0);
    expect(closeness(2, 4)).toBe(0.5);
    expect(closeness(100, -4)).toBe(0);
    expect(closenessColor(4, 4).getHex()).toBe(
      new Color(palette.mint).getHex(),
    );
    expect(closenessColor(0, 4).getHex()).toBe(
      new Color(palette.amber).getHex(),
    );
  });
  it('every chip has a valid part, shot, short answer and demonstration, in the requested order', () => {
    const ids = neuralLesson.parts.map((p) => p.id),
      shots = neuralLesson.shots.map((s) => s.part);
    expect(neuralLesson.chips.map((q) => q.id)).toEqual([
      'q-weight',
      'q-input-number',
      'q-why-2.0',
      'q-prediction',
      'q-target',
      'q-loss',
      'q-step',
      'q-why-weight',
      'q-chatgpt',
    ]);
    for (const params of [
      {},
      transfers.neural.patch,
      { x1: 1.7, weight: -0.3, target: -2 },
    ]) {
      const s = neuralStageState(setParams(lessonModel('neural'), params));
      for (const q of neuralLesson.chips) {
        expect(ids).toContain(q.part);
        expect(shots).toContain(q.part);
        for (const id of q.also ?? []) expect(ids).toContain(id);
        expect(
          q.answer(s).trim().split(/\s+/).length,
          q.id,
        ).toBeLessThanOrEqual(50);
        expect(q.demo.length).toBeGreaterThan(0);
      }
    }
    for (const id of Object.values(neuralLesson.glossary))
      expect(neuralLesson.chips.some((q) => q.id === id)).toBe(true);
  });
  it('never calls a negative input negative study hours', () => {
    const s = neuralStageState(
      setParams(lessonModel('neural'), transfers.neural.patch),
    );
    expect(neuralLesson.story.enabled(s)).toBe(false);
    expect(neuralLesson.chips[1].answer(s)).toContain(
      'abstract signed example',
    );
  });
});
