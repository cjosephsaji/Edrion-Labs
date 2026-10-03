import { z } from 'zod';

/** S7 executes only declarative bindings and trusted input operations. No expression evaluator. */
export const PETROS_VISUAL_VALIDATOR_VERSION = 'petros.visual-validator.v1';
export const PETROS_VISUAL_LIMITS = Object.freeze({
  maxBytes: 96_000,
  maxPrimitives: 100,
  maxBindings: 200,
  maxVariables: 32,
  maxParameters: 16,
  maxViews: 4,
  maxBeats: 64,
  maxDepth: 16,
  maxNodes: 8_000,
  maxGeneratedOperations: 0,
  maxSolverSteps: 0,
});
export const PETROS_VISUAL_CAPABILITIES = Object.freeze([
  {
    id: 'primitives.svg',
    version: 1,
    trust: 'platform',
    operations: ['rect', 'line', 'text', 'readout'],
  },
  { id: 'bindings.scalar', version: 1, trust: 'platform', operations: ['copy', 'convert_unit'] },
  { id: 'controls.parameter', version: 1, trust: 'platform', operations: ['set_parameter'] },
  { id: 'presentation.beats', version: 1, trust: 'platform', operations: ['set_beat'] },
] as const);
const units = {
  '1': { dimension: 'scalar', scale: 1 },
  px: { dimension: 'display', scale: 1 },
  m: { dimension: 'length', scale: 1 },
  cm: { dimension: 'length', scale: 0.01 },
  s: { dimension: 'time', scale: 1 },
  ms: { dimension: 'time', scale: 0.001 },
} as const;
export const petrosVisualUnitSchema = z.enum(['1', 'px', 'm', 'cm', 's', 'ms']);
type Unit = z.infer<typeof petrosVisualUnitSchema>;
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const coordinate = z.number().finite().min(-4096).max(4096);
const size = z.number().finite().positive().max(4096);
const value = z.union([finite, z.boolean()]);
const quantity = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('number'),
      unit: petrosVisualUnitSchema,
      initial: finite,
      min: finite,
      max: finite,
    })
    .strict(),
  z.object({ type: z.literal('boolean'), initial: z.boolean() }).strict(),
]);
const parameter = z
  .object({
    id,
    label: z.string().min(1).max(160),
    quantity,
    change: z.enum(['display_only', 'initialise_model']),
  })
  .strict();
