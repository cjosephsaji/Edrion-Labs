import { describe, expect, it } from 'vitest';
import { compileEngineProgram } from './petros-engine-compiler';
import { initialEngineSnapshot } from './petros-engine-controller';
import { evaluateEngineSnapshot } from './petros-engine-interpreter';
import { ENGINE_MODELS } from './petros-engine-models';
import { createEngineReferenceProgram } from './petros-engine-presets';
import type { EngineAuthority } from './petros-engine-contract';

describe('Phase 6 held-out cooling composition', () => {
  it('composes cooling and projectile references through shared time evaluation and independent outputs', () => {
    const authority: EngineAuthority = {
      ownerScopeRef: 'synthetic-phase6-owner', programId: '22222222-2222-4222-8222-222222222222',
      source: null, allowedCapabilities: ['render.svg', 'language.typed', 'thermal.newton-cooling.lumped', 'physics.projectile.no-drag'],
    };
    const program = createEngineReferenceProgram(authority, 'thermal.newton-cooling.lumped');
    const projectile = ENGINE_MODELS.find(model => model.id === 'physics.projectile.no-drag')!;
    program.capabilities.push({ id: projectile.id, version: projectile.version });
    program.parameters.push(
      { id: 'vx', label: 'Horizontal launch velocity', type: 'number', unit: 'm/s', initial: 3, min: -100, max: 100, change: 'restart' },
      { id: 'vy', label: 'Vertical launch velocity', type: 'number', unit: 'm/s', initial: 8, min: 0, max: 100, change: 'restart' },
      { id: 'gravity', label: 'Gravity', type: 'number', unit: 'm/s^2', initial: 10, min: 1, max: 25, change: 'restart' },
    );
    program.models.push({ id: 'flight', capabilityId: projectile.id, version: projectile.version, solver: projectile.solver,
      inputs: { vx: 'vx', vy: 'vy', gravity: 'gravity' },
      outputs: Object.fromEntries(Object.keys(projectile.outputs).map(port => [port, `flight.${port}`])) });
    const compiled = compileEngineProgram(program, authority);
    const initial = initialEngineSnapshot(compiled, '33333333-3333-4333-8333-333333333333');
    const t08 = evaluateEngineSnapshot(initial, 0.8).execution.values;
    expect(t08['model.temperature']).toBeCloseTo(293.15 + 80 * Math.exp(-0.01 * 0.8), 12);
    expect(t08['flight.x']).toBeCloseTo(2.4, 12);
    expect(t08).toMatchObject({ 'flight.y': 3.2, 'flight.vy': 0 });
    const t1 = evaluateEngineSnapshot(initial, 1).execution.values;
    // Cooling: 293.15 + 80 exp(-0.01*1); projectile: x=3t, y=8t-10t²/2.
    expect(t1['model.temperature']).toBeCloseTo(372.3539866999334, 12);
    expect(t1['flight.x']).toBeCloseTo(3, 12);
    expect(t1['flight.y']).toBeCloseTo(3, 12);
    expect(evaluateEngineSnapshot(initial, 0.8).execution.values).toEqual(t08);
  });
});
