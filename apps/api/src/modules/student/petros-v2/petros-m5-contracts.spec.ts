import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  initialSharedCanvas,
  applyStudentCanvasCommand,
  instructionalDecisionSchema,
  teachingManifestSchema,
} from '@edrion/schemas';
import { PetrosV2OrchestratorService } from './petros-v2-orchestrator.service';
import { compileTeachingExperience } from './petros-experience-compiler';
import { validateTeachingFragment } from './petros-teaching-actions';
import { runTrustedExperiment, validateEquationStep } from './petros-equation-validator';
import {
  reduceConceptBelief,
  type BeliefEvent,
} from '../../petros-learner-model/petros-concept-belief.engine';
import { proposeTeachingWithGateway } from './tools';
import type { PetrosTeachingContext } from './petros-v2-context';

export function contractContext(): PetrosTeachingContext {
  const ref = {
    sourceId: randomUUID(),
    sourceRevisionId: randomUUID(),
    sourceHash: 'a'.repeat(64),
    representationHash: 'b'.repeat(64),
    unitId: randomUUID(),
    unitHash: 'c'.repeat(64),
    locator: { kind: 'synthetic' as const, section: 'source', span: { start: 0, end: 20 } },
    semanticId: null,
  };
  const criterion = randomUUID();
  const fragment = {
    id: 'relation',
    strategies: ['conceptual_contrast', 'clarifying_question'],
    criterionIds: [criterion],
    capability: 'diagram',
    reference: ref,
    quote: 'Reviewed source text.',
    explanation: 'Inspect the relationship.',
    accessibleAlternative: 'Element list with labelled controls.',
    operations: [
      {
        type: 'add',
        element: {
          id: 'node-a',
          kind: 'node',
          version: 1,
          label: 'A',
          text: 'A',
          sourceId: `source-${ref.unitId}`,
          editable: true,
          x: 150,
          y: 90,
        },
      },
    ],
    relationships: [],
    equationSteps: [],
    simulation: null,
    checkpoint: null,
    expectedObservation: 'A new committed explanation.',
    limitations: [],
  };
  const manifest = teachingManifestSchema.parse({
    version: 'petros.m5.reviewed.v1',
    graphVersion: 'graph.v1',
    prerequisites: [],
    criteria: [
      {
        id: criterion,
        conceptId: randomUUID(),
        conceptVersion: 1,
        category: 'conceptual',
        role: 'concept',
        distinguishes: true,
      },
    ],
    fragments: [fragment],
    taskRole: 'initial',
    fragmentIds: [],
  });
  const objectiveId = randomUUID();
  return {
    institutionId: randomUUID(),
    studentId: randomUUID(),
    sessionId: randomUUID(),
    objectiveId,
    publication: {
      lesson: {
        objective: { id: objectiveId, version: 1, label: 'Objective' },
        references: [ref],
        excerpts: [{ reference: ref, text: 'Reviewed source text.' }],
      },
      sourceRevisionId: ref.sourceRevisionId,
      sourceHash: ref.sourceHash,
    } as PetrosTeachingContext['publication'],
    publicationHash: 'd'.repeat(64),
    epoch: 0,
    canvas: { ...initialSharedCanvas('activity'), mode: 'session' },
    manifest,
    authority: { source: true, review: true, scope: true, currentEpoch: true },
    evidence: [
      {
        evaluation: {
          id: randomUUID(),
          responseId: randomUUID(),
          status: 'evaluated',
          criteria: [
            {
              criterionId: criterion,
              label: 'Criterion',
              status: 'not_satisfied',
              origin: 'trusted_kernel',
              feedback: 'Needs review.',
            },
          ],
          evaluatorVersion: 'petros.m4.kernel.v1',
          supersedes: null,
          reason: null,
        },
        assisted: false,
        repeated: false,
        equivalenceKey: 'one',
        committed: true,
      },
    ],
    capabilities: ['diagram', 'equation', 'source', 'process', 'simulation', 'code_trace'],
    accessibility: { textAlternative: true, reducedMotion: false },
    budget: { remainingDecisions: 2, deadline: Date.now() + 20000, providerAuthorized: false },
    independentTaskOpen: false,
    selectedTarget: null,
  };
}
const decide = (c: PetrosTeachingContext) => new PetrosV2OrchestratorService().decide(c);
describe('M5 strict action admission and perturbation', () => {
  it.each(['source', 'review', 'scope', 'currentEpoch'] as const)(
    'rejects lost %s authority before selection',
    (key) => {
      const c = contractContext();
      c.authority[key] = false;
      expect(decide(c).strategy).toBe('unavailable');
    },
  );
  it('rejects independent-task help, exhausted budget, missing accessible alternative and missing capability', () => {
    const a = contractContext();
    a.independentTaskOpen = true;
    expect(decide(a).strategy).toBe('unavailable');
    const b = contractContext();
    b.budget.remainingDecisions = 0;
    expect(decide(b).termination).toBe('budget');
    const c = contractContext();
    c.accessibility.textAlternative = false;
    expect(decide(c).strategy).toBe('unavailable');
    const d = contractContext();
    d.capabilities = [];
    expect(decide(d).fragmentId).toBeNull();
  });
  it('does not depend on student identity, source title or subject labels', () => {
    const a = contractContext(),
      first = decide(a);
    a.studentId = randomUUID();
    a.publication.lesson.title = 'Renamed';
    a.publication.lesson.subject = 'Different subject';
    expect(decide(a).strategy).toBe(first.strategy);
  });
  it('changes when a valid criterion outcome changes, preserves contradictions and abstains on failure', () => {
    const c = contractContext();
    expect(decide(c).strategy).toBe('conceptual_contrast');
    const earlier = structuredClone(c.evidence[0]!);
    earlier.evaluation.id = randomUUID();
    earlier.evaluation.criteria[0]!.status = 'satisfied';
    c.evidence.unshift(earlier);
    expect(decide(c)).toMatchObject({
      strategy: 'clarifying_question',
      uncertainty: 'conflicting',
    });
    c.evidence.at(-1)!.evaluation.status = 'unavailable';
    expect(decide(c).strategy).toBe('review_required');
  });
  it('does not admit uncommitted evidence as a misconception', () => {
    const c = contractContext();
    c.evidence[0]!.committed = false;
    expect(decide(c).hypothesis).toBeNull();
  });
  it('supports a hypothesis only after distinguishing non-equivalent independent evidence', () => {
    const c = contractContext();
    const e = structuredClone(c.evidence[0]!);
    e.evaluation.id = randomUUID();
    e.equivalenceKey = 'two';
    c.evidence.push(e);
    expect(decide(c).uncertainty).toBe('supported');
    e.repeated = true;
    expect(decide(c).uncertainty).toBe('candidate');
  });
  it('chooses a focused method or arithmetic target from distinct criterion failures', () => {
    const c = contractContext(),
      f = c.manifest.fragments[0]!;
    c.manifest.criteria[0]!.category = 'arithmetic';
    f.strategies = ['method_repair'];
    f.capability = 'equation';
    f.operations = [
      {
        type: 'add',
        element: {
          id: 'capacity',
          kind: 'equation',
          version: 1,
          label: 'Capacity',
          editable: true,
          sourceId: `source-${f.reference.unitId}`,
          tex: '48 / 8 = 6 VM',
          explanation: 'Whole capacity in VM',
          value: '?',
        },
      },
    ];
    f.equationSteps = [
      {
        id: 'divide',
        rule: 'divide',
        inputs: [
          { value: 48, unit: 'GB' },
          { value: 8, unit: 'GB/VM' },
        ],
        result: { value: 6, unit: 'VM' },
        assumptions: ['Positive divisor.'],
        corrects: null,
        elementId: 'capacity',
      },
    ];
    f.workBindings = [{ elementId: 'capacity', field: 'capacity' }];
    c.committedResponse = { kind: 'structured', values: { capacity: 11 } };
    const action = compileTeachingExperience(decide(c), c);
    expect(action.beats[0]?.operations[0]).toMatchObject({ type: 'add', element: { value: '11' } });
    c.committedResponse.values.capacity = 13;
    expect(compileTeachingExperience(decide(c), c).beats[0]?.operations[0]).toMatchObject({
      element: { value: '13' },
    });
  });
  it('rejects cyclic prerequisites', () => {
    const c = contractContext(),
      a = randomUUID(),
      b = randomUUID();
    c.manifest.prerequisites = [
      { from: a, to: b },
      { from: b, to: a },
    ];
    expect(decide(c).strategy).toBe('unavailable');
  });
  it.each(['sourceHash', 'sourceRevisionId', 'unitId'] as const)(
    'rejects fabricated/changed %s source pin',
    (key) => {
      const c = contractContext();
      c.manifest.fragments[0]!.reference[key] =
        key === 'sourceHash' ? 'f'.repeat(64) : randomUUID();
      expect(() => compileTeachingExperience(decide(c), c)).toThrow();
    },
  );
  it('rejects an unapproved composition, unsupported executable field and excessive operations', () => {
    const c = contractContext(),
      f = structuredClone(c.manifest.fragments[0]!);
    f.explanation = 'Unapproved';
    expect(() => validateTeachingFragment(f, c)).toThrow();
    expect(() =>
      validateTeachingFragment({ ...c.manifest.fragments[0], code: 'fetch(secret)' }, c),
    ).toThrow();
    c.manifest.fragments[0]!.operations = Array.from({ length: 33 }, () => ({
      type: 'highlight' as const,
      ids: [],
    }));
    expect(() => compileTeachingExperience(decide(c), c)).toThrow();
    const borrowed = contractContext();
    // A source from another tenant/context remains outside the current publication's exact whitelist.
    borrowed.manifest.fragments[0]!.reference = contractContext().manifest.fragments[0]!.reference;
    expect(() => compileTeachingExperience(decide(borrowed), borrowed)).toThrow('M5_SOURCE_PIN');
  });
  it('rejects deleted endpoints, unqualified direction and reversed source relationship', () => {
    const c = contractContext(),
      f = c.manifest.fragments[0]!;
    f.operations.push({
      type: 'connect_elements',
      element: {
        id: 'edge',
        kind: 'edge',
        version: 1,
        label: 'Edge',
        sourceId: `source-${f.reference.unitId}`,
        editable: false,
        from: 'node-a',
        to: 'missing',
        relation: 'supports',
        text: 'supports',
      },
    });
    expect(() => compileTeachingExperience(decide(c), c)).toThrow();
    f.relationships = [
      { from: 'missing', to: 'node-a', relation: 'supports', directionReviewed: true },
    ];
    expect(() => compileTeachingExperience(decide(c), c)).toThrow();
    const node = f.operations[0]!;
    if (node.type !== 'add' || node.element.kind !== 'node') throw Error('Expected node');
    f.operations.splice(1, 0, {
      type: 'add',
      element: { ...node.element, id: 'node-b', label: 'B', text: 'B' },
    });
    const edge = f.operations[2]!;
    if (edge.type !== 'connect_elements' || edge.element.kind !== 'edge')
      throw Error('Expected edge');
    edge.element.to = 'node-b';
    f.relationships = [
      { from: 'node-a', to: 'node-b', relation: 'supports', directionReviewed: true },
    ];
    expect(() =>
      validateTeachingFragment(
        { ...f, relationships: [{ ...f.relationships[0], directionReviewed: false }] },
        c,
      ),
    ).toThrow('directionReviewed');
    expect(() => compileTeachingExperience(decide(c), c)).not.toThrow();
    edge.element.from = 'node-b';
    edge.element.to = 'node-a';
    expect(() => compileTeachingExperience(decide(c), c)).toThrow('M5_UNREVIEWED_RELATIONSHIP');
  });
  it('rejects student/Petros concurrency and protected student edits', () => {
    const c = contractContext();
    c.canvas!.elements = [
      {
        id: 'fixed',
        kind: 'text',
        version: 1,
        label: 'Protected source',
        text: 'Source',
        sourceId: 'source',
        editable: false,
      },
    ];
    c.canvas!.invitation = {
      id: 'edit',
      prompt: 'Edit',
      editableIds: [],
      allowedOperations: ['replace_content'],
      submitted: false,
    };
    expect(() => compileTeachingExperience(decide(c), c)).toThrow();
    expect(() =>
      applyStudentCanvasCommand(c.canvas!, {
        mode: 'session',
        activityId: 'activity',
        branchId: 'fixture-practice',
        checkpointId: 'edit',
        expectedRevision: 0,
        expectedDraftRevision: 0,
        operations: [{ type: 'replace_content', id: 'fixed', expectedVersion: 1, text: 'Forged' }],
      }),
    ).toThrow();
  });
  it.each(['grade', 'approveTask', 'writeEvidence'])('model cannot add %s authority', (field) =>
    expect(() =>
      instructionalDecisionSchema.parse({ ...decide(contractContext()), [field]: true }),
    ).toThrow(),
  );
  it('runs only bounded arithmetic, rejects invalid units, divide by zero and symbolic transformations', () => {
    const step = {
      id: 'division',
      rule: 'divide',
      inputs: [
        { value: 48, unit: 'GB' },
        { value: 8, unit: 'GB/VM' },
      ],
      result: { value: 6, unit: 'VM' },
      assumptions: ['Divisor is positive.'],
      corrects: null,
      elementId: 'equation',
    };
    expect(validateEquationStep(step).result.value).toBe(6);
    expect(() =>
      validateEquationStep({
        ...step,
        inputs: [
          { value: 48, unit: 'GB' },
          { value: 0, unit: 'GB/VM' },
        ],
      }),
    ).toThrow();
    expect(() => validateEquationStep({ ...step, result: { value: 6, unit: 'GB' } })).toThrow();
    expect(() => validateEquationStep({ ...step, rule: 'cancel-symbols' })).toThrow();
  });
  it.each(Array.from({ length: 20 }, (_, i) => i))(
    'capacity and existing linear-rate arithmetic gold case %i',
    (i) => {
      expect(
        runTrustedExperiment({
          kernel: 'resource-capacity.v1',
          totalGB: 64 + i,
          reservedGB: 16,
          perVMGB: 8,
        }).output.capacity,
      ).toBe(Math.floor((48 + i) / 8));
      expect(
        runTrustedExperiment({ kernel: 'linear-rate.v1', rate: i, seconds: 4 }).output.requests,
      ).toBe(i * 4);
    },
  );
  it('reuses the existing registered projectile kernel within its same-level, no-drag domain', () => {
    const result = runTrustedExperiment({
      kernel: 'projectile-no-drag.v1',
      vx: 3,
      vy: 10,
      gravity: 10,
      seconds: 1,
    });
    expect(result.output.x).toBe(3);
    expect(result.output.y).toBe(5);
    expect(() =>
      runTrustedExperiment({
        kernel: 'projectile-no-drag.v1',
        vx: 3,
        vy: 10,
        gravity: 10,
        seconds: 3,
      }),
    ).toThrow();
  });
  it('checks every plotted point against the registered bounded kernel', () => {
    const c = contractContext(),
      f = c.manifest.fragments[0]!;
    f.capability = 'graph';
    f.graphModel = { kernel: 'linear-rate.v1', rate: 5 };
    f.operations = [
      {
        type: 'add',
        element: {
          id: 'graph',
          kind: 'graph',
          version: 1,
          label: 'Requests',
          sourceId: `source-${f.reference.unitId}`,
          editable: false,
          xUnit: 'seconds',
          yUnit: 'requests',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 10 },
          ],
        },
      },
    ];
    c.capabilities.push('graph');
    expect(compileTeachingExperience(decide(c), c).beats.length).toBe(1);
    const op = f.operations[0]!;
    if (op.type === 'add' && op.element.kind === 'graph') op.element.points[1]!.y = 11;
    expect(() => compileTeachingExperience(decide(c), c)).toThrow('GRAPH_KERNEL_MISMATCH');
  });
  it('rejects unsupported simulation parameters and executable kernels', () => {
    expect(() =>
      runTrustedExperiment({
        kernel: 'resource-capacity.v1',
        totalGB: 4,
        reservedGB: 5,
        perVMGB: 1,
      }),
    ).toThrow();
    expect(() =>
      runTrustedExperiment({
        kernel: 'resource-capacity.v1',
        totalGB: 4,
        reservedGB: 0,
        perVMGB: 0,
      }),
    ).toThrow();
    expect(() => runTrustedExperiment({ kernel: 'javascript', code: 'process.exit()' })).toThrow();
  });
});
describe('M5 provider boundary', () => {
  it('requires explicit provider authorization before dispatch', async () => {
    const gateway = { execute: vi.fn() };
    await expect(
      proposeTeachingWithGateway(
        gateway,
        contractContext(),
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(gateway.execute).not.toHaveBeenCalled();
  });
  it('bounded controlled responses cannot impersonate genuine inference or change policy', async () => {
    const c = contractContext();
    c.budget.providerAuthorized = true;
    const authorizeAttempt = vi.fn(async () => {}),
      request = {
        context: {
          functionKey: 'teaching.next_action.select',
          institutionId: c.institutionId,
          studentId: c.studentId,
          inputModality: 'text' as const,
          estimatedTokens: 100,
          currentCostMicros: 0,
          previousFailures: 0,
        },
        budgetReservation: { commandId: randomUUID(), fence: 1 },
        databaseScope: async <T>(work: () => Promise<T>) => work(),
        authorizeAttempt,
      };
    const execute = vi.fn(async () => ({
      content: {
        strategy: 'conceptual_contrast',
        fragmentId: 'relation',
        reason: 'Reviewed criterion evidence.',
      },
      inputTokens: 12,
      outputTokens: 10,
      estimatedCostMicros: 0,
      providerRequestId: null,
    }));
    const result = await proposeTeachingWithGateway(
      { execute } as never,
      c,
      { mode: 'controlled', request },
      new AbortController().signal,
    );
    expect(result.decision.origin).toBe('controlled_provider');
    expect(result.provider.requestId).toBeNull();
    expect(execute.mock.calls.length).toBe(1);
    expect(authorizeAttempt).toHaveBeenCalledTimes(2);
    await expect(
      proposeTeachingWithGateway(
        { execute } as never,
        c,
        { mode: 'authorized_live', request },
        new AbortController().signal,
      ),
    ).rejects.toThrow('GENUINE_PROVIDER_RECEIPT');
  });
  it('provider timeout or malformed output cannot publish an instruction', async () => {
    const c = contractContext();
    c.budget.providerAuthorized = true;
    const request = {
      context: {
        functionKey: 'teaching.next_action.select',
        institutionId: c.institutionId,
        studentId: c.studentId,
        inputModality: 'text' as const,
        estimatedTokens: 100,
        currentCostMicros: 0,
        previousFailures: 0,
      },
      budgetReservation: { commandId: randomUUID(), fence: 1 },
      databaseScope: async <T>(work: () => Promise<T>) => work(),
      authorizeAttempt: async () => {},
    };
    await expect(
      proposeTeachingWithGateway(
        {
          execute: async () => {
            throw new Error('Provider timeout');
          },
        } as never,
        c,
        { mode: 'controlled', request },
        new AbortController().signal,
      ),
    ).rejects.toThrow('timeout');
    await expect(
      proposeTeachingWithGateway(
        { execute: async () => ({ content: { grade: 100, approveTask: true } }) } as never,
        c,
        { mode: 'controlled', request },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});
describe('M5 categorical ledger replay', () => {
  const event = (
    id: string,
    criterionId: string,
    role: BeliefEvent['role'],
    family: string,
  ): BeliefEvent => ({
    id,
    corrects: null,
    criterionId,
    status: 'satisfied',
    eligible: true,
    family,
    role,
    category: 'conceptual',
    distinguishes: true,
    occurredAt: '2026-10-19T00:00:00.000Z',
    evaluationValid: true,
    assisted: false,
    repeated: false,
    retentionCheck: false,
  });
  it('does not inflate mastery from an assisted answer, equivalent family, prediction or missing explanation', () => {
    const a = event('a', 'c', 'concept', 'one');
    expect(reduceConceptBelief([a], ['c'], '2026-10-19T00:00:01Z', 'g').state).toBe('developing');
    expect(
      reduceConceptBelief([a], ['c'], '2026-10-19T00:00:01Z', 'g').criteria[0]?.demonstrated,
    ).toBe(false);
    expect(
      reduceConceptBelief([{ ...a, assisted: true }], ['c'], '2026-10-19T00:00:01Z', 'g').state,
    ).toBe('developing');
    const b = { ...a, id: 'b', role: 'explanation' as const },
      d = { ...a, id: 'd', role: 'application' as const };
    expect(reduceConceptBelief([a, b, d], ['c'], '2026-10-19T00:00:01Z', 'g').state).toBe(
      'developing',
    );
    expect(
      reduceConceptBelief(
        [a, { ...b, family: 'two', repeated: true }, d],
        ['c'],
        '2026-10-19T00:00:01Z',
        'g',
      ).state,
    ).toBe('developing');
    expect(
      reduceConceptBelief([a, { ...d, family: 'two' }], ['c'], '2026-10-19T00:00:01Z', 'g').state,
    ).toBe('developing');
    // A prediction/observation that was not admitted as criterion evidence cannot establish learning.
    expect(
      reduceConceptBelief(
        [
          { ...a, eligible: false },
          { ...b, family: 'two', eligible: false },
          { ...d, family: 'three', eligible: false },
        ],
        ['c'],
        '2026-10-19T00:00:01Z',
        'g',
      ).state,
    ).toBe('developing');
    expect(reduceConceptBelief([], ['c'], '2026-10-19T00:00:01Z', 'g').state).toBe('not_assessed');
    const negatives = [
      { ...a, status: 'not_satisfied', eligible: false },
      { ...a, id: 'n2', family: 'two', status: 'not_satisfied', eligible: false },
    ];
    expect(
      reduceConceptBelief(negatives, ['c'], '2026-10-19T00:00:01Z', 'g').hypotheses[0]?.state,
    ).toBe('candidate');
    expect(
      reduceConceptBelief(
        negatives.map((e) => ({ ...e, eligible: true })),
        ['c'],
        '2026-10-19T00:00:01Z',
        'g',
      ).hypotheses[0]?.state,
    ).toBe('supported');
  });
  it('rejects cyclic, missing or future evidence lineage rather than rebuilding a false belief', () => {
    const a = event('a', 'c', 'concept', 'one');
    expect(() =>
      reduceConceptBelief([{ ...a, corrects: 'a' }], ['c'], '2026-10-19T00:00:01Z', 'g'),
    ).toThrow();
    expect(() =>
      reduceConceptBelief([{ ...a, corrects: 'missing' }], ['c'], '2026-10-19T00:00:01Z', 'g'),
    ).toThrow();
    expect(() => reduceConceptBelief([a], ['c'], '2026-10-18T00:00:00Z', 'g')).toThrow();
  });
  it('replays deterministically and folds corrections, revocation and actual later checks', () => {
    const a = event('a', 'c', 'explanation', 'one'),
      b = event('b', 'd', 'application', 'two');
    const cross = [a, b, { ...a, id: 'c', family: 'two' }, { ...b, id: 'd', family: 'one' }];
    const one = reduceConceptBelief(cross, ['c', 'd'], '2026-10-19T00:00:01Z', 'g');
    expect(one.state).toBe('demonstrated_in_session');
    expect(
      reduceConceptBelief([...cross].reverse(), ['c', 'd'], '2026-10-19T00:00:01Z', 'g').hash,
    ).toBe(one.hash);
    expect(reduceConceptBelief(cross, ['c', 'd'], '2026-10-27T00:00:00Z', 'g').state).toBe(
      'review_due',
    );
    const correction = {
      ...a,
      id: 'correction',
      corrects: 'a',
      eligible: false,
      evaluationValid: false,
    };
    expect(
      reduceConceptBelief([a, b, correction], ['c', 'd'], '2026-10-19T00:00:01Z', 'g').state,
    ).toBe('developing');
    expect(
      reduceConceptBelief(
        [
          { ...a, evaluationValid: false },
          { ...b, evaluationValid: false },
        ],
        ['c', 'd'],
        '2026-10-19T00:00:01Z',
        'g',
      ).state,
    ).toBe('not_assessed');
  });
});
