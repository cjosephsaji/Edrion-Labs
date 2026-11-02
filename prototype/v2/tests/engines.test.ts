import { describe, it, expect } from 'vitest';
import {
  initial,
  step,
  setParams,
  observe,
  restore,
  invariants,
  brake,
  TOPICS,
  execute,
  attentionOf,
} from '../simulations/runtime';
import {
  createNeural,
  neuralForward,
  neuralGradients,
} from '../simulations/foundations/neural';
import {
  createRocket,
  rocketRun,
  defaultRocketParams,
} from '../simulations/foundations/rocket';
import {
  lorentzFactor,
  lorentzTransform,
  intervalTimeSquared,
  C,
} from '../simulations/foundations/relativity';
describe('independent reference calculations', () => {
  it.each([-0.8, -0.2, 0, 0.3, 1])(
    'neural gradients match every coefficient by finite differences, input %s',
    (x) => {
      const s = createNeural([x, 0.4], 0.9),
        g = neuralGradients(s),
        eps = 1e-6;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++) {
          const plus = structuredClone(s),
            minus = structuredClone(s);
          plus.w1[i][j] += eps;
          minus.w1[i][j] -= eps;
          expect(g.w1[i][j]).toBeCloseTo(
            (neuralForward(plus).loss - neuralForward(minus).loss) / (2 * eps),
            7,
          );
        }
      for (let i = 0; i < 3; i++) {
        const plus = structuredClone(s),
          minus = structuredClone(s);
        plus.w2[i] += eps;
        minus.w2[i] -= eps;
        expect(g.w2[i]).toBeCloseTo(
          (neuralForward(plus).loss - neuralForward(minus).loss) / (2 * eps),
          7,
        );
      }
    },
  );
  it.each([0.001, 0.01, 0.03, 0.1])(
    'training reduces loss at learning rate %s',
    (rate) => {
      const s = initial('neural', { learningRate: rate, x1: -1 });
      expect(+observe(step(s, 1)).loss).toBeLessThan(+observe(s).loss);
    },
  );
  it.each([1.62, 3.71, 9.81, 20])(
    'freefall agrees with analytic displacement at g=%s',
    (g) => {
      const p = { ...defaultRocketParams, gravity: g },
        s = { ...createRocket(), altitude: 1000, velocity: 0, fuelMass: 0 };
      const r = rocketRun(p, s, 2);
      expect(r.altitude).toBeCloseTo(1000 - 0.5 * g * 4, 7);
      expect(r.velocity).toBeCloseTo(-2 * g, 7);
    },
  );
  it('impact time agrees with exact fall time', () => {
    const s = { ...createRocket(), altitude: 1, velocity: 0, fuelMass: 0 },
      r = rocketRun(defaultRocketParams, s, 5);
    expect(r.time).toBeCloseTo(Math.sqrt(2 / 9.81), 3);
    expect(r.status).toBe('crashed');
    expect(r.altitude).toBe(0);
  });
  it('doubling dry mass changes acceleration and measured descent', () => {
    const s = initial('rocket'),
      heavy = setParams(s, { dryMass: 2000 });
    expect(+observe(heavy).acceleration).toBeLessThan(+observe(s).acceleration);
    expect(+observe(step(heavy, 2)).altitude).toBeLessThan(
      +observe(step(s, 2)).altitude,
    );
  });
  it.each([0, 0.2, 0.6, 0.8, 0.99, 0.999])(
    'Lorentz interval invariant at beta=%s',
    (b) => {
      const t = lorentzTransform(0.4 * C, 1, b);
      expect(intervalTimeSquared(t.x, t.t)).toBeCloseTo(0.84, 10);
    },
  );
  it.each([
    [0.6, 1.25],
    [0.8, 5 / 3],
    [0.99, 7.088812050083354],
  ])('gamma(%s)=%s', (b, g) => expect(lorentzFactor(b)).toBeCloseTo(g, 10));
  it('one Earth second at .99c gives reciprocal gamma in ship time', () => {
    const o = observe(initial('relativity', { beta: 0.99, duration: 1 }));
    expect(o.shipSeconds).toBeCloseTo(1 / 7.088812050083354, 12);
  });
  it.each([true, false])(
    'attention row sums and explicit matrix multiplication, causal=%s',
    (causal) => {
      const a = attentionOf(
        initial('attention', { tokens: 'the cat ran on the mat', causal }),
      );
      for (let i = 0; i < a.tokens.length; i++) {
        expect(a.weights[i].reduce((s, x) => s + x, 0)).toBeCloseTo(1, 13);
        for (let d = 0; d < 4; d++)
          expect(a.contexts[i][d]).toBeCloseTo(
            a.weights[i].reduce((s, w, j) => s + w * a.values[j][d], 0),
            13,
          );
        if (causal)
          for (let j = i + 1; j < a.tokens.length; j++)
            expect(a.weights[i][j]).toBe(0);
      }
    },
  );
  it('noun replacement changes computed attention', () => {
    const s = initial('attention');
    expect(
      attentionOf(setParams(s, { tokens: 'the dog chased the ball' })).weights,
    ).not.toEqual(attentionOf(s).weights);
  });
  it.each([5, 12, 20, 30, 45])(
    'IDM remains finite, in ring, collision-free at count=%s',
    (count) => {
      let s = brake(initial('traffic', { count }));
      for (let i = 0; i < 250; i++) s = step(s, 0.1);
      expect(invariants(s).ok).toBe(true);
      const cars = [...s.data.traffic!.cars].sort(
        (a, b) => a.position - b.position,
      );
      for (let i = 0; i < cars.length; i++) {
        const gap =
          (cars[(i + 1) % cars.length].position - cars[i].position + 350) % 350;
        expect(gap).toBeGreaterThanOrEqual(4.5 - 1e-6);
      }
    },
  );
  it('braking propagates to the follower', () => {
    let s = step(initial('traffic'), 20);
    const before = s.data.traffic!.cars.find((c) => c.id === 'car_19')!.speed;
    s = step(brake(s), 1);
    expect(
      s.data.traffic!.cars.find((c) => c.id === 'car_19')!.speed,
    ).toBeLessThan(before);
  });
});
describe('input, snapshots, runtime guards', () => {
  it.each(TOPICS)('%s snapshot roundtrip remains identical', (id) => {
    const s = step(initial(id), 0.5);
    expect(restore(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it.each([NaN, Infinity, -Infinity])('reject nonfinite input %s', (v) => {
    expect(() => setParams(initial('neural'), { x1: v })).toThrow();
    expect(() => step(initial('rocket'), v)).toThrow();
  });
  it('rejects superluminal speeds, invalid density and code strings', () => {
    expect(() => setParams(initial('relativity'), { beta: 1 })).toThrow();
    expect(() => setParams(initial('traffic'), { count: 100 })).toThrow();
    expect(() =>
      setParams(initial('rocket'), { dryMass: 'alert(1)' }),
    ).toThrow();
    expect(() => setParams(initial('rocket'), { eval: 'code' })).toThrow();
  });
  it('rejects damaged snapshots', () => {
    const s = initial('neural');
    expect(() => restore({ ...s, data: { neural: {} } })).toThrow();
    expect(() => restore({ ...s, time: -1 })).toThrow();
    expect(() => restore({ ...s, version: 7 })).toThrow();
  });
  it('pause, reset, observe and bounded experiments', () => {
    let s = execute(initial('rocket'), 'sim_experiment', {
      patch: { dryMass: 2000 },
      seconds: 2,
    }).state;
    expect(s.time).toBeCloseTo(2);
    expect(execute(s, 'sim_run').state.running).toBe(true);
    expect(execute(s, 'sim_pause').state.running).toBe(false);
    expect(execute(s, 'sim_reset').state.time).toBe(0);
    expect(() => execute(s, 'sim_step', { seconds: 61 })).toThrow();
  });
});

describe('boundary parameter sweeps', () => {
  it.each([100, 1000, 10000])(
    'rocket mass %s, all throttle extremes and exhausted fuel',
    (mass) => {
      for (const throttle of [0, 0.6, 1])
        for (const fuel of [0, 450]) {
          const s = step(
            initial('rocket', { dryMass: mass, throttle, fuel }),
            20,
          );
          expect(invariants(s).ok).toBe(true);
          expect(s.data.rocket!.fuelMass).toBeGreaterThanOrEqual(0);
          expect(s.data.rocket!.time).toBeGreaterThan(0);
          expect(s.data.rocket!.time).toBeLessThanOrEqual(20.000001);
        }
    },
  );
  it.each([-5, 0, 5])(
    'neural x1=%s and learning-rate extremes remain finite',
    (x1) => {
      for (const learningRate of [0.001, 0.3])
        expect(
          invariants(
            step(initial('neural', { x1, learningRate, target: 5 }), 2),
          ).ok,
        ).toBe(true);
    },
  );
  it.each([0.5, 3])(
    'IDM headway %s and high desired speed remain bounded',
    (headway) => {
      const s = step(
        brake(initial('traffic', { count: 45, headway, desiredSpeed: 35 })),
        10,
      );
      expect(invariants(s).ok).toBe(true);
    },
  );
  it('restores refuse forged vehicle IDs and inconsistent neural inputs', () => {
    const s = initial('traffic');
    s.data.traffic!.cars[0].id = 'foreign';
    expect(() => restore(s)).toThrow('car IDs');
    const n = initial('neural');
    n.data.neural!.input[0] = 99;
    expect(() => restore(n)).toThrow('match parameters');
  });
});
it('semantic mass-scaling tool doubles total mass, preserves actual fuel', () => {
  const s = initial('rocket'),
    r = execute(s, 'sim_scale_mass', { factor: 2 });
  expect(r.observation.mass).toBe(2900);
  expect(r.state.params.dryMass).toBe(2450);
  expect(r.observation.fuel).toBe(450);
});
it('finite rocket experiments retain an integrated trajectory and stop time at impact', () => {
  const s = step(initial('rocket', { throttle: 0, fuel: 0 }), 10);
  expect(s.history.length).toBeGreaterThan(10);
  expect(s.time).toBeCloseTo(s.data.rocket!.time, 8);
  expect(s.history.at(-1)!.a).toBe(0);
});
