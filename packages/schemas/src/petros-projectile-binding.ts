import { z } from 'zod';
import {
  validatePetrosConceptPackCandidate,
  type PetrosConceptPackTrustedContext,
} from './petros-concept-pack';
import {
  petrosDocumentLocatorSchema,
  type PetrosDocumentLocator,
} from './petros-document-source';
import {
  PETROS_PROJECTILE_CAPABILITY,
  evaluatePetrosProjectile,
  petrosProjectileStateSchema,
  type PetrosProjectileState,
} from './petros-projectile-model';
import type { PetrosVisualPrimitive } from './petros-visual-program';

/** Isolated development adapter, deliberately not a v1 visual program or runtime capability. */
export const PETROS_PROJECTILE_BINDING_VERSION = 'petros.projectile-binding.v1' as const;
const reference = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive().max(100_000),
}).strict();

export const petrosProjectileBindingSchema = z.object({
  schemaVersion: z.literal(PETROS_PROJECTILE_BINDING_VERSION),
  originalDiagramBlockId: z.string().uuid(),
  pack: reference,
  objective: reference,
  curriculumRevision: z.number().int().positive().max(100_000),
  conceptId: z.string().trim().min(1).max(180),
  source: petrosDocumentLocatorSchema,
  capability: z.object({
    id: z.literal(PETROS_PROJECTILE_CAPABILITY.id),
    version: z.literal(PETROS_PROJECTILE_CAPABILITY.version),
    solver: z.literal(PETROS_PROJECTILE_CAPABILITY.solver),
  }).strict(),
}).strict();
export type PetrosProjectileBinding = z.infer<typeof petrosProjectileBindingSchema>;

function locatorKey(locator: PetrosDocumentLocator): string {
  return JSON.stringify([
    locator.schemaVersion, locator.kind, locator.sourceVersion, locator.objectId,
    locator.unitId, locator.page, locator.textSha256, locator.start, locator.end,
    locator.offsetEncoding,
  ]);
}

/**
 * Caller must fetch pack/context through current authorized owners. This pure adapter
 * cannot authenticate a tenant, establish educator approval, or admit evidence/writes.
 * The full original diagram remains with its existing owner for unavailable recovery.
 */
export function resolvePetrosProjectileBinding(
  bindingRaw: unknown,
  packRaw: unknown,
  trustedContext: PetrosConceptPackTrustedContext,
  currentPackRaw: unknown,
): PetrosProjectileBinding {
  const binding = petrosProjectileBindingSchema.parse(bindingRaw);
  const currentPack = reference.parse(currentPackRaw);
  const pack = validatePetrosConceptPackCandidate(packRaw, trustedContext);
  if (binding.pack.id !== currentPack.id || binding.pack.version !== currentPack.version ||
    binding.pack.id !== pack.pack.id || binding.pack.version !== pack.pack.version)
    throw new Error('PETROS_PROJECTILE_STALE_PACK');
  if (binding.objective.id !== pack.objective.id || binding.objective.version !== pack.objective.version ||
    binding.curriculumRevision !== pack.curriculumRevision)
    throw new Error('PETROS_PROJECTILE_STALE_OBJECTIVE');
  if (binding.source.sourceVersion !== pack.sourceVersion)
    throw new Error('PETROS_PROJECTILE_STALE_SOURCE');
  const concept = pack.concepts.find((item) => item.id === binding.conceptId);
  if (!concept || !concept.anchors.some((anchor) => locatorKey(anchor.locator) === locatorKey(binding.source)))
    throw new Error('PETROS_PROJECTILE_UNKNOWN_CONCEPT_SOURCE');
  return binding;
}

/** Model parameter edits restart at launch; a seek never changes the initial conditions. */
export const petrosProjectileParameterChangeSchema = z.discriminatedUnion('parameter', [
  z.object({ parameter: z.literal('launch_velocity_x'), value: z.number().finite().min(-100).max(100), unit: z.literal('m/s') }).strict(),
  z.object({ parameter: z.literal('launch_velocity_y'), value: z.number().finite().min(0).max(100), unit: z.literal('m/s') }).strict(),
  z.object({ parameter: z.literal('gravity'), value: z.number().finite().min(1).max(25), unit: z.literal('m/s^2') }).strict(),
  z.object({ parameter: z.literal('elapsed_time'), value: z.number().finite().min(0).max(200), unit: z.literal('s') }).strict(),
]);