const variable = z.object({ id, quantity, sourceParameter: id.optional() }).strict();
const common = {
  id,
  description: z.string().min(1).max(600),
  x: coordinate,
  y: coordinate,
  visible: z.boolean(),
};
const primitive = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('rect'), width: size, height: size }).strict(),
  z.object({ ...common, kind: z.literal('line'), x2: coordinate, y2: coordinate }).strict(),
  z.object({ ...common, kind: z.literal('text'), text: z.string().min(1).max(600) }).strict(),
  z
    .object({
      ...common,
      kind: z.literal('readout'),
      label: z.string().min(1).max(160),
      value: finite,
      unit: petrosVisualUnitSchema,
    })
    .strict(),
]);
const programShape = z
  .object({
    schemaVersion: z.literal('petros.visual-program.v1'),
    programId: z.string().uuid(),
    revision: z.literal(1),
    title: z.string().min(1).max(240),
    description: z.string().min(1).max(1500),
    representation: z.enum(['schematic', 'data_visualisation']),
    assumptions: z.array(z.string().min(1).max(500)).min(1).max(8),
    capabilities: z
      .array(
        z.object({ id: z.string().min(1).max(80), version: z.number().int().positive() }).strict(),
      )
      .min(1)
      .max(8),
    parameters: z.array(parameter).max(16),
    // Model quantities are separate from visibility, reveal and other presentation controls.
    simulation: z.object({ variables: z.array(variable).max(32) }).strict(),
    presentation: z.object({ variables: z.array(variable).max(32) }).strict(),
    views: z
      .array(
        z
          .object({
            id,
            title: z.string().min(1).max(160),
            width: size,
            height: size,
            primitives: z.array(primitive).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    bindings: z
      .array(
        z
          .object({
            source: z.enum(['simulation', 'presentation']),
            variableId: id,
            viewId: id,
            primitiveId: id,
            property: z.enum(['x', 'y', 'x2', 'y2', 'width', 'height', 'visible', 'value']),
          })
          .strict(),
      )
      .max(200),
    teachingTrack: z
      .array(
        z
          .object({
            id,
            text: z.string().min(1).max(1500),
            targets: z
              .array(z.object({ viewId: id, primitiveId: id }).strict())
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(64),
    // Reserved fail-closed seams, not arbitrary executable payloads.
    computations: z.array(z.never()).max(0),
    executionLimits: z
      .object({
        maxPrimitives: z.number().int().min(1).max(100),
        maxBindings: z.number().int().min(0).max(200),
        maxVariables: z.number().int().min(0).max(32),
        maxGeneratedOperations: z.literal(0),
        maxSolverSteps: z.literal(0),
      })
      .strict(),
  })
  .strict();
export type PetrosVisualProgram = z.infer<typeof programShape>;
export type PetrosVisualPrimitive = z.infer<typeof primitive>;

export class PetrosVisualError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new PetrosVisualError(`PETROS_VISUAL_${code}`);
}

/** Iterative preflight BEFORE recursive Zod parsing, JSON serialization or binding evaluation. */
export function boundPetrosVisualInput(input: unknown) {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  while (queue.length) {
    const item = queue.pop()!;
    if (++nodes > PETROS_VISUAL_LIMITS.maxNodes || item.depth > PETROS_VISUAL_LIMITS.maxDepth)
      fail('RESOURCE_LIMIT');
    const v = item.value;
    if (typeof v === 'string') {
      if (v.length > PETROS_VISUAL_LIMITS.maxBytes) fail('RESOURCE_LIMIT');
      bytes += new TextEncoder().encode(JSON.stringify(v)).length;
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail('NONFINITE');
      bytes += 24;
    } else if (typeof v === 'boolean' || v === null) bytes += 5;
    else if (typeof v === 'object') {
      if (seen.has(v)) fail('INVALID_STRUCTURE');
      seen.add(v);
      const entries = Object.entries(v);
      if (entries.length > PETROS_VISUAL_LIMITS.maxNodes) fail('RESOURCE_LIMIT');
      bytes += 2;
      for (const [key, child] of entries) {
        if (key.length > PETROS_VISUAL_LIMITS.maxBytes) fail('RESOURCE_LIMIT');
        bytes += new TextEncoder().encode(JSON.stringify(key)).length + 3;
        queue.push({ value: child, depth: item.depth + 1 });
      }
    } else fail('INVALID_STRUCTURE');
    if (bytes > PETROS_VISUAL_LIMITS.maxBytes || queue.length > PETROS_VISUAL_LIMITS.maxNodes)
      fail('RESOURCE_LIMIT');
  }
}
export function visualUnitsCompatible(a: Unit, b: Unit) {
  return units[a].dimension === units[b].dimension;
}
function convert(n: number, from: Unit, to: Unit) {
  if (!visualUnitsCompatible(from, to)) fail('UNIT_MISMATCH');
  const result = (n * units[from].scale) / units[to].scale;
  if (!Number.isFinite(result) || Math.abs(result) > 1_000_000) fail('NUMERIC_LIMIT');
  return result;
}
function checkQuantity(q: z.infer<typeof quantity>, v: number | boolean) {
  if (q.type === 'boolean') {
    if (typeof v !== 'boolean') fail('TYPE_MISMATCH');
  } else if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    q.min > q.max ||
    v < q.min ||
    v > q.max
  )
    fail('DOMAIN');
}
function unique(items: Array<{ id: string }>) {
  if (new Set(items.map((i) => i.id)).size !== items.length) fail('DUPLICATE_ID');
}
function propertyUnit(p: PetrosVisualPrimitive, key: string): Unit | 'boolean' {
  if (!(key in p)) fail('INVALID_BINDING');
  if (key === 'visible') return 'boolean';
  if (key === 'value' && p.kind === 'readout') return p.unit;
  return 'px';
}
function validateProgram(input: unknown): PetrosVisualProgram {
  boundPetrosVisualInput(input);
  if (
    input &&
    typeof input === 'object' &&
    'computations' in input &&
    Array.isArray(input.computations) &&
    input.computations.length
  )
    fail('GENERATED_BEHAVIOR_DISABLED');
  const result = programShape.safeParse(input);
  if (!result.success) fail('INVALID_PROGRAM');
  const p = result.data;
  const caps = new Set<string>();
  for (const c of p.capabilities) {
    if (
      !PETROS_VISUAL_CAPABILITIES.some((known) => known.id === c.id && known.version === c.version)
    )
      fail('UNSUPPORTED_CAPABILITY');
    if (caps.has(c.id)) fail('DUPLICATE_ID');
    caps.add(c.id);
  }
  const required = [
    'primitives.svg',
    ...(p.bindings.length ? ['bindings.scalar'] : []),
    ...(p.parameters.length ? ['controls.parameter'] : []),
    ...(p.teachingTrack.length ? ['presentation.beats'] : []),
  ];
  if (required.some((c) => !caps.has(c))) fail('MISSING_CAPABILITY');
  unique(p.parameters);
  unique(p.views);
  unique(p.teachingTrack);
  const variables = [...p.simulation.variables, ...p.presentation.variables];
  const count = p.views.reduce((sum, view) => sum + view.primitives.length, 0);
  if (
    count > p.executionLimits.maxPrimitives ||
    p.bindings.length > p.executionLimits.maxBindings ||
    variables.length > p.executionLimits.maxVariables
  )
    fail('RESOURCE_LIMIT');
  p.parameters.forEach((v) => checkQuantity(v.quantity, v.quantity.initial));
  for (const scope of ['simulation', 'presentation'] as const) {
    unique(p[scope].variables);
    for (const v of p[scope].variables) {
      checkQuantity(v.quantity, v.quantity.initial);
      if (v.sourceParameter) {
        const param = p.parameters.find((i) => i.id === v.sourceParameter);
        if (!param) fail('INVALID_REFERENCE');
        if ((scope === 'simulation') !== (param.change === 'initialise_model')) fail('STATE_SCOPE');
        if (v.quantity.type !== param.quantity.type) fail('TYPE_MISMATCH');
        if (v.quantity.type === 'number' && param.quantity.type === 'number') {
          if (!visualUnitsCompatible(v.quantity.unit, param.quantity.unit)) fail('UNIT_MISMATCH');
          checkQuantity(
            v.quantity,
            convert(param.quantity.min, param.quantity.unit, v.quantity.unit),
          );
          checkQuantity(
            v.quantity,
            convert(param.quantity.max, param.quantity.unit, v.quantity.unit),
          );
        }
      }
    }
  }
  p.views.forEach((v) => unique(v.primitives));
  const targets = new Set<string>();
  for (const b of p.bindings) {
    const source = p[b.source].variables.find((v) => v.id === b.variableId);
    const target = p.views
      .find((v) => v.id === b.viewId)
      ?.primitives.find((v) => v.id === b.primitiveId);
    if (!source || !target) fail('INVALID_REFERENCE');
    const key = `${b.viewId}/${b.primitiveId}/${b.property}`;
    if (targets.has(key)) fail('DUPLICATE_BINDING');
    targets.add(key);
    const unit = propertyUnit(target, b.property);
    if (unit === 'boolean') {
      if (source.quantity.type !== 'boolean') fail('TYPE_MISMATCH');
    } else if (
      source.quantity.type !== 'number' ||
      !visualUnitsCompatible(source.quantity.unit, unit)
    )
      fail('UNIT_MISMATCH');
  }
  for (const beat of p.teachingTrack)
    for (const t of beat.targets) {
      if (!p.views.find((v) => v.id === t.viewId)?.primitives.some((v) => v.id === t.primitiveId))
        fail('INVALID_REFERENCE');
    }
  return p;
}

// Export a production schema so every server/browser boundary gets semantic validation too.
export const petrosVisualProgramSchema = z
  .unknown()
  .transform((input, ctx): PetrosVisualProgram => {
    try {
      return validateProgram(input);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof PetrosVisualError ? error.code : 'PETROS_VISUAL_INVALID_PROGRAM',
      });
      return z.NEVER;
    }
  });
const checkpointShape = z
  .object({
    version: z.number().int().nonnegative().max(1_000_000),
    parameters: z.record(id, value),
    simulation: z.object({ time: z.literal(0), values: z.record(id, value) }).strict(),
    presentation: z
      .object({ beat: z.number().int().min(0).max(63), values: z.record(id, value) })
      .strict(),
  })
  .strict();
export type PetrosVisualCheckpoint = z.infer<typeof checkpointShape>;
export const petrosVisualCommandSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedRevision: z.literal(1),
    expectedVersion: z.number().int().nonnegative().max(999_999),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('set_parameter'), parameterId: id, value }).strict(),
      z.object({ type: z.literal('set_beat'), beat: z.number().int().min(0).max(63) }).strict(),
    ]),
  })
  .strict();
