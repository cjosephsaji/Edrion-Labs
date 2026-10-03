import { z } from 'zod';
import {
  petrosDocumentLocatorSchema,
  petrosResolvedDocumentLocatorSchema,
} from './petros-document-source';

/** Candidate-only Phase 2 contract. No value parsed here is educator-approved. */
export const PETROS_CONCEPT_PACK_VERSION = 'petros.concept-pack.v1' as const;
/** Only this compiler contract is accepted by the production candidate owner. */
export const PETROS_TEACHING_PACK_COMPILER_VERSION = 'petros.teaching-pack-compiler.v1' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive().max(100_000),
}).strict();
const token = z.string().trim().min(1).max(180);
const text = (max: number) => z.string().trim().min(1).max(max);
const anchor = z.object({
  locator: petrosDocumentLocatorSchema,
  purpose: z.enum(['definition', 'claim', 'example', 'misconception', 'assessment']),
  support: z.enum(['explicit', 'pedagogical_inference']),
}).strict();
export type PetrosConceptPackAnchor = z.infer<typeof anchor>;

const claim = z.object({
  id: token,
  statement: text(1_500),
  anchors: z.array(anchor).min(1).max(12),
}).strict();

const concept = z.object({
  id: token,
  label: text(200),
  definition: text(1_500),
  anchors: z.array(anchor).min(1).max(12),
}).strict();
const prerequisite = z.object({
  fromConceptId: token,
  toConceptId: token,
  strength: z.enum(['hard', 'helpful']),
  rationale: text(600),
  anchors: z.array(anchor).min(1).max(8),
}).strict();
const example = z.object({
  id: token,
  kind: z.enum(['worked_example', 'example', 'non_example', 'counterexample']),
  prompt: text(1_000),
  explanation: text(2_000),
  anchors: z.array(anchor).min(1).max(8),
}).strict();
const misconception = z.object({
  id: token,
  claim: text(600),
  discriminator: text(1_000),
  correction: text(1_500),
  anchors: z.array(anchor).min(1).max(8),
}).strict();
const criterion = z.object({
  id: token,
  descriptor: text(800),
  evidenceRequired: text(800),
}).strict();
const evaluator = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('exact_text'),
    answerKey: text(1_000),
    aliases: z.array(text(1_000)).max(20),
    caseSensitive: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal('numeric_tolerance'),
    value: z.number().finite(),
    tolerance: z.number().finite().nonnegative().max(1_000_000_000),
    acceptedUnits: z.array(token).min(1).max(12),
    requireUnits: z.boolean(),
  }).strict(),
]);
const task = z.object({
  id: token,
  variant: token,
  prompt: text(1_500),
  unseenContext: z.boolean(),
  criteria: z.array(token).min(1).max(12),
  /** Explicit educator-reviewed deterministic evaluator; never sent in a student summary. */
  evaluator: evaluator.optional(),
  /** Reviewed discriminator responses. A mismatch alone is never a diagnosis. */
  misconceptionDiscriminators: z.array(z.object({ misconceptionId: token,
    exactResponses: z.array(text(1000)).min(1).max(12) }).strict()).max(8).default([]),
  anchors: z.array(anchor).min(1).max(8),
}).strict();