/** Pure replayable arithmetic. No command receipt, revision authority, persistence or I/O. */
export function updatePetrosProjectileParameter(stateRaw: unknown, changeRaw: unknown): PetrosProjectileState {
  const state = petrosProjectileStateSchema.parse(stateRaw);
  const change = petrosProjectileParameterChangeSchema.parse(changeRaw);
  const input = {
    ...state.input,
    launchVelocity: { ...state.input.launchVelocity },
    gravity: { ...state.input.gravity },
    elapsedTime: { value: 0, unit: 's' as const },
  };
  switch (change.parameter) {
    case 'launch_velocity_x': input.launchVelocity.x = change.value; break;
    case 'launch_velocity_y': input.launchVelocity.y = change.value; break;
    case 'gravity': input.gravity.value = change.value; break;
    case 'elapsed_time': input.elapsedTime.value = change.value; break;
  }
  // Reject seeks after landing rather than clamp a requested time silently.
  return evaluatePetrosProjectile(input);
}

type Point = { x: number; y: number };
function line(id: string, description: string, from: Point, to: Point): PetrosVisualPrimitive {
  return { id, kind: 'line', description, x: from.x, y: from.y, x2: to.x, y2: to.y, visible: true };
}
function label(id: string, text: string, x: number, y: number): PetrosVisualPrimitive {
  return { id, kind: 'text', description: text, text, x, y, visible: true };
}
function arrow(id: string, description: string, from: Point, to: Point): PetrosVisualPrimitive[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [{id,kind:'rect',description:`${description}: zero vector`,
    x:from.x-2,y:from.y-2,width:4,height:4,visible:true}];
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(8, length / 3);
  return [
    line(id, description, from, to),
    line(`${id}HeadA`, description, to, { x: to.x - head * ux + head * uy / 2, y: to.y - head * uy - head * ux / 2 }),
    line(`${id}HeadB`, description, to, { x: to.x - head * ux - head * uy / 2, y: to.y - head * uy + head * ux / 2 }),
  ];
}

/**
 * Every view derives from one validated analytic checkpoint. Physical values retain SI
 * units; the projection to display pixels is explicit and is never a v1 scalar binding.
 * Speed/acceleration readouts use shared text primitives because v1 readouts lack those
 * units. This does not expand the frozen v1 unit/capability registry.
 */
export function createPetrosProjectileView(
  bindingRaw: unknown,
  stateRaw: unknown,
  packRaw: unknown,
  trustedContext: PetrosConceptPackTrustedContext,
  currentPackRaw: unknown,
) {
  const binding = resolvePetrosProjectileBinding(bindingRaw, packRaw, trustedContext, currentPackRaw);
  return renderPetrosProjectileCheckpoint(binding, stateRaw);
}

