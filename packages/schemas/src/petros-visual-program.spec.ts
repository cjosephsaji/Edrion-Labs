import { describe, expect, it } from 'vitest';
import {
  applyPetrosVisualCommand,
  boundPetrosVisualInput,
  initialPetrosVisualCheckpoint,
  petrosVisualProgramSchema,
  petrosVisualSnapshotSchema,
  resolvePetrosVisualViews,
  PETROS_VISUAL_VALIDATOR_VERSION,
} from './petros-visual-program';
import { adaptPetrosDiagram } from './petros-visual-adapter';
import {
  visualCompositionFixture,
  visualDiagramFixture,
  visualFixtureId,
} from './__fixtures__/petros-visual';
const command = (expectedVersion = 0) => ({
  operationId: visualFixtureId,
  expectedRevision: 1 as const,
  expectedVersion,
  action: { type: 'set_parameter' as const, parameterId: 'length', value: 3 },
});

describe('production visual program validation and binding boundary', () => {
  it('composes linked readouts in different units without a diagram type or solver', () => {
    const p = petrosVisualProgramSchema.parse(visualCompositionFixture());
    const before = initialPetrosVisualCheckpoint(p);
    const after = applyPetrosVisualCommand(p, before, command());
    expect(after.simulation).toEqual({ time: 0, values: { distance: 300 } });
    expect(before.simulation.values.distance).toBe(200);
    expect(resolvePetrosVisualViews(p, after).map((v) => v.primitives[0])).toMatchObject([
      { value: 3, unit: 'm' },
      { value: 300, unit: 'cm' },
    ]);
    expect(
      petrosVisualSnapshotSchema.parse({
        program: p,
        checkpoint: after,
        validatorVersion: PETROS_VISUAL_VALIDATOR_VERSION,
        lastOperation: null,
      }).checkpoint,
    ).toEqual(after);
  });
  it.each(['parameter', 'variable', 'view', 'primitive', 'beat', 'duplicate', 'duplicateBinding'])(
    'rejects invalid %s references',
    (kind) => {
      const p = visualCompositionFixture();
      if (kind === 'parameter') p.simulation.variables[0]!.sourceParameter = 'missing';
      if (kind === 'variable') p.bindings[0]!.variableId = 'missing';
      if (kind === 'view') p.bindings[0]!.viewId = 'missing';
      if (kind === 'primitive') p.bindings[0]!.primitiveId = 'missing';
      if (kind === 'beat') p.teachingTrack[0]!.targets[0]!.primitiveId = 'missing';
      if (kind === 'duplicate') p.parameters.push(structuredClone(p.parameters[0]!));
      if (kind === 'duplicateBinding') p.bindings.push(structuredClone(p.bindings[0]!));
      expect(petrosVisualProgramSchema.safeParse(p).success).toBe(false);
    },
  );
  it.each(['unit', 'displayUnit', 'type', 'domain', 'scope'])(
    'rejects invalid %s compatibility',
    (kind) => {
      const p = visualCompositionFixture();
      if (kind === 'unit' && p.simulation.variables[0]!.quantity.type === 'number')
        p.simulation.variables[0]!.quantity.unit = 's';
      if (kind === 'displayUnit') {
        p.bindings[0]!.primitiveId = 'line';
        p.bindings[0]!.property = 'x';
      }
      if (kind === 'type') p.bindings[0]!.property = 'visible';
      if (kind === 'domain' && p.parameters[0]!.quantity.type === 'number')
        p.parameters[0]!.quantity.min = 5;
      if (kind === 'scope') p.parameters[0]!.change = 'display_only';
      expect(petrosVisualProgramSchema.safeParse(p).success).toBe(false);
    },
  );
  it.each([NaN, Infinity, -Infinity, 1e100])('rejects nonfinite/outsize numeric values %s', (n) => {
    const p = visualCompositionFixture();
    p.views[0]!.width = n;
    expect(petrosVisualProgramSchema.safeParse(p).success).toBe(false);
  });
  it('rejects unknown capabilities, versions, generated expressions, executable keys and operations', () => {
    const p = visualCompositionFixture();
    for (const patch of [
      { capabilities: [{ id: 'javascript', version: 1 }] },
      { capabilities: [{ id: 'primitives.svg', version: 2 }] },
      { computations: [{ op: 'add', args: [1, 2] }] },
      { script: 'globalThis.fetch("https://example.test")' },
      { executionLimits: { ...p.executionLimits, maxSolverSteps: 1 } },
    ]) {
      expect(petrosVisualProgramSchema.safeParse({ ...p, ...patch }).success).toBe(false);
    }
    expect(() =>
      applyPetrosVisualCommand(p, initialPetrosVisualCheckpoint(p), {
        ...command(),
        action: { type: 'execute' },
      } as never),
    ).toThrow();
  });
  it('enforces aggregate, declared, byte, depth and cycle bounds before recursive parsing', () => {
    const p = visualCompositionFixture();
    p.executionLimits.maxPrimitives = 3;
    expect(petrosVisualProgramSchema.safeParse(p).success).toBe(false);
    expect(
      petrosVisualProgramSchema.safeParse({
        ...visualCompositionFixture(),
        description: 'x'.repeat(100_000),
      }).success,
    ).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 30; i++) deep = { next: deep };
    expect(() => boundPetrosVisualInput(deep)).toThrow('RESOURCE_LIMIT');
    const cycle: { next?: unknown } = {};
    cycle.next = cycle;
    expect(petrosVisualProgramSchema.safeParse(cycle).success).toBe(false);
  });
  it('rejects forged checkpoints, out-of-range and stale commands while preserving last valid state', () => {
    const p = visualCompositionFixture();
    const state = initialPetrosVisualCheckpoint(p);
    const saved = structuredClone(state);
    for (const cmd of [
      { ...command(), expectedVersion: 3 },
      { ...command(), action: { type: 'set_parameter', parameterId: 'length', value: 11 } },
      { ...command(), action: { type: 'set_beat', beat: 5 } },
      { ...command(), action: { type: 'set_parameter', parameterId: 'missing', value: 2 } },
    ]) {
      expect(() => applyPetrosVisualCommand(p, state, cmd as never)).toThrow();
    }
    expect(state).toEqual(saved);
    expect(() =>
      resolvePetrosVisualViews(p, { ...state, simulation: { time: 0, values: { distance: 999 } } }),
    ).toThrow('INVALID_STATE');
    expect(
      applyPetrosVisualCommand(p, state, { ...command(), action: { type: 'set_beat', beat: 1 } })
        .presentation.beat,
    ).toBe(1);
  });
  it('adapts all existing diagram types without mutating original content and rejects dangling edges', () => {
    for (const diagramType of ['concept_map', 'flowchart', 'timeline', 'comparison'] as const) {
      const d = { ...visualDiagramFixture(), diagramType };
      const saved = structuredClone(d);
      const s = adaptPetrosDiagram(d, visualFixtureId);
      expect(resolvePetrosVisualViews(s.program, s.checkpoint)[0]!.primitives.length).toBe(6);
      expect(d).toEqual(saved);
      expect(s.program.simulation.variables).toEqual([]);
    }
    const d = visualDiagramFixture();
    d.edges[0]!.to = 'missing';
    expect(() => adaptPetrosDiagram(d, visualFixtureId)).toThrow('INVALID_REFERENCE');
  });
});