export const petrosConceptPackCandidateSchema = z.object({
  schemaVersion: z.literal(PETROS_CONCEPT_PACK_VERSION),
  pack: ref,
  compilerVersion: token,
  // The course subject owner supplies this key. The schema deliberately does not choose a subject.
  subject: token,
  sourceVersion: hash,
  curriculumRevision: z.number().int().positive().max(100_000),
  objective: ref,
  objectiveStatement: text(800),
  scope: text(1_000),
  /** Central explanatory claims. Production compilation requires at least one. */
  claims: z.array(claim).min(1).max(32).optional(),
  concepts: z.array(concept).min(1).max(32),
  prerequisites: z.array(prerequisite).max(64),
  coreExplanation: text(4_000),
  examples: z.array(example).min(2).max(16),
  misconceptions: z.array(misconception).min(1).max(16),
  rubric: z.object({
    id: token,
    version: token,
    criteria: z.array(criterion).min(1).max(12),
  }).strict(),
  assessments: z.array(task).min(2).max(16),
  transferTaskId: token,
  visualIntent: z.object({
    representation: token,
    requiredCapability: token,
    meaningfulManipulations: z.array(token).min(1).max(16),
  }).strict(),
  validation: z.object({
    status: z.literal('candidate'),
    structuralValidator: z.literal(PETROS_CONCEPT_PACK_VERSION),
    unresolvedIssues: z.array(text(600)).max(24),
    educatorReviewRequired: z.literal(true),
    approvedReviewId: z.null(),
  }).strict(),
}).strict().superRefine((pack, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const conceptIds = new Set(pack.concepts.map((item) => item.id));
  if (conceptIds.size !== pack.concepts.length) fail('PETROS_PACK_DUPLICATE_CONCEPT');
  const ids = (items: Array<{ id: string }>, code: string) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) fail(code);
  };
  ids(pack.examples, 'PETROS_PACK_DUPLICATE_EXAMPLE');
  ids(pack.misconceptions, 'PETROS_PACK_DUPLICATE_MISCONCEPTION');
  ids(pack.rubric.criteria, 'PETROS_PACK_DUPLICATE_CRITERION');
  ids(pack.assessments, 'PETROS_PACK_DUPLICATE_ASSESSMENT');
  ids(pack.claims ?? [], 'PETROS_PACK_DUPLICATE_CLAIM');
  const prerequisiteKeys = pack.prerequisites.map((edge) =>
    `${edge.fromConceptId}:${edge.toConceptId}:${edge.strength}`);
  if (new Set(prerequisiteKeys).size !== prerequisiteKeys.length)
    fail('PETROS_PACK_DUPLICATE_PREREQUISITE');
  for (const edge of pack.prerequisites) {
    if (!conceptIds.has(edge.fromConceptId) || !conceptIds.has(edge.toConceptId) || edge.fromConceptId === edge.toConceptId)
      fail('PETROS_PACK_INVALID_PREREQUISITE_REFERENCE');
  }
  const hard = pack.prerequisites.filter((edge) => edge.strength === 'hard');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (hard.some((edge) => edge.fromConceptId === id && cycle(edge.toConceptId))) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...conceptIds].some(cycle)) fail('PETROS_PACK_HARD_PREREQUISITE_CYCLE');
  const criteria = new Set(pack.rubric.criteria.map((item) => item.id));
  for (const item of pack.assessments) for (const discriminator of item.misconceptionDiscriminators)
    if (!pack.misconceptions.some(m => m.id === discriminator.misconceptionId))
      fail('PETROS_PACK_UNKNOWN_MISCONCEPTION_DISCRIMINATOR');
  for (const item of pack.assessments)
    if (item.criteria.some((id) => !criteria.has(id))) fail('PETROS_PACK_UNKNOWN_RUBRIC_CRITERION');
  const transfer = pack.assessments.find((item) => item.id === pack.transferTaskId);
  if (!transfer?.unseenContext) fail('PETROS_PACK_TRANSFER_TASK_NOT_UNSEEN');
  if (!pack.examples.some((item) => item.kind === 'worked_example' || item.kind === 'example'))
    fail('PETROS_PACK_EXAMPLE_REQUIRED');
  if (!pack.examples.some((item) => item.kind === 'non_example' || item.kind === 'counterexample'))
    fail('PETROS_PACK_NON_EXAMPLE_REQUIRED');
});
export type PetrosConceptPackCandidate = z.infer<typeof petrosConceptPackCandidateSchema>;

export const petrosConceptPackTrustedContextSchema = z.object({
  currentSourceVersion: hash,
  currentCurriculumRevision: z.number().int().positive().max(100_000),
  currentObjective: ref,
  resolvedAnchors: z.array(petrosResolvedDocumentLocatorSchema).min(1).max(256),
}).strict();
export type PetrosConceptPackTrustedContext = z.infer<typeof petrosConceptPackTrustedContextSchema>;

/** Structural/source validation only. Scientific and pedagogical approval remain external. */
export function validatePetrosConceptPackCandidate(
  raw: unknown,
  trustedRaw: unknown,
): PetrosConceptPackCandidate {
  if (JSON.stringify(raw).length > 256_000) throw new Error('PETROS_PACK_PAYLOAD_TOO_LARGE');
  const pack = petrosConceptPackCandidateSchema.parse(raw);
  const trusted = petrosConceptPackTrustedContextSchema.parse(trustedRaw);
  if (pack.sourceVersion !== trusted.currentSourceVersion)
    throw new Error('PETROS_PACK_STALE_SOURCE');
  if (pack.curriculumRevision !== trusted.currentCurriculumRevision ||
    pack.objective.id !== trusted.currentObjective.id ||
    pack.objective.version !== trusted.currentObjective.version)
    throw new Error('PETROS_PACK_STALE_CURRICULUM');
  const key = (locator: z.infer<typeof petrosDocumentLocatorSchema>) =>
    [locator.sourceVersion, locator.objectId, locator.unitId, locator.page,
      locator.textSha256, locator.start, locator.end, locator.offsetEncoding].join(':');
  const resolved = new Set(trusted.resolvedAnchors.map((item) => key(item.locator)));
  const anchors = [
    ...(pack.claims ?? []).flatMap((item) => item.anchors),
    ...pack.concepts.flatMap((item) => item.anchors),
    ...pack.prerequisites.flatMap((item) => item.anchors),
    ...pack.examples.flatMap((item) => item.anchors),
    ...pack.misconceptions.flatMap((item) => item.anchors),
    ...pack.assessments.flatMap((item) => item.anchors),
  ];
  if (anchors.some((item) => item.locator.sourceVersion !== pack.sourceVersion || !resolved.has(key(item.locator))))
    throw new Error('PETROS_PACK_UNRESOLVED_SOURCE_ANCHOR');
  return pack;
}
