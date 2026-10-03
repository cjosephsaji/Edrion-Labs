import { describe, expect, it, vi } from 'vitest';
import {
  PETROS_PROJECTILE_ASSUMPTIONS,
  PETROS_PROJECTILE_CAPABILITY,
  evaluatePetrosProjectile,
  petrosProjectileInputSchema,
  petrosProjectileStateSchema,
} from './petros-projectile-model';
import { projectileTrustedContext } from './__fixtures__/petros-phase2-projectile';

function input(patch: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'petros.projectile-input.v1',
    capability: PETROS_PROJECTILE_CAPABILITY,
    assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
    launchVelocity: { x: 12, y: 20, unit: 'm/s' },
    gravity: { value: 10, unit: 'm/s^2' },
    elapsedTime: { value: 0, unit: 's' },
    ...patch,
  };
}

describe('isolated projectile model candidate', () => {
  it('matches launch, apex and first ground-contact reference states', () => {
    const launch = evaluatePetrosProjectile(input());
    expect(launch).toMatchObject({ phase: 'launch', position: { x: 0, y: 0 }, velocity: { x: 12, y: 20 } });

    const apex = evaluatePetrosProjectile(input({ elapsedTime: { value: 2, unit: 's' } }));
    expect(apex).toMatchObject({
      phase: 'flight', position: { x: 24, y: 20 }, velocity: { x: 12, y: 0 },
      readouts: { flightDuration: { value: 4 }, maximumHeight: { value: 20 }, horizontalDisplacementAtLanding: { value: 48 } },
    });

    const landing = evaluatePetrosProjectile(input({ elapsedTime: { value: 4, unit: 's' } }));
    expect(landing).toMatchObject({ phase: 'ground_contact', position: { x: 48, y: 0 }, velocity: { x: 12, y: -20 } });
  });

  it('preserves speed under launch-angle rotation and responds to speed and gravity changes', () => {
    const baseline = evaluatePetrosProjectile(input());
    const faster = evaluatePetrosProjectile(input({ launchVelocity: { x: 24, y: 20, unit: 'm/s' } }));
    const rotatedAtSameSpeed = evaluatePetrosProjectile(input({ launchVelocity: { x: 16, y: Math.sqrt(288), unit: 'm/s' } }));
    const strongerGravity = evaluatePetrosProjectile(input({ gravity: { value: 20, unit: 'm/s^2' } }));

    expect(faster.readouts.horizontalDisplacementAtLanding.value).toBe(2 * baseline.readouts.horizontalDisplacementAtLanding.value);
    expect(Math.hypot(rotatedAtSameSpeed.input.launchVelocity.x, rotatedAtSameSpeed.input.launchVelocity.y))
      .toBe(Math.hypot(baseline.input.launchVelocity.x, baseline.input.launchVelocity.y));
    expect(rotatedAtSameSpeed.readouts.maximumHeight.value).toBeLessThan(baseline.readouts.maximumHeight.value);
    expect(rotatedAtSameSpeed.readouts.horizontalDisplacementAtLanding.value)
      .not.toBe(baseline.readouts.horizontalDisplacementAtLanding.value);
    expect(strongerGravity.readouts.flightDuration.value).toBe(baseline.readouts.flightDuration.value / 2);
    expect(strongerGravity.readouts.maximumHeight.value).toBe(baseline.readouts.maximumHeight.value / 2);
  });

  it('accepts zero/min/max finite boundaries and rejects invalid values, units, solver and capability', () => {
    expect(petrosProjectileInputSchema.safeParse(input({
      launchVelocity: { x: 0, y: 0, unit: 'm/s' },
      gravity: { value: 1, unit: 'm/s^2' },
      elapsedTime: { value: 0, unit: 's' },
    })).success).toBe(true);
    expect(petrosProjectileInputSchema.safeParse(input({
      launchVelocity: { x: -100, y: 100, unit: 'm/s' },
      gravity: { value: 1, unit: 'm/s^2' },
      elapsedTime: { value: 0, unit: 's' },
    })).success).toBe(true);
    expect(evaluatePetrosProjectile(input({
      launchVelocity: { x: -100, y: 100, unit: 'm/s' },
      gravity: { value: 25, unit: 'm/s^2' },
      elapsedTime: { value: 8, unit: 's' },
    })).phase).toBe('ground_contact');
    for (const bad of [
      input({ launchVelocity: { x: Number.NaN, y: 20, unit: 'm/s' } }),
      input({ launchVelocity: { x: Number.POSITIVE_INFINITY, y: 20, unit: 'm/s' } }),
      input({ launchVelocity: { x: 101, y: 20, unit: 'm/s' } }),
      input({ gravity: { value: 0, unit: 'm/s^2' } }),
      input({ gravity: { value: -1, unit: 'm/s^2' } }),
      input({ elapsedTime: { value: -0.01, unit: 's' } }),
      input({ elapsedTime: { value: 4.01, unit: 's' } }),
      input({ launchVelocity: { x: 12, y: 20, unit: 'km/h' } }),
      input({ gravity: { value: 10, unit: 'ft/s^2' } }),
      input({ capability: { ...PETROS_PROJECTILE_CAPABILITY, version: 2 } }),
      input({ capability: { ...PETROS_PROJECTILE_CAPABILITY, solver: 'generated.v1' } }),
      input({ schemaVersion: 'petros.projectile-input.v2' }),
    ]) expect(petrosProjectileInputSchema.safeParse(bad).success).toBe(false);
  });

  it('matches seeded analytic apex references throughout the declared input range', () => {
    // Fixed deterministic sample set; apex time vy/g must yield vy=0 and y=vy²/(2g).
    for (const [vx, vy, gravity] of [[-80, 12, 1], [-7.5, 33, 9.8], [0, 100, 25], [100, 1, 3.5]] as const) {
      const apexTime = vy / gravity;
      const result = evaluatePetrosProjectile(input({
        launchVelocity: { x: vx, y: vy, unit: 'm/s' },
        gravity: { value: gravity, unit: 'm/s^2' },
        elapsedTime: { value: apexTime, unit: 's' },
      }));
      expect(result.velocity.y).toBeCloseTo(0, 10);
      expect(result.position.y).toBeCloseTo((vy * vy) / (2 * gravity), 10);
      expect(result.position.x).toBeCloseTo(vx * apexTime, 10);
    }
  });

  it('rejects tampered derived state and recomputes deterministically without provider or network I/O', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const state = evaluatePetrosProjectile(input({ elapsedTime: { value: 1, unit: 's' } }));
    expect(petrosProjectileStateSchema.safeParse({ ...state, position: { ...state.position, y: 999 } }).success).toBe(false);
    const replay = evaluatePetrosProjectile(state.input);
    expect(replay).toEqual(state);
    expect(petrosProjectileInputSchema.safeParse(projectileTrustedContext).success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
