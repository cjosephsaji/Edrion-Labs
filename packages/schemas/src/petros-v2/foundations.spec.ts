import { describe, expect, it } from 'vitest';
import { validateTeachingAction, authorizedTeachingActionSchema } from './teaching-actions';
import { v2CommandSchema, v2SessionSchema, validateSessionPreconditions } from './session';
import { companionPresentationSchema } from './companion';
import { teachingDecisionSchema, modelTeachingDecisionSchema } from './decision';
import { educationalExperienceSchema, validateEducationalExperience } from './experience';
import { learningProposalSchema, modelLearningProposalSchema } from './proposal';
import { committedResponseSchema, evidenceClassificationSchema, publicStudentTaskSchema } from './assessment';
import { canvasOperationBatchSchema, canvasSubmissionSnapshotSchema } from './canvas';
import { presentationCheckpointSchema } from './timeline';
const id = (n = 1) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`, hash = 'a'.repeat(64);
const source = { sourceId: id(), sourceRevisionId: id(2), sourceHash: hash, representationHash: hash,
  unitId: id(3), unitHash: hash, locator: { kind: 'synthetic', section: 'cloud', span: { start: 0, end: 10 } }, semanticId: null };
const scope = { id: id(4), version: 1, hash, curriculumRevision: 1, review: { reviewId: id(5), payloadHash: hash } };
const envelope = { schemaVersion: 'petros.v2.teaching-action.v2', actionId: id(), sessionId: id(2), objectiveId: id(4), sequence: 1,
  requiredCapability: 'public.read@1', source, target: { unitId: id(3), elementId: 'unit', kind: 'unit' },
  preconditions: { sessionRevision: 1, epoch: 2, canvasRevision: 3, draftRevision: 4 } };
const operations = [
  { type: 'read_source', start: 0, end: 10 }, { type: 'write_text', text: 'Public text' }, { type: 'write_equation', stepId: 'step' },
  { type: 'draw_diagram', nodeIds: ['client', 'service'] }, { type: 'draw_graph', familyId: 'graph.v1', parameters: [1, 2] },
  { type: 'highlight', elementIds: ['unit'] }, { type: 'annotate', text: 'Public annotation' },
  { type: 'edit', operation: { type: 'replace_content', id: 'unit', expectedVersion: 1, text: 'Public edit' } },
  { type: 'trace_code', lineIds: ['line-1'] }, { type: 'invoke_simulation', kernelId: 'cloud.capacity@1', parameters: [1, 2], steps: 10 },
  { type: 'request_student_action', checkpointId: id(9) }, { type: 'speak', publicUtteranceId: id(10) },
  { type: 'gesture', cueId: id(11) }, { type: 'wait', durationMs: 1000 },
  { type: 'evaluate_submission', committedSubmissionId: id(12), owner: 'private_assessment_service', authority: 'request_only' },
];
describe('M1 future teaching action admission', () => {
  it.each(operations.map(o => [o.type, o] as const))('represents bounded %s without executable definitions', (_, operation) => {
    const action = authorizedTeachingActionSchema.parse({ ...envelope, operation });
    expect(action.operation.type).toBe(operation.type);
    expect(() => authorizedTeachingActionSchema.parse({ ...envelope, operation: { ...operation, javascript: 'eval(input)' } })).toThrow();
  });
  const authority = { sessionId: id(2), sessionRevision: 1, epoch: 2, canvasRevision: 3, draftRevision: 4,
    capabilities: new Set(['public.read@1']), semanticTargets: new Set([`${id(3)}:unit:unit`]), committedSubmissions: new Set([id(12)]), nextSequence: 1,
    sourcePins: new Map([[id(3), { ...source, locator: { kind: 'synthetic' as const, section: 'cloud', span: { start: 0, end: 10 } } }]]),
    allowedOperationFamilies: new Map([['public.read@1', new Set(['read_source'])]]), objectiveIds: new Set([id(4)]) };
  it('validates current server pins, exact target and operation capability', () => {
    expect(validateTeachingAction({ ...envelope, operation: operations[0] }, authority).source.unitHash).toBe(hash);
    expect(() => validateTeachingAction({ ...envelope, operation: operations[9] }, authority)).toThrow('SOURCE_OR_OPERATION');
    expect(() => validateTeachingAction({ ...envelope, operation: operations[0], source: { ...source, unitHash: 'b'.repeat(64) } }, authority)).toThrow('SOURCE_OR_OPERATION');
    expect(() => validateTeachingAction({ ...envelope, operation: operations[0], requiredCapability: 'private.evaluate@1' }, authority)).toThrow('TARGET_OR_CAPABILITY');
  });
  it.each(['sessionRevision', 'epoch', 'canvasRevision', 'draftRevision'] as const)('rejects stale %s', key => {
    expect(() => validateTeachingAction({ ...envelope, operation: operations[0], preconditions: { ...envelope.preconditions, [key]: 0 } }, authority)).toThrow('STALE');
  });
  it('rejects uncommitted evaluation, grade injection and model assessment invocation', () => {
    const evaluationAuthority = { ...authority, allowedOperationFamilies: new Map([['public.read@1', new Set(['evaluate_submission'])]]), committedSubmissions: new Set<string>() };
    expect(() => validateTeachingAction({ ...envelope, operation: operations[14] }, evaluationAuthority)).toThrow('UNCOMMITTED');
    expect(() => authorizedTeachingActionSchema.parse({ ...envelope, operation: { ...operations[14], officialGrade: 100 } })).toThrow();
    expect(() => teachingDecisionSchema.parse({ schemaVersion: 'petros.v2.decision.v1', id: id(), objective: { id: id(4), version: 1 }, scope,
      proposedAction: { ...envelope, operation: operations[14] }, evidenceRefs: [], hypothesisRefs: [], sources: [source], expectedObservation: '',
      branches: [], studentExplanation: '', origin: 'model_proposal', termination: null, abstention: null })).toThrow('cannot invoke');
  });
  it('enforces registered kernel parameter domains and existing tighter step bounds', () => {
    const a = { ...envelope, requiredCapability: 'cloud.capacity@1', operation: operations[9] };
    const auth = { ...authority, capabilities: new Set(['cloud.capacity@1']), allowedOperationFamilies: new Map([['cloud.capacity@1', new Set(['invoke_simulation'])]]),
      kernels: new Map([['cloud.capacity@1', { maxSteps: 16, parameters: [{ min: 0, max: 2 }, { min: 0, max: 2 }] }]]) };
    expect(validateTeachingAction(a, auth).operation.type).toBe('invoke_simulation');
    expect(() => validateTeachingAction({ ...a, operation: { ...operations[9], steps: 17 } }, auth)).toThrow('KERNEL_PARAMETERS');
    expect(() => validateTeachingAction({ ...a, operation: { ...operations[9], parameters: [5, 2] } }, auth)).toThrow('KERNEL_PARAMETERS');
  });
});
describe('M1 durable public contract foundations', () => {
  const session = { schemaVersion: 'petros.v2.session.v1', engine: 'v2', id: id(), institutionId: id(2), studentId: id(3), scope,
    status: 'active', revision: 1, turnEpoch: 2, actionSequence: 3, canvasRevision: 4, studentDraftRevision: 5,
    checkpoint: null, acknowledgments: [], submissions: [], recovery: { status: 'consistent', interruptedCommandId: null, resumeEpoch: 2 } };
  it('represents V2 session identity and rejects stale commands without changing V1', () => {
    const s = v2SessionSchema.parse(session), command = v2CommandSchema.parse({ schemaVersion: 'petros.v2.command.v1', commandId: id(7), sessionId: s.id,
      expectedRevision: 1, expectedEpoch: 2, expectedCanvasRevision: 4, expectedDraftRevision: 5, requestHash: hash, type: 'pause' });
    validateSessionPreconditions(command, s);
    expect(() => validateSessionPreconditions({ ...command, expectedEpoch: 1 }, s)).toThrow('STALE');
    expect(() => v2SessionSchema.parse({ ...session, engine: 'v1' })).toThrow();
  });
  it('keeps proposals unapproved and checks objective references', () => {
    const p = { schemaVersion: 'petros.v2.proposal.v1', id: id(), institutionId: id(2), version: 1, status: 'proposed', origin: 'model',
      releaseScopeId: id(4), objectives: [{ candidateId: id(5), statement: 'Identify a claim', concepts: [], sources: [source] }], graph: null,
      claims: [], activities: [{ id: id(6), family: 'argument.v1', objectiveCandidateId: id(5), publicContent: [source], privateAssessmentDraftId: id(7), capabilities: ['public.read@1'] }],
      uncertainties: ['Alternate interpretations need review'], requiredReviews: ['scope', 'qualified_assessment'] };
    expect(learningProposalSchema.parse(p).status).toBe('proposed');
    expect(modelLearningProposalSchema.parse(p).origin).toBe('model');
    expect(() => modelLearningProposalSchema.parse({ ...p, origin: 'teacher' })).toThrow('impersonate');
    expect(() => learningProposalSchema.parse({ ...p, status: 'approved' })).toThrow();
    expect(() => learningProposalSchema.parse({ ...p, reviewerId: id(1) })).toThrow();
    expect(() => learningProposalSchema.parse({ ...p, activities: [{ ...p.activities[0], objectiveCandidateId: id(20) }] })).toThrow();
    const decision = { schemaVersion: 'petros.v2.decision.v1', id: id(), objective: { id: id(4), version: 1 }, scope,
      proposedAction: null, evidenceRefs: [], hypothesisRefs: [], sources: [source], expectedObservation: '', branches: [], studentExplanation: '',
      origin: 'teacher', termination: null, abstention: 'no_review' };
    expect(() => modelTeachingDecisionSchema.parse(decision)).toThrow('impersonate');
  });
  it('requires issued public tasks, committed response hashes and conservative evidence', () => {
    const task = { schemaVersion: 'petros.v2.public-task.v1', taskId: id(), familyId: 'argument.v1', familyVersion: 1, scope,
      prompt: 'Identify a claim.', sources: [source], responseKind: 'text', choices: [], assessmentRef: id(2) };
    expect(publicStudentTaskSchema.parse(task).assessmentRef).toBe(id(2));
    expect(() => publicStudentTaskSchema.parse({ ...task, answerKey: 'secret' })).toThrow();
    expect(committedResponseSchema.parse({ schemaVersion: 'petros.v2.committed-response.v1', id: id(), taskId: id(), sessionId: id(2), commandId: id(3),
      responseHash: hash, text: 'Public response', snapshotId: null, snapshotHash: null, committedAt: '2026-10-12T00:00:00Z', draftRevision: 1 }).text).toBe('Public response');
    expect(() => evidenceClassificationSchema.parse({ exposure: 'unassisted', eligibility: 'eligible', criteria: [{ criterionId: 'claim', status: 'satisfied',
      origin: 'model_formative', reason: 'Model proposed result', evidence: [] }], outsideHelp: 'unknown' })).toThrow();
  });
  it('admits only registered renderer/kernel families and exact parameter bounds', () => {
    const e = { schemaVersion: 'petros.v2.experience.v1', familyId: 'cloud.capacity', familyVersion: 1, renderer: 'table.v1', trustedKernel: 'cloud.capacity@1',
      parameters: [{ id: 'capacity', value: 5, min: 1, max: 10, unit: 'requests/s' }], publicState: { caption: 'Synthetic capacity', semanticElements: ['capacity'], values: [{ elementId: 'capacity', value: 5 }] },
      allowedOperations: ['read', 'set_parameter'], accessibility: { text: 'Capacity is five requests per second', keyboard: true, reducedMotion: true }, issuedTaskRef: null };
    const registry = new Map([['cloud.capacity@1', { renderer: 'table.v1', kernel: 'cloud.capacity@1', operations: new Set(['read', 'set_parameter']),
      parameters: new Map([['capacity', { min: 1, max: 10, unit: 'requests/s' }]]) }]]);
    expect(validateEducationalExperience(e, registry).familyId).toBe('cloud.capacity');
    expect(() => validateEducationalExperience(e, new Map())).toThrow('UNREGISTERED');
    expect(() => validateEducationalExperience({ ...e, parameters: [{ ...e.parameters[0], max: 1000 }] }, registry)).toThrow('PARAMETER');
    expect(() => educationalExperienceSchema.parse({ ...e, javascript: 'alert(1)' })).toThrow();
  });
  it('preserves source anchors and opaque submission/undo boundaries', () => {
    const anchor = { elementId: 'unit', source, kind: 'unit', semanticId: 'unit' };
    expect(canvasOperationBatchSchema.parse({ schemaVersion: 'petros.v2.canvas-batch.v1', commandId: id(), operationId: id(2), requestHash: hash,
      activityId: id(3), epoch: 1, expectedCanvasRevision: 2, expectedDraftRevision: 3, checkpointId: id(4),
      operations: [{ type: 'replace_content', id: 'unit', expectedVersion: 1, text: 'Edit' }], anchors: [anchor],
      editableRegions: [{ id: 'public', elements: ['unit'], operations: ['replace_content'] }] }).operations.length).toBe(1);
    expect(canvasSubmissionSnapshotSchema.parse({ schemaVersion: 'petros.v2.canvas-submission.v1', id: id(), activityId: id(3), checkpointId: id(4),
      canvasRevision: 2, draftRevision: 3, contentHash: hash, elements: [], anchors: [anchor], undoBoundary: { lastOperationId: id(2), lastSubmittedRevision: 2 } }).contentHash).toBe(hash);
  });
  it('fences presentation resume to an ordered semantic prefix and actual audio references', () => {
    const t = { schemaVersion: 'petros.v2.presentation-checkpoint.v1', timelineId: id(), epoch: 1, beats: [{ id: 'beat', actionId: id(2), canvasOperationIds: [id(3), id(4)],
      speechSegmentId: id(5), cueId: id(6), studentCheckpointId: null, barrier: 'actual_audio_ack' }], completedOperations: [id(3)], completedBeatIds: [],
      audioAck: { segmentId: id(5), offsetMs: 1000, status: 'paused' }, state: 'interrupted', resumeEpoch: 2 };
    expect(presentationCheckpointSchema.parse(t).resumeEpoch).toBe(2);
    expect(() => presentationCheckpointSchema.parse({ ...t, completedOperations: [id(4)] })).toThrow();
    expect(() => presentationCheckpointSchema.parse({ ...t, audioAck: { ...t.audioAck, segmentId: id(20) } })).toThrow();
  });
  it('admits supported companion controls and neutral verification behavior', () => {
    const c = { schemaVersion: 'petros.v2.companion.v1', persona: { id: 'mentor', version: 3 }, rig: { id: 'current_art', version: 1,
      expressions: ['neutral'], gestures: ['neutral'] }, cueId: id(), publicCue: { mode: 'waiting', gesture: 'neutral', targetId: null, caption: '' },
      expression: 'neutral', semanticTarget: null, utteranceId: null, captionId: null, epoch: 1, voiceState: 'text_only', assessmentBehavior: 'neutral_verification',
      acknowledgment: { status: 'pending', segmentId: null, offsetMs: 0 } };
    expect(companionPresentationSchema.parse(c).expression).toBe('neutral');
    expect(() => companionPresentationSchema.parse({ ...c, expression: 'unsupported_eyes' })).toThrow();
    expect(() => companionPresentationSchema.parse({ ...c, semanticTarget: 'correct_answer' })).toThrow();
  });
});
