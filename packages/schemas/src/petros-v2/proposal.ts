import { z } from 'zod';
import { conceptPinSchema, reviewPinSchema, teachingReferenceSchema, sourceBindingSchema, sourceRevisionSchema, v2Hash, v2Key, v2Uuid, v2Version } from './content';

export const conceptVersionPayloadSchema = z.object({ schemaVersion: z.literal('petros.v2.concept-version.v1'),
  label: z.string().min(1).max(500), definition: z.string().min(1).max(4000),
  provenance: z.array(teachingReferenceSchema).min(1).max(24),
  mappings: z.array(z.object({ target: conceptPinSchema, relation: z.enum(['equivalent', 'broader', 'narrower']),
    review: reviewPinSchema }).strict()).max(24),
}).strict();
export type ConceptVersionPayload = z.infer<typeof conceptVersionPayloadSchema>;
export const conceptGraphSchema = z.object({ schemaVersion: z.literal('petros.v2.concept-graph.v1'),
  institutionId: v2Uuid, courseId: v2Uuid.nullable(), concepts: z.array(conceptPinSchema).min(1).max(24),
  edges: z.array(z.object({ from: conceptPinSchema, to: conceptPinSchema,
    kind: z.enum(['hard_prerequisite', 'recommended', 'related']), review: reviewPinSchema,
  }).strict()).max(48), traversalDepth: z.number().int().min(0).max(2),
}).strict().superRefine((g, ctx) => {
  const key = (p: z.infer<typeof conceptPinSchema>) => `${p.id}:${p.version}`;
  const ids = new Set(g.concepts.map(key));
  if (ids.size !== g.concepts.length || new Set(g.concepts.map(p => p.id)).size !== g.concepts.length) ctx.addIssue({ code: 'custom', message: 'Duplicate concept pin' });
  const edges = new Set<string>();
  for (const e of g.edges) {
    if (!ids.has(key(e.from)) || !ids.has(key(e.to)) || e.from.id === e.to.id) ctx.addIssue({ code: 'custom', message: 'Unknown or self concept reference' });
    const id = `${key(e.from)}:${key(e.to)}:${e.kind}`;
    if (edges.has(id)) ctx.addIssue({ code: 'custom', message: 'Duplicate graph edge' }); edges.add(id);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const e of g.edges.filter(e => e.kind === 'hard_prerequisite' && key(e.from) === id)) if (!walk(key(e.to))) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  if (g.concepts.some(p => !walk(key(p)))) ctx.addIssue({ code: 'custom', message: 'Cyclic hard prerequisites' });
});
export type ConceptGraph = z.infer<typeof conceptGraphSchema>;
/** Registry is resolved by the server from immutable versions and current review authority. */
export function validateConceptGraph(input: unknown, registry: Array<{ id: string; version: number; institutionId: string }>,
  authorizedReviews: ReadonlySet<string>) {
  const g = conceptGraphSchema.parse(input);
  for (const p of g.concepts) if (!registry.some(r => r.id === p.id && r.version === p.version && r.institutionId === g.institutionId))
    throw new Error('UNKNOWN_OR_FOREIGN_CONCEPT_VERSION');
  if (g.edges.some(e => !authorizedReviews.has(`${e.review.reviewId}:${e.review.payloadHash}`))) throw new Error('UNAUTHORIZED_CONCEPT_MAPPING');
  return g;
}
export const releaseScopePinSchema = z.object({ id: v2Uuid, version: v2Version, hash: v2Hash,
  curriculumRevision: v2Version, review: reviewPinSchema,
}).strict();
export const learningProposalSchema = z.object({ schemaVersion: z.literal('petros.v2.proposal.v1'),
  id: v2Uuid, institutionId: v2Uuid, version: v2Version, status: z.literal('proposed'), origin: z.enum(['model', 'teacher', 'import']),
  releaseScopeId: v2Uuid,
  objectives: z.array(z.object({ candidateId: v2Uuid, statement: z.string().min(1).max(2000),
    concepts: z.array(conceptPinSchema).max(24), sources: z.array(teachingReferenceSchema).min(1).max(24) }).strict()).min(1).max(24),
  graph: conceptGraphSchema.nullable(),
  prerequisites: z.array(z.object({ from: conceptPinSchema, to: conceptPinSchema,
    kind: z.enum(['hard_prerequisite', 'recommended', 'related']), rationale: z.string().min(1).max(1000),
    sources: z.array(teachingReferenceSchema).max(16) }).strict()).max(48).default([]),
  claims: z.array(z.object({ statement: z.string().min(1).max(4000), support: z.array(teachingReferenceSchema).min(1).max(16) }).strict()).max(48),
  activities: z.array(z.object({ id: v2Uuid, family: v2Key, objectiveCandidateId: v2Uuid,
    publicContent: z.array(teachingReferenceSchema).max(24), privateAssessmentDraftId: v2Uuid.nullable(),
    capabilities: z.array(v2Key).max(16) }).strict()).max(24),
  uncertainties: z.array(z.string().min(1).max(500)).max(48),
  requiredReviews: z.array(z.enum(['source', 'scope', 'qualified_assessment'])).min(1).max(3),
}).strict().superRefine((p, ctx) => {
  const ids = new Set(p.objectives.map(o => o.candidateId));
  if (ids.size !== p.objectives.length || p.activities.some(a => !ids.has(a.objectiveCandidateId)) || (p.graph && p.graph.institutionId !== p.institutionId))
    ctx.addIssue({ code: 'custom', message: 'Unknown objective or foreign proposal graph' });
}); // No approval, reviewer identity, or release authority can be supplied by a model.
export type LearningProposal = z.infer<typeof learningProposalSchema>;
/** Use this at the future M2 model-output boundary; server-authored proposals use the full schema. */
export const modelLearningProposalSchema = learningProposalSchema.refine(p => p.origin === 'model' && p.graph === null,
  'Model proposals cannot impersonate teacher authority or provide approved graph receipts');