/** Presentation only. Server-authorized checkpoint in, primitives out; grants no authority. */
export function renderPetrosProjectileCheckpoint(bindingRaw: unknown, stateRaw: unknown) {
  const binding = petrosProjectileBindingSchema.parse(bindingRaw);
  const state = petrosProjectileStateSchema.parse(stateRaw);
  const duration = state.readouts.flightDuration.value;
  const range = state.readouts.horizontalDisplacementAtLanding.value;
  const height = state.readouts.maximumHeight.value;
  const xMin = Math.min(0, range);
  const xMax = Math.max(0, range);
  // Isotropic scaling preserves the trajectory angle. Zero-length flights remain finite.
  const metresToPixels = Math.min(540 / Math.max(1, xMax - xMin), 240 / Math.max(1, height));
  const project = (point: Point): Point => ({ x: 40 + (point.x - xMin) * metresToPixels, y: 280 - point.y * metresToPixels });
  const trajectory = Array.from({ length: 25 }, (_, index) => {
    const sample = evaluatePetrosProjectile({
      ...state.input, elapsedTime: { value: duration * (index / 24), unit: 's' },
    });
    return { time: sample.input.elapsedTime, position: sample.position, velocity: sample.velocity };
  });
  const motion: PetrosVisualPrimitive[] = [
    line('ground', 'Level ground at y = 0 m', { x: 20, y: 280 }, { x: 600, y: 280 }),
    label('motionAxes', 'Position: +x right; +y up. Trajectory is sampled.', 24, 20),
  ];
  const timePlot: PetrosVisualPrimitive[] = [
    line('timeAxis', 'Time in seconds increases right', { x: 40, y: 280 }, { x: 580, y: 280 }),
    line('heightAxis', 'Height in metres increases up', { x: 40, y: 280 }, { x: 40, y: 40 }),
    label('plotAxes', `Height (m) vs time (s); 0–${Math.max(1, duration)} s; 0–${Math.max(1, height)} m`, 24, 20),
  ];
  const plot = (time: number, y: number): Point => ({
    x: 40 + 540 * time / Math.max(1, duration), y: 280 - 240 * y / Math.max(1, height),
  });
  for (let index = 1; index < trajectory.length; index++) {
    const previous = trajectory[index - 1]!;
    const sample = trajectory[index]!;
    motion.push(line(`path${index}`, 'Analytic trajectory sample', project(previous.position), project(sample.position)));
    timePlot.push(line(`height${index}`, 'Height over time sample', plot(previous.time.value, previous.position.y), plot(sample.time.value, sample.position.y)));
  }
  const body = project(state.position);
  motion.push({ id: 'body', kind: 'rect', description: 'Point mass; marker size is display only', x: body.x - 4, y: body.y - 4, width: 8, height: 8, visible: true });
  const timeMarker = plot(state.input.elapsedTime.value, state.position.y);
  timePlot.push({ id: 'timeMarker', kind: 'rect', description: 'Current height and time', x: timeMarker.x - 4, y: timeMarker.y - 4, width: 8, height: 8, visible: true });
  const origin = { x: 300, y: 160 };
  const vectors: PetrosVisualPrimitive[] = [
    label('vectorAxes', 'Velocity: 1 px per m/s. Acceleration: 4 px per m/s².', 24, 20),
    ...arrow('velocity', 'Velocity', origin, { x: origin.x + state.velocity.x, y: origin.y - state.velocity.y }),
    ...arrow('horizontal', 'Horizontal velocity component', origin, { x: origin.x + state.velocity.x, y: origin.y }),
    ...arrow('vertical', 'Vertical velocity component', origin, { x: origin.x, y: origin.y - state.velocity.y }),
    ...arrow('gravity', 'Downward gravitational acceleration; not force', { x: 500, y: 100 }, { x: 500, y: 100 + 4 * state.input.gravity.value }),
    label('vx', `vx = ${state.velocity.x} m/s`, 24, 240),
    label('vy', `vy = ${state.velocity.y} m/s`, 24, 264),
    label('ay', `ay = ${-state.input.gravity.value} m/s²`, 24, 288),
  ];
  const readouts: PetrosVisualPrimitive[] = [
    { id: 'time', kind: 'readout', description: 'Elapsed time', label: 'Time', value: state.input.elapsedTime.value, unit: 's', x: 24, y: 40, visible: true },
    { id: 'positionX', kind: 'readout', description: 'Horizontal displacement', label: 'Horizontal displacement', value: state.position.x, unit: 'm', x: 24, y: 72, visible: true },
    { id: 'positionY', kind: 'readout', description: 'Height above ground', label: 'Height', value: state.position.y, unit: 'm', x: 24, y: 104, visible: true },
    label('duration', `Flight duration = ${duration} s`, 24, 136),
    label('maximumHeight', `Maximum height = ${height} m`, 24, 168),
    label('landing', `Landing displacement = ${range} m`, 24, 200),
    label('equationX', 'x = vx₀ t; vx = vx₀', 24, 232),
    label('equationY', 'y = vy₀ t − g t²/2; vy = vy₀ − g t', 24, 264),
  ];
  return {
    schemaVersion: 'petros.projectile-view.v1' as const,
    binding,
    state,
    validationStatus: 'engineering_candidate_unverified' as const,
    educatorApproval: 'not_established' as const,
    createsLearningEvidence: false as const,
    trajectory,
    projection: {
      positionMetresToPixels: metresToPixels,
      positionOriginPixels: project({ x: 0, y: 0 }),
      velocityMetresPerSecondToPixels: 1,
      accelerationMetresPerSecondSquaredToPixels: 4,
      plotSecondsToPixels: 540 / Math.max(1, duration),
      plotMetresToPixels: 240 / Math.max(1, height),
      displayYAxis: 'down' as const,
    },
    controls: [
      { parameter: 'launch_velocity_x', value: state.input.launchVelocity.x, min: -100, max: 100, unit: 'm/s', resetsTime: true },
      { parameter: 'launch_velocity_y', value: state.input.launchVelocity.y, min: 0, max: 100, unit: 'm/s', resetsTime: true },
      { parameter: 'gravity', value: state.input.gravity.value, min: 1, max: 25, unit: 'm/s^2', resetsTime: true },
      { parameter: 'elapsed_time', value: state.input.elapsedTime.value, min: 0, max: duration, unit: 's', resetsTime: false },
    ] as const,
    views: [
      { id: 'motion', title: 'Motion', width: 620, height: 320, primitives: motion },
      { id: 'velocity', title: 'Velocity and acceleration', width: 620, height: 320, primitives: vectors },
      { id: 'heightTime', title: 'Height over time', width: 620, height: 320, primitives: timePlot },
      { id: 'readouts', title: 'Readouts and equations', width: 620, height: 320, primitives: readouts },
    ],
  };
}

export type PetrosProjectileView = ReturnType<typeof createPetrosProjectileView>;
