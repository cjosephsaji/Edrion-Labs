import { PETROS_PROJECTILE_CAPABILITY } from '../petros-projectile-model';
import type { PetrosConceptPackTrustedContext } from '../petros-concept-pack';

export const projectileIds = {
  pack: '11111111-1111-4111-8111-111111111111',
  objective: '22222222-2222-4222-8222-222222222222',
  diagram: '33333333-3333-4333-8333-333333333333',
  object: '44444444-4444-4444-8444-444444444444',
  unit: '55555555-5555-4555-8555-555555555555',
} as const;

const hash = 'a'.repeat(64);
export const projectileSourceVersion = hash;

export const projectileLocator = {
  schemaVersion: 'petros.document-source.v1',
  kind: 'pdf_page_text',
  sourceVersion: hash,
  objectId: projectileIds.object,
  unitId: projectileIds.unit,
  page: 2,
  textSha256: 'b'.repeat(64),
  start: 10,
  end: 42,
  offsetEncoding: 'utf16',
} as const;

export const projectilePack = {
  schemaVersion: 'petros.concept-pack.v1',
  pack: { id: projectileIds.pack, version: 1 },
  compilerVersion: 'fixture-compiler.v1',
  subject: 'physics.projectile_motion',
  sourceVersion: hash,
  curriculumRevision: 1,
  objective: { id: projectileIds.objective, version: 1 },
  objectiveStatement: 'Predict projectile position under declared assumptions.',
  scope: 'Two dimensional motion under constant gravity.',
  concepts: [{
    id: 'component_motion',
    label: 'Component motion',
    definition: 'Horizontal and vertical motion can be analyzed separately.',
    anchors: [{ locator: projectileLocator, purpose: 'definition', support: 'explicit' }],
  }],
  prerequisites: [],
  coreExplanation: 'Resolve launch velocity into components and apply constant acceleration vertically.',
  examples: [
    { id: 'example', kind: 'worked_example', prompt: 'Find the apex time.', explanation: 'At the apex vertical velocity is zero.', anchors: [{ locator: projectileLocator, purpose: 'example', support: 'pedagogical_inference' }] },
    { id: 'non_example', kind: 'non_example', prompt: 'Assume horizontal speed changes without drag.', explanation: 'That assumption is outside this model.', anchors: [{ locator: projectileLocator, purpose: 'example', support: 'pedagogical_inference' }] },
  ],
  misconceptions: [{ id: 'horizontal_gravity', claim: 'Gravity changes horizontal velocity.', discriminator: 'Compare horizontal velocity at launch and apex.', correction: 'With no drag, horizontal velocity is constant.', anchors: [{ locator: projectileLocator, purpose: 'misconception', support: 'pedagogical_inference' }] }],
  rubric: { id: 'projectile-rubric', version: '1', criteria: [{ id: 'components', descriptor: 'Uses components consistently.', evidenceRequired: 'Correct component reasoning.' }] },
  assessments: [
    { id: 'practice', variant: 'a', prompt: 'Predict the motion.', unseenContext: false, criteria: ['components'], anchors: [{ locator: projectileLocator, purpose: 'assessment', support: 'pedagogical_inference' }] },
    { id: 'transfer', variant: 'b', prompt: 'Apply the model in a new context.', unseenContext: true, criteria: ['components'], anchors: [{ locator: projectileLocator, purpose: 'assessment', support: 'pedagogical_inference' }] },
  ],
  transferTaskId: 'transfer',
  visualIntent: { representation: 'analytic_projectile', requiredCapability: 'physics.projectile.no-drag@1', meaningfulManipulations: ['launch_velocity_x', 'launch_velocity_y', 'gravity'] },
  validation: { status: 'candidate', structuralValidator: 'petros.concept-pack.v1', unresolvedIssues: [], educatorReviewRequired: true, approvedReviewId: null },
} as const;

export const projectileTrustedContext = {
  currentSourceVersion: hash,
  currentCurriculumRevision: 1,
  currentObjective: { id: projectileIds.objective, version: 1 },
  resolvedAnchors: [
    { locator: projectileLocator, text: 'x'.repeat(projectileLocator.end - projectileLocator.start) },
  ],
} satisfies PetrosConceptPackTrustedContext;

export const projectileBinding = {
  schemaVersion: 'petros.projectile-binding.v1',
  originalDiagramBlockId: projectileIds.diagram,
  pack: { id: projectileIds.pack, version: 1 },
  objective: { id: projectileIds.objective, version: 1 },
  curriculumRevision: 1,
  conceptId: 'component_motion',
  source: projectileLocator,
  capability: PETROS_PROJECTILE_CAPABILITY,
} as const;
