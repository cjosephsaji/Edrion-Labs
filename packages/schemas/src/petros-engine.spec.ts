import { describe, expect, it } from 'vitest';
import { projectileBinding } from './__fixtures__/petros-phase2-projectile';
import { createHeldOutEngineProgram } from './__fixtures__/petros-engine-held-out';
import { visualDiagramFixture } from './__fixtures__/petros-visual';
import { compileEngineProgram } from './petros-engine-compiler';
import { createEngineViewEvaluator, inverseEngineInput, resolveEngineViews } from './petros-engine-bindings';
import { applyEngineCommand, branchEngineSnapshot, initialEngineSnapshot, previewEngineCommand } from './petros-engine-controller';
import { ENGINE_LIMITS, ENGINE_VERSION, type EngineAuthority, type EngineProgram, type EngineSnapshot } from './petros-engine-contract';
import { createEngineValueEvaluator, evaluateEngineSnapshot, evaluateEngineValues, validateEngineSnapshot } from './petros-engine-interpreter';
import { ENGINE_MODELS, createEngineCircuitTopology } from './petros-engine-models';
import { adaptLegacyEngineDiagram, createEngineReferenceProgram } from './petros-engine-presets';
import { createEngineSpatialFixture, projectEngineSpatialPoint } from './petros-engine-spatial';
import { describeEngineCapabilities } from './petros-engine-registry';

const programId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const otherBranchId = '44444444-4444-4444-8444-444444444444';
const authority: EngineAuthority = {
  ownerScopeRef: 'synthetic-owner:lesson:1', programId, source: projectileBinding,
  allowedCapabilities: ['render.svg', 'language.typed', 'render.spatial', ...ENGINE_MODELS.map(model => model.id)],
};
const compile = (program: EngineProgram, owner: EngineAuthority = { ...authority, source: program.source }) => compileEngineProgram(program, owner);
const snapshot = (program: EngineProgram) => initialEngineSnapshot(compile(program), branchId);
const command = (state: EngineSnapshot, action: Parameters<typeof previewEngineCommand>[1]) => ({
  schemaVersion: 'petros.engine-command.v1' as const, programId: state.program.programId,
  operationId: '55555555-5555-4555-8555-555555555555', expectedRevision: state.program.revision,
  expectedExperimentVersion: state.execution.version, expectedDraftVersion: state.draft.version,
  target: 'program', purpose: 'Synthetic local verification', action,
});
const apply = (state: EngineSnapshot, action: Parameters<typeof previewEngineCommand>[1]) =>
  applyEngineCommand(state, command(state, action), { ...authority, source: state.program.source });

