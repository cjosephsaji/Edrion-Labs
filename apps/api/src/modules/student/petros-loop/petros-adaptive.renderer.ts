import {
  PETROS_PLAN_SCHEMA_VERSION, PETROS_RENDER_SCHEMA_VERSION,
  petrosAdaptiveSnapshotSchema, petrosPlanDecisionSchema, petrosTeachingBlockContentSchema,
  type PetrosAdaptiveSnapshot, type PetrosConceptPackCandidate, type PetrosSessionState,
  type PetrosTeachingBlockContent,
} from '@edrion/schemas';

type AdaptiveMove = Extract<PetrosAdaptiveSnapshot['output']['decision'], { status: 'proposed' }>['selectedMove'];
type PackTask = PetrosConceptPackCandidate['assessments'][number];
type PackMisconception = PetrosConceptPackCandidate['misconceptions'][number];

export class PetrosAdaptivePackRenderabilityError extends Error {
  constructor() {
    super('PETROS_PACK_NOT_RENDERABLE');
  }
}

/** Compatibility projection only. The decision has already been made by the policy owner. */
export function adaptiveLegacyDecision(snapshot: PetrosAdaptiveSnapshot, state: PetrosSessionState) {
  const { decision } = snapshot.output;
  if (decision.status !== 'proposed') throw new Error('PETROS_ADAPTIVE_POLICY_BLOCKED');
  const parameters = {
    layered_explanation: { layerCount: 3, emphasis: 'Reviewed source explanation', sourceGroundingRequired: true },
    contrast_case: { distinction: 'Compare reviewed examples and non-examples', examShaped: false },
    socratic_probe: { probeNumber: 1, insightTarget: 'Clarify the distinction', explainAfterThis: true },
    diagram: { diagramType: 'concept_map', editable: true, fallback: 'structured_text' },
    worked_example: { stepCount: 2, predictionPoints: 0, problemStyle: 'conceptual' },
    recall_check: { questionCount: 1, answerMode: 'short_answer', coverage: 'Reviewed objective application' },
    synthesis: { promptStyle: 'teach_back', includeForwardLink: false, focus: 'Describe what the application demonstrated' },
    artifact_commit: { artifactKinds: ['note'], requireExplicitConsent: true },
  } as const;
  return petrosPlanDecisionSchema.parse({
    schemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    selectedMoveType: decision.selectedMove,
    targetConcept: snapshot.output.objective.id,
    studentSafeReason: decision.studentSafeReason,
    decisionFactors: [decision.reason, `policy:${snapshot.output.schemaVersion}`],
    moveParameters: parameters[decision.selectedMove], expectedEvidence: decision.expectedEvidence,
    progressEffect: { checkpointId: state.currentCheckpointId, effect: 'advance', progressDelta: 1 },
    canStream: false, termination: { recommendation: 'continue', reason: 'Current reviewed objective' },
    guessFirst: { status: 'not_applicable', targetId: null, reason: 'Explain before independent application' },
    observationResponse: { causalObservationIds: [], action: 'continue', acknowledgement: null, routeChange: null, returnPlan: null },
    selectionPolicy: { normalizedCandidateWeights: { [decision.selectedMove]: 1 }, exclusions: [], selectedWeight: 1,
      override: null, capabilityFallback: null },
  });
}

/**
 * Fixed rendering of qualified-reviewed material; no provider or policy selection.
 * DTO bounds are checked, never repaired by generating or silently truncating reviewed claims.
 */
export function renderAdaptiveContent(pack: PetrosConceptPackCandidate, raw: PetrosAdaptiveSnapshot) {
  const snapshot = petrosAdaptiveSnapshotSchema.parse(raw);
  const selected = snapshot.output.decision;
  if (selected.status !== 'proposed') throw new Error('PETROS_ADAPTIVE_POLICY_BLOCKED');
  const task = selected.selectedMove === 'recall_check'
    ? pack.assessments.find(item => item.id === snapshot.output.selectedTask?.id &&
      item.variant === snapshot.output.selectedTask.variant)
    : undefined;
  if (selected.selectedMove === 'recall_check' && !task)
    throw new Error('PETROS_ADAPTIVE_SELECTED_TASK_MISSING');
  let misconception: PackMisconception | undefined;
  const signal = snapshot.input.signal;
  if (signal.kind === 'misconception') {
    const misconceptionId = signal.misconceptionId;
    misconception = pack.misconceptions.find(item => item.id === misconceptionId);
  }
  return renderSelectedAdaptiveContent(pack, selected.selectedMove, task, misconception);
}

/**
 * Renders the exact bounded projections used at lesson time. Pack admission invokes
 * every supported projection so an approved pack cannot later fail its render DTO.
 */