export type PetrosVisualCommand = z.infer<typeof petrosVisualCommandSchema>;
function valuesFor(
  p: PetrosVisualProgram,
  scope: 'simulation' | 'presentation',
  parameters: Record<string, number | boolean>,
) {
  return Object.fromEntries(
    p[scope].variables.map((v) => {
      let current = v.quantity.initial;
      if (v.sourceParameter) {
        const q = p.parameters.find((i) => i.id === v.sourceParameter)!.quantity;
        const input = parameters[v.sourceParameter]!;
        current =
          q.type === 'number' && v.quantity.type === 'number'
            ? convert(input as number, q.unit, v.quantity.unit)
            : input;
      }
      checkQuantity(v.quantity, current);
      return [v.id, current];
    }),
  );
}
export function initialPetrosVisualCheckpoint(
  program: PetrosVisualProgram,
): PetrosVisualCheckpoint {
  const p = petrosVisualProgramSchema.parse(program);
  const parameters = Object.fromEntries(p.parameters.map((v) => [v.id, v.quantity.initial]));
  return {
    version: 0,
    parameters,
    simulation: { time: 0, values: valuesFor(p, 'simulation', parameters) },
    presentation: { beat: 0, values: valuesFor(p, 'presentation', parameters) },
  };
}
export function validatePetrosVisualCheckpoint(p: PetrosVisualProgram, input: unknown) {
  boundPetrosVisualInput(input);
  const c = checkpointShape.parse(input);
  if (
    Object.keys(c.parameters).length !== p.parameters.length ||
    c.presentation.beat >= Math.max(1, p.teachingTrack.length)
  )
    fail('INVALID_STATE');
  p.parameters.forEach((v) => checkQuantity(v.quantity, c.parameters[v.id]!));
  for (const scope of ['simulation', 'presentation'] as const) {
    const expected = valuesFor(p, scope, c.parameters);
    if (
      Object.keys(c[scope].values).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([key, v]) => c[scope].values[key] !== v)
    )
      fail('INVALID_STATE');
  }
  return c;
}
/** Copies and unit conversions only. No eval, dynamic imports, loops from program data or URLs. */
export function resolvePetrosVisualViews(
  program: PetrosVisualProgram,
  checkpoint: PetrosVisualCheckpoint,
) {
  const p = petrosVisualProgramSchema.parse(program);
  const c = validatePetrosVisualCheckpoint(p, checkpoint);
  const views = p.views.map((v) => ({ ...v, primitives: v.primitives.map((i) => ({ ...i })) }));
  for (const b of p.bindings) {
    const variable = p[b.source].variables.find((v) => v.id === b.variableId)!;
    const target = views
      .find((v) => v.id === b.viewId)!
      .primitives.find((i) => i.id === b.primitiveId)!;
    const unit = propertyUnit(target, b.property);
    const current = c[b.source].values[b.variableId]!;
    const resolved =
      unit !== 'boolean' && variable.quantity.type === 'number'
        ? convert(current as number, variable.quantity.unit, unit)
        : current;
    Object.assign(target, { [b.property]: resolved });
    if (!primitive.safeParse(target).success) fail('INVALID_BINDING_VALUE');
  }
  return views;
}
export function applyPetrosVisualCommand(
  program: PetrosVisualProgram,
  checkpoint: PetrosVisualCheckpoint,
  input: PetrosVisualCommand,
) {
  const p = petrosVisualProgramSchema.parse(program);
  const prior = validatePetrosVisualCheckpoint(p, checkpoint);
  const cmd = petrosVisualCommandSchema.parse(input);
  if (cmd.expectedRevision !== p.revision || cmd.expectedVersion !== prior.version) fail('STALE');
  const next = {
    ...prior,
    version: prior.version + 1,
    parameters: { ...prior.parameters },
    presentation: { ...prior.presentation },
  };
  if (cmd.action.type === 'set_parameter') {
    const action = cmd.action;
    const param = p.parameters.find((v) => v.id === action.parameterId);
    if (!param) fail('INVALID_REFERENCE');
    checkQuantity(param.quantity, action.value);
    next.parameters[param.id] = action.value;
    next.simulation = { time: 0, values: valuesFor(p, 'simulation', next.parameters) };
    next.presentation.values = valuesFor(p, 'presentation', next.parameters);
  } else next.presentation.beat = cmd.action.beat;
  resolvePetrosVisualViews(p, next); // Reject atomically; caller keeps its prior checkpoint.
  return next;
}
const snapshotShape = z
  .object({
    program: petrosVisualProgramSchema,
    checkpoint: checkpointShape,
    validatorVersion: z.literal(PETROS_VISUAL_VALIDATOR_VERSION),
    lastOperation: z
      .object({ id: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    try {
      resolvePetrosVisualViews(s.program, s.checkpoint);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_VISUAL_INVALID_STATE' });
    }
  });
export type PetrosVisualSnapshot = z.infer<typeof snapshotShape>;
export const petrosVisualSnapshotSchema = z
  .unknown()
  .transform((input, ctx): PetrosVisualSnapshot => {
    try {
      boundPetrosVisualInput(input);
      return snapshotShape.parse(input);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_VISUAL_INVALID_SNAPSHOT' });
      return z.NEVER;
    }
  });
export const petrosVisualResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available'), snapshot: petrosVisualSnapshotSchema }).strict(),
  z.object({ status: z.enum(['disabled', 'unavailable']), reason: z.string().max(160) }).strict(),
]);