describe('Petros visual engine contract and local execution', () => {
  it('compiles every registered trusted reference preset against an owner and valid source fixture', () => {
    for (const model of ENGINE_MODELS) {
      const program = createEngineReferenceProgram(authority, model.id);
      const compiled = compile(program);
      expect(compiled.report).toMatchObject({ status: 'structurally_valid', generatedExecutable: 'disabled', scientificStatus: 'validated_capabilities_only' });
      expect(compiled.report.capabilities.some(capability => capability.id === model.id && capability.solver === model.solver)).toBe(true);
      expect(validateEngineSnapshot(initialEngineSnapshot(compiled, branchId)).snapshot.program.programId).toBe(programId);
    }
  });

  it('advertises complete trust metadata and denies unknown, disabled, or unapproved capabilities', () => {
    const registry = describeEngineCapabilities();
    expect(registry.programVersion).toBe(ENGINE_VERSION);
    for (const capability of registry.capabilities) {
      expect(capability).toMatchObject({ version: 1, enabled: expect.any(Boolean), trust: expect.any(String),
        solver: expect.any(String), renderer: expect.any(String), assetLicense: expect.any(String), executionBudget: expect.any(Object) });
      expect(capability).toHaveProperty('parameterRanges');
      expect(capability).toHaveProperty('assumptions');
      expect(capability).toHaveProperty('limitations');
    }
    expect(registry.capabilities.find(capability => capability.id === 'extension.executable')?.enabled).toBe(false);
    const base = createHeldOutEngineProgram(authority);
    for (const id of ['unknown.capability', 'extension.executable'])
      expect(() => compile({ ...base, capabilities: [...base.capabilities, { id, version: 1 }] })).toThrow('PETROS_ENGINE_UNSUPPORTED_CAPABILITY');
    expect(() => compile(base, { ...authority, source: null, allowedCapabilities: ['render.svg'] })).toThrow('PETROS_ENGINE_UNSUPPORTED_CAPABILITY');
    expect(() => compile(base, { ...authority, ownerScopeRef: 'other-owner' })).toThrow('PETROS_ENGINE_OWNER_SOURCE_AUTHORITY');
    expect(() => compile(base, { ...authority, source: projectileBinding })).toThrow('PETROS_ENGINE_OWNER_SOURCE_AUTHORITY');
    expect(() => compile({ ...base, schemaVersion: 'petros.visual-program.v3' } as never)).toThrow();
    expect(() => compile({ ...base, capabilities: [{ id: 'render.svg', version: 2 }] } as never)).toThrow();
    const forgedConcept = structuredClone(base);
    forgedConcept.entities[0]!.conceptId = 'unapproved_concept';
    expect(() => compile(forgedConcept)).toThrow('CONCEPT_AUTHORITY');
  });

  it('rejects dimensions, types, unresolved references, cycles, duplicate writes, and invalid topology', () => {
    const base = createHeldOutEngineProgram(authority);
    const invalid = (mutate: (program: EngineProgram) => void, code: string) => {
      const program = structuredClone(base); mutate(program); expect(() => compile(program)).toThrow(code);
    };
    invalid(p => { p.computations.find(e => e.id === 'gainHeight')!.unit = 's'; }, 'UNIT_MISMATCH');
    invalid(p => { p.computations.find(e => e.id === 'above')!.type = 'number'; }, 'UNIT_MISMATCH');
    invalid(p => { p.computations.find(e => e.id === 'gainHeight')!.args[0] = 'missing'; }, 'INVALID_REFERENCE');
    invalid(p => { p.computations.find(e => e.id === 'gainHeight')!.args[0] = 'gainHeight'; }, 'DEPENDENCY_CYCLE');
    invalid(p => { p.behaviors.push({ id: 'again', at: 0.5, assignments: [{ stateId: 'crossed', expressionId: 'above' }] }); }, 'DUPLICATE_EVENT_WRITE');
    invalid(p => { p.models[1]!.topology = createEngineCircuitTopology(true); }, 'UNSUPPORTED_TOPOLOGY');
    invalid(p => { p.bindings[0]!.mapping = { kind: 'identity' }; }, 'UNIT_MISMATCH');
    invalid(p => { p.inverseInputs[0]!.scale = 0; }, 'INVALID_INVERSE');
    invalid(p => { p.models[0]!.solver = 'unknown'; }, 'UNSUPPORTED_SOLVER');
  });

  it('bounds malformed objects, executable payloads, URLs and aggregate resources before execution', () => {
    const base = createHeldOutEngineProgram(authority);
    const accessor = structuredClone(base) as EngineProgram;
    Object.defineProperty(accessor, 'title', { enumerable: true, get: () => { throw new Error('executed'); } });
    expect(() => compile(accessor)).toThrow('PETROS_ENGINE_INVALID_STRUCTURE');
    const cycle = structuredClone(base) as EngineProgram & { extra?: unknown }; cycle.extra = cycle;
    expect(() => compile(cycle)).toThrow('PETROS_ENGINE_INVALID_STRUCTURE');
    expect(() => compile({ ...base, script: 'fetch("https://example.invalid")' } as never)).toThrow();
    expect(() => compile({ ...base, assetUrl: 'https://example.invalid/image.svg' } as never)).toThrow();
    expect(() => compile({ ...base, __proto__: {} } as never)).toThrow();
    expect(() => compile({ ...base, title: 'x'.repeat(ENGINE_LIMITS.bytes) })).toThrow('PETROS_ENGINE_RESOURCE_LIMIT');
    const huge = structuredClone(base); huge.views[0]!.primitives = Array.from({ length: 201 }, (_, index) => ({
      id: `p${index}`, entityId: 'flight', layerId: 'main', kind: 'point' as const, description: 'bounded', x: 0, y: 0, visible: true,
    }));
    expect(() => compile(huge)).toThrow();
  });

  it('runs held-out mixed models through the same compiler, view bindings, events and text equivalents', () => {
    const p = createHeldOutEngineProgram(authority);
    const c = compile(p);
    expect(c.report.scientificStatus).toBe('validated_capabilities_only');
    const s = evaluateEngineSnapshot(initialEngineSnapshot(c, branchId), 0.5);
    expect(s.execution.values['flight.x']).toBeCloseTo(1.5);
    expect(s.execution.values['flight.y']).toBeCloseTo(2.75);
    expect(s.execution.values['loop.current']).toBeCloseTo(2);
    expect(s.execution.values.crossed).toBe(true);
    const views = resolveEngineViews(s);
    expect(views.find(view => view.id === 'scene')!.primitives.find(primitive => primitive.id === 'body')).toMatchObject({ x: 50, y: 90 });
    expect(views.find(view => view.id === 'data')!.primitives.find(primitive => primitive.id === 'height')).toMatchObject({ value: 275, unit: 'cm' });
    expect(views.find(view => view.id === 'data')!.primitives.find(primitive => primitive.id === 'current')).toMatchObject({ value: 2, unit: 'A' });
    expect(views.find(view => view.id === 'data')!.primitives.find(primitive => primitive.id === 'samples')!.points).toHaveLength(4);
    expect(s.execution.events).toEqual(expect.arrayContaining([{ modelId: 'projectile', id: 'launch', time: 0 }]));
    expect(evaluateEngineValues(c, s.execution.parameters, 0.5).values).toEqual(s.execution.values);
  });

  it('shares constrained inverse mapping between numeric and manipulation paths', () => {
    const s = snapshot(createHeldOutEngineProgram(authority));
    const inverse = inverseEngineInput(s, 'heightGain', 35, 'px');
    expect(inverse).toEqual({ type: 'set_parameter', parameterId: 'display.gain', value: 3, unit: '1' });
    const changed = apply(s, inverse);
    expect(changed.execution.parameters['display.gain']).toBe(3);
    expect(changed.execution.time).toBe(0);
    expect(() => inverseEngineInput(s, 'heightGain', 35, 'm')).toThrow('PETROS_ENGINE_INVALID_INVERSE');
    expect(() => inverseEngineInput(s, 'heightGain', 1000, 'px')).toThrow('PETROS_ENGINE_PARAMETER_DOMAIN');
  });

  it('replays, intervenes, restarts, branches, restores views and rejects stale writes', () => {
    const base = snapshot(createHeldOutEngineProgram(authority));
    const atOne = apply(base, { type: 'seek', time: 1 });
    const opened = apply(atOne, { type: 'set_parameter', parameterId: 'loop.closed', value: false, unit: '1' });
    expect(opened.execution.inputEvents).toEqual([{ parameterId: 'loop.closed', value: false, time: 1 }]);
    expect(opened.execution.values['loop.current']).toBe(0);
    expect(evaluateEngineSnapshot(opened, 0.5).execution.values['loop.current']).toBe(2);
    expect(apply(opened, { type: 'seek', time: 1.5 }).execution.values['loop.current']).toBe(0);
    expect(() => apply(opened, { type: 'set_parameter', parameterId: 'loop.closed', value: true, unit: '1' })).toThrow('PETROS_ENGINE_BRANCH_BEFORE_INTERVENTION');
    expect(() => applyEngineCommand(opened, command(atOne, { type: 'pause' }), { ...authority, source: opened.program.source })).toThrow('PETROS_ENGINE_STALE');
    expect(() => apply(opened, { type: 'set_parameter', parameterId: 'loop.voltage', value: 15, unit: 'A' })).toThrow('PETROS_ENGINE_PARAMETER_UNIT');
    const branch = branchEngineSnapshot(opened, atOne, otherBranchId);
    expect(branch.execution).toMatchObject({ branchId: otherBranchId, time: 1, inputEvents: [], playing: false });
    const restarted = apply(branch, { type: 'set_parameter', parameterId: 'flight.vy', value: 10, unit: 'm/s' });
    expect(restarted.execution).toMatchObject({ time: 0, inputEvents: [], playing: false });
    const isolated = apply(restarted, { type: 'isolate', entityId: 'flight' });
    expect(isolated.presentation.hidden).toContain('loop');
    expect(apply(isolated, { type: 'restore_view' }).presentation.hidden).toEqual([]);
    expect(() => branchEngineSnapshot(apply(opened, { type: 'play' }), atOne, otherBranchId)).toThrow('PETROS_ENGINE_PAUSE_BEFORE_BRANCH');
  });

  it('preserves narration and drafts across interruption and validates snapshots on recovery', () => {
    let s = snapshot(createHeldOutEngineProgram(authority));
    s = apply(s, { type: 'annotate', text: 'Compare at half a second.' });
    s = apply(s, { type: 'interrupt', mode: 'freeze', beat: 0, offset: 12, character: 8 });
    expect(() => apply(s, { type: 'play' })).toThrow('PETROS_ENGINE_RESUME_REQUIRED');
    const resumed = apply(s, { type: 'resume' });
    expect(resumed.draft).toMatchObject({ version: 1, text: 'Compare at half a second.' });
    expect(resumed.teaching).toMatchObject({ beat: 0, offset: 12, character: 8, interrupted: false, returnPoint: null });
    expect(validateEngineSnapshot(resumed).snapshot).toEqual(resumed);
    const forged = structuredClone(resumed); forged.execution.values['loop.current'] = 999;
    expect(() => validateEngineSnapshot(forged)).toThrow('PETROS_ENGINE_STATE_MISMATCH');
    expect(() => previewEngineCommand(resumed, { type: 'create', program: createHeldOutEngineProgram(authority) })).toThrow('PETROS_ENGINE_OWNER_OPERATION_REQUIRED');
  });

  it('adapts the old diagram as an unverified schematic without granting a physics solver', () => {
    const legacy = adaptLegacyEngineDiagram(visualDiagramFixture(), authority);
    expect(legacy).toMatchObject({ provenance: 'legacy_schematic', models: [], source: projectileBinding });
    const c = compile(legacy);
    expect(c.report).toMatchObject({ scientificStatus: 'schematic_unverified', generatedExecutable: 'disabled' });
    expect(initialEngineSnapshot(c, branchId).execution.events).toEqual([]);
  });
  it('reuses only internally computed DAG values and does not leak mutable cache state', () => {
    const p=createEngineReferenceProgram(authority);
    const c=compile(p), s=initialEngineSnapshot(c,branchId);
    const evaluate=createEngineValueEvaluator(c);
    const first=evaluate(s.execution.parameters,0);
    first.values['normalX']=999;
    const second=evaluate(s.execution.parameters,0);
    expect(second.values['normalX']).toBe(0);
    expect(second.budget.solverSteps).toBe(0);
    expect(second.budget.operations).toBeLessThan(first.budget.operations);
    const changed={...s.execution.parameters,vx:20};
    expect(evaluate(changed,0.5).values).toEqual(evaluateEngineValues(c,changed,0.5).values);
    const frame=createEngineViewEvaluator(s);
    const displayed=frame(0.5);
    displayed.views[0]!.plotData[0]!.samples[0]!.x=999;
    displayed.snapshot.execution.parameters.vx=999;
    expect(frame(0.5).views[0]!.plotData[0]!.samples[0]!.x).not.toBe(999);
    expect(frame(0.5).snapshot.execution.parameters.vx).toBe(s.execution.parameters.vx);
    expect(frame(0.5).snapshot.execution.values).toEqual(evaluateEngineSnapshot(s,0.5).execution.values);
  });

  it('gates a reviewed spatial primitive and preserves a numerical alternative to projection', () => {
    const program=createEngineSpatialFixture({...authority,source:null});
    const state=snapshot(program);
    const points=resolveEngineViews(state)[0]!.primitives;
    expect(projectEngineSpatialPoint(points[0]! as {x:number;y:number;z:number})).toEqual({x:80,y:160});
    expect(projectEngineSpatialPoint(points[1]! as {x:number;y:number;z:number})).toEqual({x:120,y:120});
    expect(points[1]!.description).toContain('depth 80');
    expect(()=>compile(program,{...authority,source:null,allowedCapabilities:['render.svg']})).toThrow('UNSUPPORTED_CAPABILITY');
    expect(()=>projectEngineSpatialPoint({x:0,y:0,z:4097})).toThrow('SPATIAL_DOMAIN');
  });

});