function renderSelectedAdaptiveContent(
  pack: PetrosConceptPackCandidate,
  selectedMove: AdaptiveMove,
  task?: PackTask,
  misconception?: PackMisconception,
): PetrosTeachingBlockContent {
  const base = { schemaVersion: PETROS_RENDER_SCHEMA_VERSION, type: selectedMove,
    title: 'Reviewed objective' };
  const grounding = [...new Set(pack.concepts.flatMap(c => c.anchors.map(a => a.locator.page)))]
    .slice(0, 8).map(page => ({ label: `Original source, page ${page}`, reference: `${pack.sourceVersion}:page:${page}` }));
  const example = pack.examples.find(item => item.kind === 'example' || item.kind === 'worked_example');
  const nonExample = pack.examples.find(item => item.kind === 'non_example' || item.kind === 'counterexample');
  if (!example || !nonExample) throw new PetrosAdaptivePackRenderabilityError();
  switch (selectedMove) {
    case 'layered_explanation': {
      // Exact consecutive text spans preserve the reviewed explanation in full.
      const chunks = chunkExplanation(pack.coreExplanation);
      return petrosTeachingBlockContentSchema.parse({ ...base, firstLayer: chunks[0],
        deeperLayers: chunks.slice(1).map((content, i) => ({ id: `layer-${i + 2}`, label: 'Continue explanation', content })),
        keyIdea: pack.objectiveStatement, sourceGrounding: grounding });
    }
    case 'contrast_case':
      return petrosTeachingBlockContentSchema.parse({ ...base,
        left: { label: 'Example', prompt: example.prompt, method: example.explanation },
        right: { label: 'Non-example', prompt: nonExample.prompt, method: nonExample.explanation },
        keyDistinction: pack.objectiveStatement });
    case 'worked_example':
      return petrosTeachingBlockContentSchema.parse({ ...base, problemStatement: example.prompt,
        steps: [{ id: 'example', title: 'Example', explanation: example.explanation },
          { id: 'non-example', title: 'Compare a non-example', explanation: nonExample.explanation }],
        finalCheck: pack.objectiveStatement, sourceGrounding: grounding });
    case 'diagram': {
      const concepts = pack.concepts.slice(0, 19);
      return petrosTeachingBlockContentSchema.parse({ ...base, diagramType: 'concept_map',
        nodes: [{ id: 'objective', label: 'Objective', description: pack.objectiveStatement },
          ...concepts.map((c, i) => ({ id: `concept-${i}`, label: c.label, description: c.definition }))],
        edges: concepts.map((_, i) => ({ from: `concept-${i}`, to: 'objective', label: 'Part of this teaching pack' })),
        altText: pack.objectiveStatement, editable: true, fallbackText: pack.objectiveStatement });
    }
    case 'socratic_probe': {
      return petrosTeachingBlockContentSchema.parse({ ...base, probeNumber: 1,
        prompt: misconception?.discriminator ?? 'Which part of the reviewed explanation would you like to clarify?',
        insightTarget: pack.objectiveStatement,
        explanationAfterCap: misconception?.correction ?? pack.coreExplanation });
    }
    case 'recall_check': {
      if (!task) throw new Error('PETROS_ADAPTIVE_SELECTED_TASK_MISSING');
      return petrosTeachingBlockContentSchema.parse({ ...base,
        instructions: 'Apply the reviewed idea to this new item.',
        questions: [{ id: 'reviewed-task', prompt: task.prompt, responseType: 'short_answer' }],
        answerContract: { completion: 'all_questions_answered', responseHandling: 'evaluate_stage_3' },
        feedback: { submittedMessage: 'Your response is recorded with its observed assistance conditions.',
          stageBoundary: 'Coverage, confidence and demonstrated evidence remain separate.' } });
    }
    case 'synthesis':
      return petrosTeachingBlockContentSchema.parse({ ...base,
        prompt: 'Explain the distinction you used in the new application.', tighteningGuidance: pack.objectiveStatement });
    case 'artifact_commit':
      return petrosTeachingBlockContentSchema.parse({ ...base,
        prompt: 'Choose what to save from this session for a later self-review.', consentRequired: true,
        proposals: [{ id: 'objective-note', kind: 'note', label: 'Objective note', preview: pack.objectiveStatement }] });
  }
}

/** Deterministically reject candidate content that any legal adaptive render could not emit. */
export function assertPetrosAdaptivePackRenderable(pack: PetrosConceptPackCandidate) {
  try {
    const moves: AdaptiveMove[] = [
      'layered_explanation', 'contrast_case', 'diagram', 'worked_example', 'synthesis', 'artifact_commit',
    ];
    for (const move of moves) renderSelectedAdaptiveContent(pack, move);
    // The no-diagnosis fallback and every reviewed misconception are distinct Socratic outputs.
    renderSelectedAdaptiveContent(pack, 'socratic_probe');
    for (const misconception of pack.misconceptions)
      renderSelectedAdaptiveContent(pack, 'socratic_probe', undefined, misconception);
    // A policy decision may select any still-available assessment task.
    for (const task of pack.assessments) renderSelectedAdaptiveContent(pack, 'recall_check', task);
  } catch (error) {
    if (error instanceof PetrosAdaptivePackRenderabilityError) throw error;
    throw new PetrosAdaptivePackRenderabilityError();
  }
}

/** Teacher previews use the exact production content projections, with no evidence write. */
export function renderTeachingPackPreview(pack: PetrosConceptPackCandidate) {
  assertPetrosAdaptivePackRenderable(pack);
  return [renderSelectedAdaptiveContent(pack, 'layered_explanation'),
    renderSelectedAdaptiveContent(pack, 'contrast_case'),
    renderSelectedAdaptiveContent(pack, 'worked_example'),
    renderSelectedAdaptiveContent(pack, 'diagram'),
    ...pack.assessments.map(task => renderSelectedAdaptiveContent(pack, 'recall_check', task))];
}

/**
 * The schema requires each rendered layer to contain at least 20 characters.
 * Rebalance only the final pair when a 2,000-character split would leave a short tail.
 */
function chunkExplanation(value: string): string[] {
  const maximum = 2_000;
  const minimum = 20;
  if (value.length <= maximum) return [value];
  const remainder = value.length % maximum;
  const firstLength = remainder > 0 && remainder < minimum
    ? maximum - (minimum - remainder)
    : maximum;
  return [value.slice(0, firstLength), ...value.slice(firstLength).match(/[\s\S]{1,2000}/g)!];
}
