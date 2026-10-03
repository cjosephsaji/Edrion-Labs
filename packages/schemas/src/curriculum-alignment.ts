import { z } from 'zod';
import {
  boundedCompatibility, compatibilityIntervalSchema, compatibilityProvenanceSchema,
  compatibilityText, compatibilityIsEffective, compatibilityIdentifier,
} from './petros-compatibility';

export const CURRICULUM_ALIGNMENT_VERSION = 'petros.curriculum-alignment.v1' as const;
const identity = { id: z.string().uuid(), version: z.number().int().positive().max(100_000) };
const ref = z.object(identity).strict();
const common = { ...identity, provenance: compatibilityProvenanceSchema };
const objective = z.object({
  ...common, descriptor: compatibilityText(2000), effective: compatibilityIntervalSchema,
}).strict();
const framework = z.object({
  ...common, title: compatibilityText(200), jurisdiction: compatibilityText(200),
  subject: compatibilityText(200), level: compatibilityText(200), issuingBody: compatibilityText(300),
  externalId: compatibilityIdentifier(300), uri: z.string().url().max(1000).nullable(),
}).strict();
const release = z.object({
  ...common, framework: ref, publisherVersion: compatibilityIdentifier(200),
  effective: compatibilityIntervalSchema, supersedes: ref.nullable(),
}).strict();
const item = z.object({
  ...common, release: ref, externalId: compatibilityIdentifier(300), uri: z.string().url().max(1000).nullable(),
  descriptor: compatibilityText(4000),
}).strict();
const relationship = z.object({
  ...common, from: ref, to: ref,
  relation: z.enum(['parent_of', 'part_of', 'related_to', 'precedes', 'publisher_declared']),
  declaredRelation: compatibilityText(300).nullable(),
}).strict();
const alignment = z.object({
  ...common, objective: ref, standard: ref,
  relation: z.enum(['addresses', 'partially_addresses', 'prerequisite_for', 'related_to']),
  rationale: compatibilityText(2000), gaps: z.array(compatibilityText(500)).max(20),
  confidence: z.number().finite().min(0).max(1).nullable(),
  status: z.enum(['proposed', 'approved', 'rejected']),
  effective: compatibilityIntervalSchema,
  overrideReason: compatibilityText(1000).nullable(),
}).strict();

