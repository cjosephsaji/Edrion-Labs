import { describe, expect, it } from 'vitest';
import {
  initial,
  observe,
  setParams,
  step,
  execute,
  type Simulation,
} from '../simulations/runtime';
import { rocketComparison, lessonModel, interpret } from '../core/teaching';
import { rocketLesson } from '../stage/lessons/rocket';
import {
  altitudeY,
  rocketPose,
  rocketRuler,
  rocketStageState,
  preparedRocketLanding,
} from '../stage/rocket-logic';
import { format } from '../stage/logic';
import { isStageTopic, stageTarget } from '../stage/navigation';

describe('Rocket Stage binds to the flight engine', () => {
  it('shows actual signed motion, force, fuel, mass and engine time', () => {
    const sim = step(setParams(lessonModel('rocket'), { throttle: 0.8 }), 0.5);
    const s = rocketStageState(sim),
      o = observe(sim);
    expect(s.altitude).toBe(o.altitude);
    expect(s.velocity).toBe(o.velocity);
    expect(s.time).toBe(o.flightTime);
    expect(s.fuel).toBe(o.fuel);
    expect(s.mass).toBe(o.mass);
    expect(s.thrust).toBe(o.thrust);
    expect(s.acceleration).toBe(o.acceleration);
    expect(s.velocity).toBeLessThan(0);
    expect(s.acceleration).toBeGreaterThan(0);
    expect(s.velocity).toBeGreaterThan(-12);
    expect(s.gravityForce).toBeCloseTo(s.mass * s.gravity);
    expect(s.history).toEqual(sim.history.map((h) => h.b));
    expect(() => rocketStageState(initial('neural'))).toThrow();
  });
  it('throttle edits preserve current height, velocity, fuel and time while changing thrust', () => {
    const sim = step(lessonModel('rocket'), 1),
      next = setParams(sim, { throttle: 1 });
    const before = rocketStageState(sim),
      after = rocketStageState(next);
    for (const key of ['altitude', 'velocity', 'fuel', 'time'] as const)
      expect(after[key]).toBe(before[key]);
    expect(after.thrust).toBe(24000);
    expect(after.acceleration).toBeGreaterThan(before.acceleration);
  });
  it('an empty tank has no thrust at 100%; doubling total mass reduces acceleration', () => {
    const empty = rocketStageState(
      step(initial('rocket', { fuel: 0, throttle: 1 }), 1),
    );
    expect(empty.throttle).toBe(1);
    expect(empty.thrust).toBe(0);
    expect(empty.velocity).toBeCloseTo(-21.81);
    const start = lessonModel('rocket');
    const heavy = execute(start, 'sim_scale_mass', { factor: 2 }).state;
    const s = rocketStageState(start),
      h = rocketStageState(heavy);
    expect(h.mass).toBe(s.mass * 2);
    expect(h.thrust).toBe(s.thrust);
    expect(h.acceleration).toBeLessThan(s.acceleration);
    expect(rocketPose(h).gravityLength).toBeGreaterThan(
      rocketPose(h).thrustLength,
    );
  });
  it('the ruler includes pad zero and scales from configuration and current height', () => {
    for (const altitude of [20, 60, 120, 500, 1000]) {
      const s = rocketStageState(initial('rocket', { altitude })),
        r = rocketRuler(s);
      expect(r.ticks[0]).toBe(0);
      expect(r.max).toBeGreaterThanOrEqual(altitude);
      expect(r.ticks.at(-1)).toBe(r.max);
      expect(r.ticks.length).toBeLessThanOrEqual(8);
      expect(altitudeY(0, s)).toBe(0.14);
      expect(altitudeY(r.max, s)).toBeCloseTo(3.79);
      expect(altitudeY(altitude, s)).toBeGreaterThan(0.14);
    }
    const s = rocketStageState(initial('rocket'));
    expect(rocketRuler({ ...s, altitude: 1300 }).max).toBeGreaterThanOrEqual(
      1300,
    );
  });
  it('the prepared replay samples the existing comparison, including the exact terminal state', () => {
    const reference = rocketComparison(),
      frames = preparedRocketLanding();
    expect(frames.length).toBeGreaterThan(20);
    expect(frames[0]).toEqual(lessonModel('rocket'));
    expect(frames.at(-1)).toEqual(reference.timed);
    const s = rocketStageState(frames.at(-1)!);
    expect(s.status).toBe('landed');
    expect(s.altitude).toBe(0);
    expect(Math.abs(s.velocity)).toBeLessThanOrEqual(s.safeSpeed);
    expect(rocketStageState(reference.under).status).toBe('crashed');
    expect(rocketStageState(reference.over).altitude).toBeGreaterThan(120);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].time).toBeGreaterThan(frames[i - 1].time);
      expect(frames[i].data.rocket!.fuelMass).toBeLessThanOrEqual(
        frames[i - 1].data.rocket!.fuelMass,
      );
    }
    expect(step(frames.at(-1)!, 1)).toEqual(frames.at(-1));
    expect(frames[0].data.rocket!.altitude).toBe(120);
  });
});
describe('Rocket content and shared lesson contract', () => {
  it('terminal readouts describe contact velocity rather than continuing motion', () => {
    const start = lessonModel('rocket'),
      landed = preparedRocketLanding().at(-1)!,
      crash = rocketComparison().under;
    for (const sim of [landed, crash]) {
      const text = interpret(sim, start, 'sim_step').say;
      expect(text).toContain('at rest now');
      expect(text).toContain('recorded velocity at contact');
      expect(text).not.toContain('acceleration');
      expect(rocketLesson.metric.displayName?.(rocketStageState(sim))).toBe(
        'Contact velocity',
      );
    }
  });

  it('every part is inspectable with a shot; every short answer and demo is valid in flight and at contact', () => {
    const ids = rocketLesson.parts.map((p) => p.id),
      shots = rocketLesson.shots.map((s) => s.part),
      chips = rocketLesson.chips.map((c) => c.id);
    const examples: Simulation[] = [
      lessonModel('rocket'),
      step(initial('rocket', { throttle: 0.8 }), 0.5),
      initial('rocket', { fuel: 0 }),
      step(initial('rocket', { throttle: 0 }), 20),
      preparedRocketLanding().at(-1)!,
    ];
    for (const part of rocketLesson.parts) {
      expect(shots).toContain(part.id);
      expect(chips).toContain(part.chip);
    }
    for (const sim of examples) {
      const s = rocketStageState(sim);
      for (const chip of rocketLesson.chips) {
        expect(ids).toContain(chip.part);
        for (const id of chip.also ?? []) expect(ids).toContain(id);
        expect(
          chip.answer(s).trim().split(/\s+/).length,
          chip.id,
        ).toBeLessThanOrEqual(50);
        expect(rocketLesson.demos[chip.demo]).toBeDefined();
        expect(chip.answer(s)).not.toMatch(/NaN|undefined/);
      }
    }
    for (const chip of Object.values(rocketLesson.glossary))
      expect(chips).toContain(chip);
  });
  it('prepared landing phases are immutable engine snapshots with explicit accelerated playback', () => {
    const definition = rocketLesson.demos.landing;
    expect(typeof definition).toBe('function');
    if (typeof definition !== 'function')
      throw Error('dynamic prepared burn expected');
    const s = rocketStageState(lessonModel('rocket')),
      phases = definition(s);
    expect(phases[0].closeCard).toBe(true);
    expect(phases[0].focus).toBe(null);
    expect(phases[0].message?.(s, true)).toMatch(/accelerated/);
    expect(phases.at(-1)!.message?.(s, true)).toMatch(/Soft landing/);
    const final = phases.filter((p) => p.action).at(-1)!.action!(s);
    const restored = execute(
      lessonModel('rocket'),
      final.tool,
      final.args ?? {},
    ).state;
    expect(rocketStageState(restored).status).toBe('landed');
  });
  it('only completed Stage topics are enabled; aliases retain the existing tutor IDs', () => {
    expect(isStageTopic('rocket')).toBe(true);
    expect(isStageTopic('relativity')).toBe(true);
    expect(stageTarget('rocket', 'altitude-line')).toBe('altitude');
    expect(stageTarget('rocket', 'thrust')).toBe('rocket');
    expect(stageTarget('rocket', 'fuel')).toBe('fuel');
    expect(stageTarget('neural', 'number-line')).toBe('prediction');
    expect(format(-0.03, 1)).toBe('0.0');
    expect(format(0.004, 3)).toBe('0.004');
  });
});