// M3 is additive: the M1 proposal contract and readers above remain unchanged.
const m3Text = z.string().trim().min(1).max(2000);
export const M3_PROPOSAL_VERSION = 'petros.v2.learning-proposal.v1' as const;
export const M3_MODEL_VERSION = 'petros.m3.proposal.v1' as const;
export const m3ActivityFamilySchema = z.enum(['source_reading', 'comparison', 'relationship_board',
  'progressive_explanation', 'equation_demonstration', 'diagram_construction', 'table_exploration',
  'prediction_change_explain', 'faded_practice', 'process_animation', 'safe_code_trace',
  'student_editing', 'trusted_simulation', 'targeted_question']);
export const m3EvidenceSchema = z.object({ reference: teachingReferenceSchema, quote: m3Text }).strict();
export const m3TeacherPreferencesSchema = z.object({ focus: z.string().trim().max(500).default(''),
  durationMinutes: z.number().int().min(5).max(90).default(20), emphasis: z.string().trim().max(500).default('') }).strict();
const m3CandidateObjectiveSchema = z.object({ key: v2Key, wording: m3Text,
  observableCapability: m3Text, support: z.array(m3EvidenceSchema).min(1).max(4),
  conceptKeys: z.array(v2Key).max(8), assumptions: z.array(m3Text).max(8) }).strict();