/** Course-owned immutable records; no concept compilation, grades, evidence or teaching state. */
export const curriculumAlignmentPayloadSchema = z.object({
  schemaVersion: z.literal(CURRICULUM_ALIGNMENT_VERSION),
  objectives: z.array(objective).max(64),
  frameworks: z.array(framework).max(16),
  releases: z.array(release).max(32),
  items: z.array(item).max(128),
  relationships: z.array(relationship).max(128),
  alignments: z.array(alignment).max(128),
  moduleObjectives: z.array(z.object({
    weekNo: z.number().int().min(1).max(52), objectives: z.array(ref).max(64),
  }).strict()).max(52),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const key = (r: z.infer<typeof ref>) => `${r.id}:${r.version}`;
  const sets = Object.fromEntries(['objectives', 'frameworks', 'releases', 'items', 'relationships', 'alignments'].map((kind) => {
    const records = v[kind as 'objectives'];
    if (new Set(records.map((r) => r.id)).size !== records.length) fail(`Duplicate ${kind} identity.`);
    return [kind, new Set(records.map(key))];
  }));
  const requireRef = (kind: string, r: z.infer<typeof ref>) => { if (!sets[kind]?.has(key(r))) fail(`Missing ${kind} version reference.`); };
  for (const r of v.releases) {
    requireRef('frameworks', r.framework);
    if (r.supersedes) {
      requireRef('releases', r.supersedes);
      const prior = v.releases.find((x) => key(x) === key(r.supersedes!));
      if (prior && (key(prior.framework) !== key(r.framework) || prior.id === r.id)) fail('Invalid release supersession.');
    }
  }
  for (const i of v.items) requireRef('releases', i.release);
  const externalItems = v.items.map((i) => `${key(i.release)}:${i.externalId}`);
  if (new Set(externalItems).size !== externalItems.length) fail('Duplicate publisher item in a release.');
  for (const r of v.relationships) {
    requireRef('items', r.from); requireRef('items', r.to);
    if (r.from.id === r.to.id) fail('Self relationship is unsupported.');
    if (r.relation === 'publisher_declared' && !r.declaredRelation) fail('Publisher relationship needs its declared type.');
  }
  for (const a of v.alignments) { requireRef('objectives', a.objective); requireRef('items', a.standard); }
  if (new Set(v.moduleObjectives.map((m) => m.weekNo)).size !== v.moduleObjectives.length) fail('Duplicate module mapping.');
  for (const m of v.moduleObjectives) {
    if (new Set(m.objectives.map(key)).size !== m.objectives.length) fail('Duplicate module objective.');
    for (const o of m.objectives) requireRef('objectives', o);
  }
  // Parent and release-supersession cycles are invalid. Other declared relations may cycle.
  for (const edges of [
    v.relationships.filter((r) => r.relation === 'parent_of').map((r) => [key(r.from), key(r.to)]),
    v.releases.filter((r) => r.supersedes).map((r) => [key(r), key(r.supersedes!)]),
  ]) {
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      if (edges.some(([from, to]) => from === id && visit(to!))) return true;
      visiting.delete(id); visited.add(id); return false;
    };
    if (edges.some(([from]) => visit(from!))) fail('Cyclic hierarchy or supersession.');
  }
});
export const curriculumAlignmentSchema = boundedCompatibility(curriculumAlignmentPayloadSchema, 192_000);
export const curriculumAlignmentWriteSchema = z.object({
  expectedRevision: z.number().int().min(0).max(99_999),
  commandId: z.string().uuid(), reason: compatibilityText(1000),
  payload: curriculumAlignmentSchema,
}).strict();
export type CurriculumAlignment = z.infer<typeof curriculumAlignmentSchema>;
export type CurriculumAlignmentWrite = z.infer<typeof curriculumAlignmentWriteSchema>;

export const CURRICULUM_RECORD_KINDS = ['objectives', 'frameworks', 'releases', 'items', 'relationships', 'alignments'] as const;

/** Consumer projection never translates coverage/approval into learner demonstration. */
export function curriculumAlignmentView(payload: CurriculumAlignment, now: number) {
  const alignments = payload.alignments.map((a) => {
    const objective = payload.objectives.find((o) => o.id === a.objective.id)!;
    const item = payload.items.find((i) => i.id === a.standard.id)!;
    const release = payload.releases.find((r) => r.id === item.release.id)!;
    const superseded = payload.releases.some((r) => r.supersedes?.id === release.id && compatibilityIsEffective(r.effective, now));
    const state = a.status !== 'approved' ? a.status : superseded ? 'stale' :
      [a.effective, objective.effective, release.effective].every((v) => compatibilityIsEffective(v, now)) ? 'approved' : 'not_effective';
    return { id: a.id, version: a.version, objective: a.objective, standard: a.standard, relation: a.relation,
      rationale: a.rationale, gaps: a.gaps, confidence: a.confidence, overrideReason: a.overrideReason, state };
  });
  return { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, evidence: 'not_assessed' as const,
    objectives: payload.objectives, frameworks: payload.frameworks, releases: payload.releases,
    items: payload.items, relationships: payload.relationships, moduleObjectives: payload.moduleObjectives,
    alignments, unmappedObjectives: payload.objectives.filter((o) => !alignments.some((a) => a.objective.id === o.id && a.state === 'approved')).map((o) => o.id) };
}

const readBase = { schemaVersion: z.literal(CURRICULUM_ALIGNMENT_VERSION), revision: z.number().int().min(0),
  revisionId: z.string().uuid().optional(), evidence: z.literal('not_assessed') };
