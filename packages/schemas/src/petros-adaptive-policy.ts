import { z } from 'zod';
import { petrosKnowledgePolicySchema } from './petros-knowledge-policy';

/**
 * Phase 2 deterministic policy. Its production caller must
 * resolve current source, pack, assignment and tenant authority, and derive
 * signals from trusted evidence before any commit. It chooses a move and reason;
 * a renderer cannot use this as content authority.
 */
export const PETROS_ADAPTIVE_POLICY_VERSION = 'petros.adaptive-policy.v1' as const;
const ref = z.object({ id: z.string().uuid(), version: z.number().int().positive().max(100_000) }).strict();
const token = z.string().trim().min(1).max(180);
const signal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new_topic') }).strict(),
  z.object({ kind: z.literal('no_evidence') }).strict(),
  z.object({ kind: z.literal('explanation_seen') }).strict(),
  z.object({ kind: z.literal('synthesis_seen') }).strict(),
  z.object({ kind: z.literal('correct_uncertain'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('assisted_success'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('hint_exposed'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('wrong_confident'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('ambiguous'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('independent_transfer'), evidenceEventId: token }).strict(),
  z.object({ kind: z.literal('repeated_confusion'), evidenceEventIds: z.array(token).min(2).max(8) }).strict(),
  z.object({
    kind: z.literal('misconception'),
    misconceptionId: token,
    diagnosis: z.enum(['supported', 'uncertain']),
    evidenceEventIds: z.array(token).min(1).max(8),
  }).strict(),
]);

export const petrosAdaptivePolicyInputSchema = z.object({
  schemaVersion: z.literal(PETROS_ADAPTIVE_POLICY_VERSION),
  objective: ref,
  pack: ref,
  policyVersion: token,
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  curriculumRevision: z.number().int().positive().max(100_000),
  assignmentVersions: z.array(z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict()).max(100),
  signal,
  availableTasks: z.array(z.object({ id: token, variant: token, unseenContext: z.boolean() }).strict()).max(16),
  constraints: z.object({
    sourceReady: z.boolean(),
    sourceGrounding: z.enum(['supported', 'uncertain']),
    explanationPresented: z.boolean(),
    remainingSeconds: z.number().int().min(0).max(86_400),
    diagramAvailable: z.boolean(),
    assistance: z.enum(['ordinary_study', 'guided_homework']),
  }).strict(),
}).strict().superRefine((input, ctx) => {
  if ('evidenceEventIds' in input.signal &&
    new Set(input.signal.evidenceEventIds).size !== input.signal.evidenceEventIds.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_POLICY_DUPLICATE_EVIDENCE' });
});
export type PetrosAdaptivePolicyInput = z.infer<typeof petrosAdaptivePolicyInputSchema>;

const decision = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('blocked'),
    reason: z.literal('source_unavailable'),
  }).strict(),
  z.object({
    status: z.literal('proposed'),
    selectedMove: z.enum([
      'layered_explanation', 'contrast_case', 'socratic_probe',
      'diagram', 'worked_example', 'recall_check', 'synthesis', 'artifact_commit',
    ]),
    reason: z.enum([
      'new_topic', 'no_evidence', 'supported_misconception',
      'diagnosis_uncertain', 'representation_change', 'correct_uncertain',
      'assistance_requires_new_item', 'independent_transfer', 'time_to_close',
      'assignment_restriction',
      'confident_error', 'source_uncertain', 'hint_exposed', 'explain_before_probe',
      'coverage_check', 'task_bank_exhausted',
      'synthesis_complete',
    ]),
    expectedEvidence: z.enum([
      'none', 'clarification', 'new_independent_item', 'unseen_transfer',
    ]),
    diagnosis: z.enum(['none', 'tentative', 'supported']),
    progress: z.enum(['coverage_only', 'await_evidence', 'demonstrated_elsewhere']),
    studentSafeReason: z.string().trim().min(1).max(240),
  }).strict(),
]);
type ProposedDecision = Extract<z.infer<typeof decision>, { status: 'proposed' }>;

export const petrosAdaptivePolicyDecisionSchema = z.object({
  schemaVersion: z.literal(PETROS_ADAPTIVE_POLICY_VERSION),
  objective: ref,
  pack: ref,
  policyVersion: token,
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  curriculumRevision: z.number().int().positive().max(100_000),
  assignmentVersions: z.array(z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict()).max(100),
  signal,
  selectedTask: z.object({ id: token, variant: token }).strict().nullable(),
  decision,
}).strict();
export type PetrosAdaptivePolicyDecision = z.infer<typeof petrosAdaptivePolicyDecisionSchema>;

export const petrosAdaptiveBindCommandSchema = z.object({
  commandId: z.string().uuid(),
  pack: ref,
}).strict();
export type PetrosAdaptiveBindCommand = z.infer<typeof petrosAdaptiveBindCommandSchema>;

/** Persisted policy provenance. Rendering may consume this decision but cannot revise it. */
export const petrosAdaptiveSnapshotSchema = z.object({
  schemaVersion: z.literal('petros.adaptive-snapshot.v1'),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewId: z.string().uuid(),
  policy: petrosKnowledgePolicySchema,
  input: petrosAdaptivePolicyInputSchema,
  output: petrosAdaptivePolicyDecisionSchema,
}).strict();
export type PetrosAdaptiveSnapshot = z.infer<typeof petrosAdaptiveSnapshotSchema>;