/** Provider output has local keys only. IDs, origins, decisions and authority are server owned. */
export const m3ModelProposalSchema = z.object({ schemaVersion: z.literal(M3_MODEL_VERSION),
  objectives: z.array(m3CandidateObjectiveSchema).min(1).max(3),
  concepts: z.array(z.object({ key: v2Key, label: z.string().min(1).max(500), definition: m3Text,
    support: z.array(m3EvidenceSchema).min(1).max(4) }).strict()).max(24),
  relationships: z.array(z.object({ from: v2Key, to: v2Key,
    kind: z.enum(['recommended', 'related', 'hard_prerequisite']), rationale: m3Text,
    support: z.array(m3EvidenceSchema).min(1).max(4) }).strict()).max(48),
  claims: z.array(z.object({ key: v2Key, statement: m3Text,
    support: z.array(m3EvidenceSchema).min(1).max(4) }).strict()).max(24),
  activities: z.array(z.object({ key: v2Key, objectiveKey: v2Key, family: m3ActivityFamilySchema,
    purpose: m3Text, expectedObservation: m3Text, support: z.array(m3EvidenceSchema).min(1).max(4),
    renderer: v2Key, kernel: v2Key.nullable(), operations: z.array(v2Key).max(8),
    editableRegions: z.array(v2Key).max(8), accessibilityAlternative: m3Text,
    expectedResult: m3Text, assumptions: z.array(m3Text).max(8) }).strict()).min(1).max(12),
  uncertainties: z.array(m3Text).max(24) }).strict();
export type M3ModelProposal = z.infer<typeof m3ModelProposalSchema>;
export const m3ReviewDimensionSchema = z.enum(['teaching_scope', 'concepts', 'activities', 'assessment_instrument']);
export const m3ReviewReceiptSchema = z.object({ schemaVersion: z.literal('petros.v2.scope-review.v1'),
  id: v2Uuid, proposalId: v2Uuid, proposalVersion: v2Version, sourceRevisionId: v2Uuid,
  payloadHash: v2Hash, dimension: m3ReviewDimensionSchema, decision: z.enum(['approved','rejected','revision_requested']),
  reviewerUserId: v2Uuid, qualificationId: v2Uuid, qualificationVersion: v2Version,
  taskFamily: z.object({ id: v2Uuid, version: v2Version, hash: v2Hash }).strict().nullable(),
  nonEquivalenceDecision: z.enum(['distinct','equivalent','uncertain']).nullable().default(null),
  reason: m3Text, reviewedAt: z.string().datetime() }).strict();
export type M3ReviewReceipt = z.infer<typeof m3ReviewReceiptSchema>;
export const m3ProposalSchema = z.object({ schemaVersion: z.literal(M3_PROPOSAL_VERSION),
  id: v2Uuid, version: v2Version, institutionId: v2Uuid, classId: v2Uuid, subjectId: v2Uuid,
  courseId: v2Uuid.nullable(), curriculumRevision: z.number().int().nonnegative(),
  source: z.object({ binding: sourceBindingSchema, revisionId: v2Uuid, originalHash: v2Hash,
    representationHash: v2Hash, extractor: v2Key, interpretationVersion: v2Key,
    coverage: sourceRevisionSchema.innerType().shape.coverage, references: z.array(teachingReferenceSchema).min(1).max(16) }).strict(),
  generator: z.object({ origin: z.enum(['controlled_fixture','engineering_source_outline','genuine_model']),
    promptVersion: v2Key, promptHash: v2Hash, model: z.string().max(240).nullable(),
    routeId: v2Uuid.nullable(), providerRequestId: z.string().max(500).nullable() }).strict(),
  preferences: m3TeacherPreferencesSchema,
  state: z.enum(['draft','ready_for_review','needs_source_review','under_review','revision_requested',
    'teaching_approved','verification_pending','release_eligible','released','superseded','withdrawn','blocked']),
  objectives: z.array(m3CandidateObjectiveSchema.extend({ id: v2Uuid, version: v2Version,
    conceptRefs: z.array(conceptPinSchema).max(8), claimIds: z.array(v2Uuid).max(24),
    selectedActivityId: v2Uuid.nullable(), reviewStatus: z.enum(['needs_review','accepted','edited']) })).min(1).max(3),
  concepts: z.array(m3ModelProposalSchema.shape.concepts.element.extend({ id: v2Uuid, version: v2Version })).max(24),
  relationships: z.array(m3ModelProposalSchema.shape.relationships.element.extend({
    status: z.literal('review_required') })).max(48), traversalDepth: z.literal(2),
  claims: z.array(m3ModelProposalSchema.shape.claims.element.extend({ id: v2Uuid,
    classification: z.enum(['literal_excerpt','proposed_interpretation','needs_human_review','rejected']),
    semanticStatus: z.literal('review_required'), highRisk: z.boolean() })).max(24),
  activities: z.array(m3ModelProposalSchema.shape.activities.element.extend({ id: v2Uuid,
    objectiveId: v2Uuid, capabilityStatus: z.enum(['structural_preview','unsupported_execution']),
    reviewStatus: z.enum(['needs_review','selected','rejected']), assessmentClassification: z.literal('teaching_only') })).max(12),
  taskCandidates: z.array(z.object({ id: v2Uuid, version: v2Version, objectiveId: v2Uuid,
    criterion: m3Text, kind: z.enum(['formative_practice','discriminator','transfer','held_out_verification']),
    expectedWork: m3Text, assistance: z.enum(['source_available','unassisted']),
    nonEquivalenceRequired: z.boolean(), status: z.literal('qualified_review_required') }).strict()).max(12),
  uncertainties: z.array(m3Text).max(24), blockers: z.array(v2Key).max(24),
  correction: z.object({ previousVersion: v2Version.nullable(), editorId: v2Uuid,
    commandId: v2Uuid, requestHash: v2Hash, changedFields: z.array(z.string().max(120)).max(24),
    revalidation: z.literal('review_required'), at: z.string().datetime() }).strict(),
  createdBy: v2Uuid, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  reviewRefs: z.array(v2Uuid).max(16), releaseRef: v2Uuid.nullable() }).strict();