const viewSchema = z.object({
  schemaVersion: z.literal(CURRICULUM_ALIGNMENT_VERSION), evidence: z.literal('not_assessed'),
  objectives: z.array(objective).max(64), frameworks: z.array(framework).max(16), releases: z.array(release).max(32),
  items: z.array(item).max(128), relationships: z.array(relationship).max(128),
  moduleObjectives: curriculumAlignmentPayloadSchema.innerType().shape.moduleObjectives,
  alignments: z.array(alignment.omit({ status: true, provenance: true, effective: true }).extend({
    state: z.enum(['proposed', 'approved', 'rejected', 'stale', 'not_effective']),
  }).strict()).max(128),
  unmappedObjectives: z.array(z.string().uuid()).max(64),
}).strict();
export const curriculumReadSchema = boundedCompatibility(z.discriminatedUnion('status', [
  z.object({ ...readBase, status: z.literal('ready'), data: viewSchema }).strict(),
  z.object({ ...readBase, status: z.literal('unmapped') }).strict(),
  z.object({ ...readBase, status: z.literal('stale') }).strict(),
  z.object({ ...readBase, status: z.literal('unsupported_version') }).strict(),
]), 256_000);
export type CurriculumRead = z.infer<typeof curriculumReadSchema>;
/** Missing extension is an old reader, never an inferred standard mapping. */
export function readCurriculumCompatibility(value: unknown): CurriculumRead | null {
  if (value === undefined || value === null) return null;
  const parsed = curriculumReadSchema.safeParse(value);
  return parsed.success ? parsed.data : { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, revision: 0, evidence: 'not_assessed', status: 'unsupported_version' };
}

/**
 * Student readers receive the current approved plan, not the portal review manifest. Keep the
 * records needed to interpret an approved standard reference, including links among retained items
 * and release-supersession ancestry. Stale/unsupported/unmapped states stay content-free.
 */
export function studentCurriculumReadView(value: CurriculumRead, now: number): CurriculumRead {
  const read = curriculumReadSchema.parse(value);
  if (read.status !== 'ready') return read;

  const key = (ref: { id: string; version: number }) => `${ref.id}:${ref.version}`;
  const objectives = read.data.objectives.filter((objective) => compatibilityIsEffective(objective.effective, now));
  const objectiveKeys = new Set(objectives.map(key));
  const alignments = read.data.alignments.filter(
    (alignment) => alignment.state === 'approved' && objectiveKeys.has(key(alignment.objective)),
  );

  // Keep only standards directly referenced by the approved student plan. Relationships are
  // descriptive context only when both endpoints are already in that set.
  const itemKeys = new Set(alignments.map((alignment) => key(alignment.standard)));
  const items = read.data.items.filter((item) => itemKeys.has(key(item)));
  const relationships = read.data.relationships.filter(
    (relationship) => itemKeys.has(key(relationship.from)) && itemKeys.has(key(relationship.to)),
  );

  // A release's supersedes reference is semantic data. Preserve its complete bounded ancestry
  // instead of dropping the referenced release or changing the reference to null.
  const releaseKeys = new Set(items.map((item) => key(item.release)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const release of read.data.releases) {
      if (!releaseKeys.has(key(release)) || !release.supersedes) continue;
      const priorKey = key(release.supersedes);
      if (!releaseKeys.has(priorKey)) {
        releaseKeys.add(priorKey);
        changed = true;
      }
    }
  }
  const releases = read.data.releases.filter((release) => releaseKeys.has(key(release)));
  const frameworkKeys = new Set(releases.map((release) => key(release.framework)));
  const frameworks = read.data.frameworks.filter((framework) => frameworkKeys.has(key(framework)));
  const moduleObjectives = read.data.moduleObjectives
    .map((module) => ({
      ...module,
      objectives: module.objectives.filter((objective) => objectiveKeys.has(key(objective))),
    }))
    .filter((module) => module.objectives.length > 0);
  const mappedObjectiveKeys = new Set(alignments.map((alignment) => key(alignment.objective)));

  return curriculumReadSchema.parse({
    ...read,
    data: {
      ...read.data,
      objectives,
      frameworks,
      releases,
      items,
      relationships,
      moduleObjectives,
      alignments,
      unmappedObjectives: objectives
        .filter((objective) => !mappedObjectiveKeys.has(key(objective)))
        .map((objective) => objective.id),
    },
  });
}