/** Deterministic proposal only. No provider call, content rendering or evidence write. */
export function proposePetrosAdaptiveMove(raw: unknown): PetrosAdaptivePolicyDecision {
  const input = petrosAdaptivePolicyInputSchema.parse(raw);
  const common = {
    schemaVersion: PETROS_ADAPTIVE_POLICY_VERSION,
    objective: input.objective,
    pack: input.pack,
    policyVersion: input.policyVersion,
    sourceVersion: input.sourceVersion,
    curriculumRevision: input.curriculumRevision,
    assignmentVersions: input.assignmentVersions,
    signal: input.signal,
  };
  if (!input.constraints.sourceReady) return petrosAdaptivePolicyDecisionSchema.parse({
    ...common, selectedTask: null, decision: { status: 'blocked', reason: 'source_unavailable' },
  });
  const propose = (
    selectedMove: ProposedDecision['selectedMove'],
    reason: ProposedDecision['reason'],
    expectedEvidence: ProposedDecision['expectedEvidence'],
    diagnosis: ProposedDecision['diagnosis'],
    progress: ProposedDecision['progress'],
    studentSafeReason: string,
  ) => {
    const task = selectedMove === 'recall_check'
      ? input.availableTasks.find(item => expectedEvidence !== 'unseen_transfer' || item.unseenContext) : null;
    if (selectedMove === 'recall_check' && !task) return petrosAdaptivePolicyDecisionSchema.parse({
      ...common, selectedTask: null, decision: { status: 'proposed', selectedMove: 'artifact_commit',
        reason: 'task_bank_exhausted', expectedEvidence: 'none', diagnosis: 'none', progress: 'coverage_only',
        studentSafeReason: 'Save your work. No new reviewed item is available for an independent check.' },
    });
    return petrosAdaptivePolicyDecisionSchema.parse({ ...common,
      selectedTask: task ? { id: task.id, variant: task.variant } : null, decision: {
        status: 'proposed', selectedMove, reason, expectedEvidence, diagnosis, progress, studentSafeReason,
      } });
  };
  const { signal: observed, constraints } = input;
  if (observed.kind === 'synthesis_seen') return propose(
    'artifact_commit', 'synthesis_complete', 'none', 'none', 'coverage_only',
    'Save a useful record of this objective and return later for review.',
  );
  if (constraints.sourceGrounding === 'uncertain') return propose(
    'layered_explanation', 'source_uncertain', 'none', 'tentative', 'coverage_only',
    'Check the original source before drawing a conclusion from this explanation.',
  );
  if (constraints.remainingSeconds < 120) return propose(
    'artifact_commit', 'time_to_close', 'none', 'none', 'coverage_only',
    'Time is short. Save a useful summary and return later for a new check.',
  );
  if (observed.kind === 'new_topic') return propose(
    'layered_explanation', 'new_topic', 'none', 'none', 'coverage_only',
    'Start with a direct explanation before asking you to solve anything.',
  );
  if (!constraints.explanationPresented) return propose(
    'layered_explanation', 'explain_before_probe', 'none', 'none', 'coverage_only',
    'First review the explanation, then use a new question to check the distinction.',
  );
  if (observed.kind === 'explanation_seen') return propose(
    'recall_check', 'coverage_check', 'new_independent_item', 'none', 'await_evidence',
    'The explanation is covered. A new application will check what you can demonstrate.',
  );
  if (observed.kind === 'wrong_confident') return propose(
    'contrast_case', 'confident_error', 'new_independent_item', 'tentative', 'await_evidence',
    'Your confident prediction differed from the result. Compare two cases before trying a new one.',
  );
  if (observed.kind === 'ambiguous') return propose(
    'socratic_probe', 'diagnosis_uncertain', 'clarification', 'tentative', 'await_evidence',
    'The earlier response does not establish a diagnosis. Clarify one part of the explanation.',
  );
  if (observed.kind === 'hint_exposed') return propose(
    'recall_check', 'hint_exposed', 'new_independent_item', 'none', 'await_evidence',
    'A hint was available on the earlier item. Use a different item to check what you can do now.',
  );
  if (observed.kind === 'misconception') {
    if (observed.diagnosis === 'uncertain') return propose(
      'socratic_probe', 'diagnosis_uncertain', 'clarification', 'tentative', 'await_evidence',
      'One short question will clarify which part needs a different explanation.',
    );
    return propose(
      'contrast_case', 'supported_misconception', 'new_independent_item', 'supported', 'await_evidence',
      'Compare two cases to test the distinction behind the earlier answer.',
    );
  }
  if (observed.kind === 'repeated_confusion') {
    if (constraints.diagramAvailable) return propose(
      'diagram', 'representation_change', 'clarification', 'tentative', 'await_evidence',
      'A visual explanation may make the relationship clearer.',
    );
    return propose(
      constraints.assistance === 'guided_homework' ? 'socratic_probe' : 'worked_example',
      constraints.assistance === 'guided_homework' ? 'assignment_restriction' : 'representation_change',
      'clarification', 'tentative', 'await_evidence',
      'Try a different explanation, then check which step remains unclear.',
    );
  }
  if (observed.kind === 'correct_uncertain') return propose(
    'recall_check', 'correct_uncertain', 'new_independent_item', 'tentative', 'await_evidence',
    'Your answer looks promising. A nearby new case can check the reasoning.',
  );
  if (observed.kind === 'assisted_success') return propose(
    'recall_check', 'assistance_requires_new_item', 'new_independent_item', 'none', 'await_evidence',
    'Now try a different case without that help.',
  );
  if (observed.kind === 'independent_transfer') return propose(
    'synthesis', 'independent_transfer', 'none', 'none', 'demonstrated_elsewhere',
    'Bring together what this new application showed.',
  );
  return propose(
    'layered_explanation', 'no_evidence', 'none', 'none', 'coverage_only',
    'Build a foundation before treating this topic as demonstrated.',
  );
}
