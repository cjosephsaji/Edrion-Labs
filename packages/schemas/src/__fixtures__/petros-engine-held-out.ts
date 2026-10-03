import { ENGINE_VERSION, type EngineAuthority, type EngineProgram, type EngineUnit } from '../petros-engine-contract';
import { ENGINE_MODELS, createEngineCircuitTopology } from '../petros-engine-models';

/** Authored independently of the preset constructor; two trusted solvers and ordinary declarative primitives. */
export function createHeldOutEngineProgram(authority: EngineAuthority): EngineProgram {
  const projectile = ENGINE_MODELS.find(model => model.id === 'physics.projectile.no-drag')!;
  const dc = ENGINE_MODELS.find(model => model.id === 'circuits.dc.series')!;
  const physical = (cap: typeof projectile, prefix: string) => Object.entries(cap.inputs).map(([port, spec]) => ({
    id: `${prefix}.${port}`, label: `${prefix} ${port}`, type: (port === 'closed' ? 'boolean' : 'number') as 'boolean' | 'number',
    unit: spec.unit as EngineUnit, initial: port === 'closed' ? true : prefix === 'flight' && port === 'vx' ? 3 :
      prefix === 'flight' && port === 'vy' ? 8 : prefix === 'loop' && port === 'resistance' ? 5 : spec.initial,
    min: spec.min, max: spec.max,
    change: (port === 'closed' ? 'intervene' : 'restart') as 'intervene' | 'restart',
  }));
  return {
    schemaVersion: ENGINE_VERSION, programId: authority.programId, ownerScopeRef: authority.ownerScopeRef, revision: 1,
    title: 'Flight and series loop comparison', source: null, provenance: 'engineering_comparison',
    description: { summary: 'Compare flight height with a switched circuit.', details: ['Independent ideal models share a timeline.'],
      dataDescription: 'Height, current, state flag, and sampled timeline are linked by one checkpoint.' },
    capabilities: ['render.svg', 'language.typed', projectile.id, dc.id].map(id => ({ id, version: 1 as const })),
    entities: [
      { id: 'flight', label: 'Projectile', description: 'Ideal projectile position', conceptId: null },
      { id: 'loop', label: 'Series loop', description: 'Ideal circuit current', conceptId: null },
      { id: 'trace', label: 'Timeline', description: 'Shared time samples', conceptId: null },
    ],
    parameters: [...physical(projectile, 'flight'), ...physical(dc, 'loop'),
      { id: 'display.gain', label: 'Visual gain', type: 'number', unit: '1', initial: 2, min: 1, max: 4, change: 'presentation' }],
    state: [{ id: 'crossed', type: 'boolean', unit: '1', initial: false }],
    models: [
      { id: 'projectile', capabilityId: projectile.id, version: 1, solver: projectile.solver,
        inputs: Object.fromEntries(Object.keys(projectile.inputs).map(port => [port, `flight.${port}`])),
        outputs: { x: 'flight.x', y: 'flight.y', vy: 'flight.currentVy' } },
      { id: 'dc', capabilityId: dc.id, version: 1, solver: dc.solver,
        inputs: Object.fromEntries(Object.keys(dc.inputs).map(port => [port, `loop.${port}`])),
        outputs: { current: 'loop.current', closed: 'loop.isClosed' }, topology: createEngineCircuitTopology(false) },
    ],
    computations: [
      { id: 'threshold', op: 'constant', args: [], value: 1, type: 'number', unit: 'm' },
      { id: 'above', op: 'lt', args: ['threshold', 'flight.y'], type: 'boolean', unit: '1' },
      { id: 'gainHeight', op: 'multiply', args: ['flight.y', 'display.gain'], type: 'number', unit: 'm' },
    ],
    behaviors: [{ id: 'crossing', at: 0.5, assignments: [{ stateId: 'crossed', expressionId: 'above' }] }],
    views: [
      { id: 'scene', title: 'Linked scene', width: 400, height: 240, layers: ['main'], primitives: [
        { id: 'body', entityId: 'flight', layerId: 'main', kind: 'point', description: 'Projectile', x: 20, y: 200, visible: true },
        { id: 'wire', entityId: 'loop', layerId: 'main', kind: 'line', description: 'Series loop', x: 30, y: 210, x2: 300, y2: 210, visible: true },
        { id: 'lamp', entityId: 'loop', layerId: 'main', kind: 'text', description: 'Switch state', x: 30, y: 40, text: 'Closed', visible: true },
      ] },
      { id: 'data', title: 'Numeric equivalents', width: 400, height: 240, layers: ['main'], primitives: [
        { id: 'height', entityId: 'flight', layerId: 'main', kind: 'readout', description: 'Height in centimetres', x: 10, y: 20, value: 0, unit: 'cm', visible: true },
        { id: 'current', entityId: 'loop', layerId: 'main', kind: 'readout', description: 'Current in amperes', x: 10, y: 50, value: 0, unit: 'A', visible: true },
        { id: 'samples', entityId: 'trace', layerId: 'main', kind: 'plot', description: 'Height versus time', x: 10, y: 100, points: [], visible: true },
      ] },
    ],
    bindings: [
      { source: 'flight.x', viewId: 'scene', primitiveId: 'body', property: 'x', mapping: { kind: 'linear', inputUnit: 'm', outputUnit: 'px', scale: 20, offset: 20 } },
      { source: 'gainHeight', viewId: 'scene', primitiveId: 'body', property: 'y', mapping: { kind: 'linear', inputUnit: 'm', outputUnit: 'px', scale: -20, offset: 200 } },
      { source: 'loop.isClosed', viewId: 'scene', primitiveId: 'lamp', property: 'visible', mapping: { kind: 'identity' } },
      { source: 'flight.y', viewId: 'data', primitiveId: 'height', property: 'value', mapping: { kind: 'identity' } },
      { source: 'loop.current', viewId: 'data', primitiveId: 'current', property: 'value', mapping: { kind: 'identity' } },
    ],
    plots: [{ viewId: 'data', primitiveId: 'samples', x: 'time', y: 'flight.y', from: 0, to: 1.5,
      samples: 4, xScale: 100, yScale: -10, xOffset: 10, yOffset: 200 }],
    inverseInputs: [{ id: 'heightGain', parameterId: 'display.gain', inputUnit: 'px', scale: 10, offset: 5 }],
    teachingTrack: [{ id: 'first', text: 'Compare the numeric and drawn state.', targets: ['flight', 'loop'], sync: { kind: 'explanation' } }],
    assumptions: ['Independent ideal models; no coupling or educator approval.'],
    executionLimits: { operations: 4096, solverSteps: 100000, duration: 1.5 },
  };
}