export type M3Proposal = z.infer<typeof m3ProposalSchema>;
export const m3PrepareCommandSchema = z.object({ commandId: v2Uuid, sourceRevisionId: v2Uuid,
  preferences: m3TeacherPreferencesSchema.default({}), origin: z.enum(['engineering_source_outline','gateway']).default('engineering_source_outline') }).strict();
export const m3EditCommandSchema = z.object({ commandId: v2Uuid, expectedVersion: v2Version,
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('objective'), objectiveId: v2Uuid, wording: m3Text }).strict(),
    z.object({ kind: z.literal('accept_objective'), objectiveId: v2Uuid }).strict(),
    z.object({ kind: z.literal('remove_objective'), objectiveId: v2Uuid }).strict(),
    z.object({ kind: z.literal('reorder'), objectiveIds: z.array(v2Uuid).min(1).max(3) }).strict(),
    z.object({ kind: z.literal('claim'), claimId: v2Uuid, statement: m3Text }).strict(),
    z.object({ kind: z.literal('reject_claim'), claimId: v2Uuid }).strict(),
    z.object({ kind: z.literal('select_activity'), objectiveId: v2Uuid, activityId: v2Uuid }).strict(),
    z.object({ kind: z.literal('reject_activity'), activityId: v2Uuid }).strict(),
    z.object({ kind: z.literal('submit_review') }).strict(),
    z.object({ kind: z.literal('withdraw'), reason: m3Text }).strict(),
    z.object({ kind: z.literal('save') }).strict() ]) }).strict();
export const m3ReviewCommandSchema = z.object({ commandId: v2Uuid, expectedVersion: v2Version,
  qualificationId: v2Uuid, qualificationVersion: v2Version, dimension: m3ReviewDimensionSchema,
  decision: z.enum(['approved','rejected','revision_requested']), reason: m3Text,
  taskFamilyId: v2Uuid.nullable().default(null), taskFamilyVersion: v2Version.nullable().default(null),
  nonEquivalenceDecision: z.enum(['distinct','equivalent','uncertain']).nullable().default(null) }).strict();
export const m3ReleaseCommandSchema = z.object({ commandId: v2Uuid, expectedVersion: v2Version }).strict();
