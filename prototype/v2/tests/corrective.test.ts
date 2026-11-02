import { it, expect } from 'vitest';
import { linearObservation } from '../simulations/foundations/linear';
import {
  lessonModel,
  opening,
  predictions,
  respond,
  rocketComparison,
  transferSetup,
  transferResult,
} from '../core/teaching';
import { observe, TOPICS, initial, step, brake } from '../simulations/runtime';
import { compile } from '../core/scene-compiler';
import { namedAnchors } from '../simulations/runtime';
import { emptyScene } from '../core/scene-ir';
it('linear golden example and finite-difference derivative agree', () => {
  const o = linearObservation(2, 0.5, 4),
    eps = 1e-6;
  expect(o.prediction).toBe(1);
  expect(o.loss).toBe(4.5);
  expect(o.gradient).toBe(-6);
  expect(o.gradient).toBeCloseTo(
    (linearObservation(2, 0.5 + eps, 4).loss -
      linearObservation(2, 0.5 - eps, 4).loss) /
      (2 * eps),
    8,
  );
  const s = step(lessonModel('neural'), 1 / 60);
  expect(s.params.weight).toBeCloseTo(1.1);
  expect(observe(s).loss).toBeCloseTo(1.62);
});
it.each(TOPICS)(
  '%s openings and both answer branches commit valid semantic targets',
  (id) => {
    let sim = lessonModel(id);
    for (let i = 0; i < 4; i++) {
      const r = opening(sim, i);
      sim = r.sim;
      expect(r.beat.say.length).toBeGreaterThan(30);
      expect(
        compile(emptyScene(), r.beat.visualCommands, namedAnchors(sim)).ok,
      ).toBe(true);
    }
    expect(opening(sim, 3).beat.awaitStudent).toBe(true);
    for (const answer of [0, 1]) {
      const r = respond(sim, answer);
      expect(r.correct).toBe(answer === predictions[id].correct);
      expect(
        compile(emptyScene(), r.beat.visualCommands, namedAnchors(r.sim)).ok,
      ).toBe(true);
      const transfer = transferSetup(r.sim);
      expect(transfer.beat.awaitStudent).toBe(true);
      expect(transferResult(transfer.sim, answer).beat.teachingMove).toBe(
        'EXPLORE',
      );
    }
  },
);
it('rocket comparisons include actual crash, soft landing and overshoot', () => {
  const c = rocketComparison();
  expect(observe(c.under).status).toBe('crashed');
  expect(observe(c.timed).status).toBe('landed');
  expect(Math.abs(+observe(c.timed).velocity)).toBeLessThanOrEqual(2);
  expect(+observe(c.over).altitude).toBeGreaterThan(120);
  expect(step(initial('rocket'), 2)).toEqual(step(initial('rocket'), 2));
});
it('density cases are distinguishable after identical braking', () => {
  const low = observe(step(brake(initial('traffic', { count: 8 })), 20));
  const high = observe(step(brake(initial('traffic', { count: 40 })), 20));
  expect(+low.meanSpeed).toBeGreaterThan(+high.meanSpeed + 3);
});

import { explicitParameterPatch } from '../server/parameter-intent';
it('explicit following time is a model parameter, not experiment duration', () => {
  expect(
    explicitParameterPatch(
      'Set the following time to 2.4 seconds, brake a car, and show the computed change.',
      initial('traffic'),
    ),
  ).toEqual({ headway: 2.4 });
  expect(
    explicitParameterPatch(
      'Do not set the following time to 2.4 seconds.',
      initial('traffic'),
    ),
  ).toEqual({});
  expect(() =>
    explicitParameterPatch(
      'Set the following time to 99 seconds.',
      initial('traffic'),
    ),
  ).toThrow();
  expect(
    explicitParameterPatch('Set input x1 to -2.', initial('neural')),
  ).toEqual({ x1: -2 });
  expect(
    explicitParameterPatch(
      'Try 0.95c for 10 Earth seconds. Why can both observers call the other clock slow?',
      initial('relativity'),
    ),
  ).toEqual({ beta: 0.95 });
  expect(
    explicitParameterPatch(
      'Replace cat with dog. Show why its attention shares change.',
      initial('attention'),
    ),
  ).toEqual({ tokens: 'the dog chased the ball' });
  expect(() =>
    explicitParameterPatch('Replace elephant with dog.', initial('attention')),
  ).toThrow('no “elephant”');
});
