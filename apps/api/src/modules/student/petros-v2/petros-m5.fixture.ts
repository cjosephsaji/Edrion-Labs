/** Engineering authored CC0 sources + synthetic review records. Never imported by production modules. */
import { randomUUID } from 'node:crypto';
import {
  teachingManifestSchema,
  type CanvasElement,
  type TeachingFragment,
  type TeachingManifest,
  type M3Proposal,
  observeResourceAllocation,
} from '@edrion/schemas';
import { m4Hash, m4InstrumentSchema, type M4Instrument } from './petros-v2-contracts.server';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';

export function buildTeachingInstruments(
  base: M4Instrument,
  p: M3Proposal,
  domain: 'cloud' | 'argument',
  withVerification = false,
  withRetries = false,
) {
  const ids = [randomUUID(), randomUUID(), randomUUID()],
    conceptId = p.concepts[0]!.id;
  const support = p.claims[0]!.support[0]!,
    mathSupport = p.claims[1]!.support[0]!;
  function node(id: string, text: string, x: number, y: number, source = support): CanvasElement {
    return {
      id,
      kind: 'node',
      text,
      label: text,
      sourceId: `source-${source.reference.unitId}`,
      editable: true,
      version: 1,
      x,
      y,
    };
  }
  const fragment = (
    v: Partial<TeachingFragment> &
      Pick<TeachingFragment, 'id' | 'capability' | 'strategies' | 'operations'>,
  ): TeachingFragment => ({
    reference: support.reference,
    quote: support.quote,
    explanation: 'Compare the source-backed representation, then revise your own work.',
    accessibleAlternative:
      'Use the labelled elements and relationship controls below. The structured element list contains the same information.',
    criterionIds: ids,
    relationships: [],
    equationSteps: [],
    simulation: null,
    checkpoint: null,
    expectedObservation:
      'A committed revision can distinguish the supported criterion from an unsupported response.',
    limitations: [
      'Synthetic reviewed engineering material. No independent academic validation or live semantic inference.',
    ],
    ...v,
  });
  const relationship = fragment({
    id: 'relationship-contrast',
    capability: 'diagram',
    strategies: ['conceptual_contrast', 'orientation', 'vocabulary_repair'],
    criterionIds: [ids[0]!],
    explanation:
      'Compare IaaS with PaaS. Connect the guest operating system to the party responsible in IaaS. The provider still manages physical infrastructure.',
    operations: [
      {
        type: 'add',
        element: {
          id: 'source-passage',
          kind: 'text',
          label: 'Source responsibility boundary',
          version: 1,
          editable: false,
          sourceId: `source-${support.reference.unitId}`,
          text: support.quote,
        },
      },
      { type: 'add', element: node('consumer', 'Consumer · IaaS', 150, 90) },
      {
        type: 'add',
        element: node('provider', 'Provider · physical infrastructure', 440, 90),
      },
      { type: 'add', element: node('guest-os', 'Guest operating system', 290, 230) },
      { type: 'highlight', ids: ['consumer', 'guest-os'] },
    ],
    checkpoint: {
      id: 'relationship-correction',
      prompt:
        'Connect the IaaS operating system to the responsible party, then explain your choice.',
      editableIds: ['consumer', 'provider', 'guest-os'],
      allowedOperations: ['connect_elements', 'disconnect', 'move_element', 'annotate'],
      submitted: false,
    },
  });
  const equation = fragment({
    id: 'capacity-method',
    capability: 'equation',
    strategies: ['method_repair', 'worked_example'],
    criterionIds: [ids[1]!, ids[2]!],
    reference: mathSupport.reference,
    quote: mathSupport.quote,
    focusByCriterion: [
      { criterionId: ids[1]!, elementIds: ['available'] },
      { criterionId: ids[2]!, elementIds: ['capacity'] },
    ],
    workBindings: [
      { elementId: 'available', field: 'available' },
      { elementId: 'capacity', field: 'capacity' },
    ],
    explanation:
      'First subtract the reserved memory. Then divide the available memory by the amount each VM needs. Compare the worked example with your saved answer and revise your calculation.',
    operations: [
      {
        type: 'add',
        element: {
          id: 'available',
          kind: 'equation',
          label: 'Available memory',
          version: 1,
          editable: true,
          sourceId: `source-${mathSupport.reference.unitId}`,
          tex: '64 - 16 = 48 GB',
          explanation: 'Set aside the reserved memory to find how many GB are available for VMs.',
          value: '48',
        },
      },
      {
        type: 'add',
        element: {
          id: 'capacity',
          kind: 'equation',
          label: 'Whole VM capacity',
          version: 1,
          editable: true,
          sourceId: `source-${mathSupport.reference.unitId}`,
          tex: '48 / 8 = 6 VM',
          explanation:
            'Each VM needs 8 GB. Divide the available memory into equal groups and count only whole VMs.',
          value: 'Complete this step',
        },
      },
      {
        type: 'add',
        element: {
          id: 'memory-lab',
          kind: 'allocation',
          label: 'VM memory laboratory',
          version: 1,
          editable: true,
          sourceId: `source-${mathSupport.reference.unitId}`,
          resource: {
            model: { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
            allocatedCount: 0,
            prediction: null,
            observations: [
              {
                beforeCount: 0,
                requestedCount: 0,
                prediction: null,
                ...observeResourceAllocation(
                  { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
                  0,
                  0,
                ),
              },
            ],
          },
        },
      },
      { type: 'change_allocation', id: 'memory-lab', expectedVersion: 1, requestedCount: 1 },
      { type: 'highlight', ids: ['memory-lab', 'capacity'] },
    ],
    equationSteps: [
      {
        id: 'subtract',
        rule: 'subtract',
        inputs: [
          { value: 64, unit: 'GB' },
          { value: 16, unit: 'GB' },
        ],
        result: { value: 48, unit: 'GB' },
        assumptions: ['Memory-only uniform capacity model.'],
        corrects: null,
        elementId: 'available',
      },
      {
        id: 'divide',
        rule: 'divide',
        inputs: [
          { value: 48, unit: 'GB' },
          { value: 8, unit: 'GB/VM' },
        ],
        result: { value: 6, unit: 'VM' },
        assumptions: ['Each VM reserves 8 GB; divisor is positive.'],
        corrects: null,
        elementId: 'capacity',
      },
    ],
    checkpoint: {
      id: 'capacity-correction',
      prompt: 'Correct the whole-VM capacity step. Explain what each unit means.',
      editableIds: ['available', 'capacity', 'memory-lab'],
      allowedOperations: [
        'replace_content',
        'annotate',
        'predict_allocation',
        'change_allocation',
        'close_allocation_attempt',
      ],
      submitted: false,
    },
  });
  const argument = fragment({
    id: 'argument-inspection',
    capability: 'diagram',
    strategies: [
      'clarifying_question',
      'warrant_inspection',
      'assumption_comparison',
      'orientation',
    ],
    additionalSources: [mathSupport],
    explanation:
      'The passage offers a claim and a survey. Connect evidence to the claim and annotate the warrant or an alternative interpretation. A teacher must judge the interpretation.',
    operations: [
      { type: 'add', element: node('claim', 'Claim · inspect the quoted source', 155, 75) },
      {
        type: 'add',
        element: node('evidence', 'Evidence · survey passage', 440, 75, mathSupport),
      },
      {
        type: 'add',
        element: node('warrant', 'Warrant or alternative explanation', 290, 230),
      },
      {
        type: 'add',
        element: {
          id: 'passage',
          kind: 'text',
          label: 'Exact source passage',
          version: 1,
          editable: false,
          sourceId: `source-${support.reference.unitId}`,
          text: support.quote,
        },
      },
      {
        type: 'add',
        element: {
          id: 'survey-passage',
          kind: 'text',
          label: 'Exact survey passage',
          version: 1,
          editable: false,
          sourceId: `source-${mathSupport.reference.unitId}`,
          text: mathSupport.quote,
        },
      },
      { type: 'highlight', ids: ['claim', 'evidence'] },
    ],
    checkpoint: {
      id: 'argument-revision',
      prompt:
        'Connect the survey to the claim. Annotate the assumption and a defensible alternative reading.',
      editableIds: ['claim', 'evidence', 'warrant'],
      allowedOperations: [
        'connect_elements',
        'disconnect',
        'annotate',
        'replace_content',
        'move_element',
      ],
      submitted: false,
    },
  });
  const fresh = fragment({
    id: 'fresh-check',
    capability: 'source',
    strategies: ['faded_support', 'fresh_verification', 'source_explanation'],
    explanation:
      'The committed correction is recorded as assisted practice. A fresh reviewed task is needed for independent evidence. If none is available, verification remains unavailable.',
    operations: [
      {
        type: 'add',
        element: {
          id: 'fresh-observation',
          kind: 'text',
          label: 'Next observation',
          version: 1,
          editable: false,
          sourceId: `source-${support.reference.unitId}`,
          text: 'Use a fresh reviewed task to check the idea without the worked example.',
        },
      },
    ],
  });
  const experiment = fragment({
    id: 'capacity-experiment',
    capability: 'simulation',
    strategies: ['bounded_experiment'],
    reference: mathSupport.reference,
    quote: mathSupport.quote,
    simulation: { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
    operations: [
      {
        type: 'add',
        element: {
          id: 'capacity-model',
          kind: 'text',
          label: 'Memory-only experiment',
          version: 1,
          editable: false,
          sourceId: `source-${mathSupport.reference.unitId}`,
          text: 'Uniform memory model: available GB / GB per VM. Predict before running a bounded experiment.',
        },
      },
      {
        type: 'add',
        element: {
          id: 'memory-lab',
          kind: 'allocation',
          label: 'VM memory laboratory',
          version: 1,
          editable: true,
          sourceId: `source-${mathSupport.reference.unitId}`,
          resource: {
            model: { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
            allocatedCount: 0,
            prediction: null,
            observations: [
              {
                beforeCount: 0,
                requestedCount: 0,
                prediction: null,
                ...observeResourceAllocation(
                  { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
                  0,
                  0,
                ),
              },
            ],
          },
        },
      },
      { type: 'change_allocation', id: 'memory-lab', expectedVersion: 1, requestedCount: 1 },
      { type: 'highlight', ids: ['memory-lab'] },
    ],
    checkpoint: {
      id: 'capacity-exploration',
      prompt: 'Predict, allocate and explain the observed memory limit.',
      editableIds: ['memory-lab'],
      allowedOperations: [
        'predict_allocation',
        'change_allocation',
        'close_allocation_attempt',
        'annotate',
      ],
      submitted: false,
    },
  });
  const process = fragment({
    id: 'finite-trace',
    capability: 'code_trace',
    strategies: ['participation'],
    reference: mathSupport.reference,
    quote: mathSupport.quote,
    explanation:
      'Inspect this inert, finite arithmetic trace. It is displayed as text and never executed.',
    operations: [
      {
        type: 'add',
        element: {
          id: 'algorithm-trace',
          kind: 'trace',
          label: 'Memory-capacity trace',
          version: 1,
          editable: false,
          sourceId: `source-${mathSupport.reference.unitId}`,
          currentLine: 0,
          lines: [
            {
              id: 'subtract-memory',
              text: 'available := total - reserved',
              state: { total: 64, reserved: 16, available: 48 },
            },
            {
              id: 'whole-capacity',
              text: 'capacity := floor(available / per_vm)',
              state: { available: 48, per_vm: 8, capacity: 6 },
            },
          ],
        },
      },
      { type: 'trace_step', id: 'algorithm-trace', expectedVersion: 1, line: 1 },
      {
        type: 'add',
        element: {
          id: 'trace-one',
          kind: 'text',
          label: 'Trace step 1',
          version: 1,
          editable: false,
          sourceId: `source-${mathSupport.reference.unitId}`,
          text: 'available := total - reserved',
        },
      },
      {
        type: 'add',
        element: {
          id: 'trace-two',
          kind: 'text',
          label: 'Trace step 2',
          version: 1,
          editable: false,
          sourceId: `source-${mathSupport.reference.unitId}`,
          text: 'capacity := floor(available / per_vm)',
        },
      },
    ],
  });
  const graph = fragment({
    id: 'rate-graph',
    capability: 'graph',
    strategies: ['participation'],
    reference: mathSupport.reference,
    quote: mathSupport.quote,
    explanation:
      'Compare a constant request rate in a checked graph and its numeric table. This model assumes a constant rate and no losses.',
    graphModel: { kernel: 'linear-rate.v1', rate: 5 },
    operations: [
      {
        type: 'add',
        element: {
          id: 'request-graph',
          kind: 'graph',
          version: 1,
          label: 'Constant request rate',
          sourceId: `source-${mathSupport.reference.unitId}`,
          editable: false,
          xUnit: 'seconds',
          yUnit: 'requests',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 5 },
            { x: 2, y: 10 },
            { x: 3, y: 15 },
          ],
        },
      },
      {
        type: 'add',
        element: {
          id: 'request-table',
          kind: 'table',
          version: 1,
          label: 'Request-rate table',
          sourceId: `source-${mathSupport.reference.unitId}`,
          editable: false,
          columns: ['Time (seconds)', 'Requests'],
          rows: [
            ['0', '0'],
            ['1', '5'],
            ['2', '10'],
            ['3', '15'],
          ],
          editableCells: [],
        },
      },
    ],
  });
  const manifest: TeachingManifest = teachingManifestSchema.parse({
    version: 'petros.m5.reviewed.v1',
    graphVersion: 'm5-engineering-graph.v1',
    prerequisites: [],
    criteria: ids.map((id, i) => ({
      id,
      conceptId,
      conceptVersion: p.concepts[0]!.version,
      category: domain === 'argument' ? 'unsupported_link' : i === 0 ? 'conceptual' : 'arithmetic',
      role:
        domain === 'argument'
          ? i === 0
            ? 'concept'
            : i === 1
              ? 'explanation'
              : 'application'
          : i === 0
            ? 'concept'
            : i === 1
              ? 'method'
              : 'application',
      distinguishes: i === 0,
    })),
    fragments:
      domain === 'cloud'
        ? [relationship, equation, fresh, experiment, process, graph]
        : [argument, fresh],
    taskRole: 'initial',
    fragmentIds: [],
  });
  const initial = m4InstrumentSchema.parse({
    ...base,
    id: randomUUID(),
    equivalenceKey: `m5-${domain}-initial`,
    publicCanvas: null,
    teaching: manifest,
    publicTask:
      domain === 'cloud'
        ? {
            ...base.publicTask,
            prompt:
              'For IaaS, who manages the guest operating system? A memory-only host has 64 GB, reserves 16 GB, and needs 8 GB per VM. Record available memory and whole-VM capacity.',
            fields: [
              {
                id: 'responsibility',
                label: 'Guest OS responsibility in IaaS',
                kind: 'choice',
                choices: [
                  { id: 'consumer', label: 'Consumer' },
                  { id: 'provider', label: 'Provider' },
                ],
              },
              {
                id: 'available',
                label: 'Available memory (GB)',
                kind: 'number',
                choices: [],
              },
              {
                id: 'capacity',
                label: 'Whole-VM capacity (VM)',
                kind: 'number',
                choices: [],
              },
            ],
            helpPolicy: 'no_hints',
          }
        : {
            ...base.publicTask,
            responseKind: 'structured',
            fields: [
              {
                id: 'survey',
                label: 'Which observation is explicitly reported by the survey?',
                kind: 'choice',
                choices: [
                  { id: 'preference', label: '84 of 120 learners preferred later access' },
                  { id: 'all_residents', label: 'All residents support a change' },
                ],
              },
              {
                id: 'reason',
                label: 'Explain the warrant, uncertainty or alternative interpretation',
                kind: 'text',
                choices: [],
              },
            ],
          },
    criteria:
      domain === 'cloud'
        ? [
            {
              id: ids[0],
              label: 'Operating-system responsibility',
              checker: { kind: 'exact', field: 'responsibility', accepted: ['consumer'] },
            },
            {
              id: ids[1],
              label: 'Available-memory method',
              checker: {
                kind: 'numeric',
                field: 'available',
                expected: 48,
                tolerance: 0,
                unit: '',
              },
            },
            {
              id: ids[2],
              label: 'Whole-VM arithmetic',
              checker: {
                kind: 'numeric',
                field: 'capacity',
                expected: 6,
                tolerance: 0,
                unit: '',
              },
            },
          ]
        : base.criteria.map((c, i) =>
            i === 0
              ? {
                  id: ids[i],
                  label: 'Survey observation in the cited passage',
                  checker: { kind: 'exact', field: 'survey', accepted: ['preference'] },
                }
              : { ...c, id: ids[i] },
          ),
  });
  const practices = (domain === 'cloud' ? [relationship, equation] : [argument]).map((f) =>
    m4InstrumentSchema.parse({
      ...initial,
      id: randomUUID(),
      equivalenceKey: `m5-${domain}-${f.id}-practice`,
      teaching: { ...manifest, taskRole: 'practice', fragmentIds: [f.id] },
      publicTask: {
        ...base.publicTask,
        prompt: f.checkpoint!.prompt,
        passage: initial.publicTask.prompt,
        responseKind: 'canvas_snapshot',
        fields: [],
        choices: [],
        helpPolicy: 'assisted_practice',
      },
      criteria:
        domain === 'argument'
          ? base.criteria.map((c, i) => ({ ...c, id: ids[i] }))
          : [
              {
                id: f.id === 'capacity-method' ? ids[2] : ids[0],
                label:
                  f.id === 'capacity-method'
                    ? 'Corrected capacity'
                    : 'Corrected responsibility relationship',
                checker:
                  f.id === 'capacity-method'
                    ? { kind: 'canvas_value', elementId: 'capacity', expected: '6' }
                    : {
                        kind: 'canvas_relation',
                        from: 'guest-os',
                        to: 'consumer',
                        relation: 'connects',
                      },
              },
              ...(f.id === 'capacity-method'
                ? [
                    {
                      id: ids[1],
                      label: 'Corrected available-memory method',
                      checker: {
                        kind: 'canvas_value',
                        elementId: 'available',
                        expected: '48',
                      },
                    },
                  ]
                : []),
            ],
    }),
  );
  const verification = m4InstrumentSchema.parse({
    ...initial,
    id: randomUUID(),
    equivalenceKey: `m5-${domain}-transfer`,
    kind: 'transfer',
    teaching: { ...manifest, taskRole: 'verification', fragmentIds: [] },
    publicTask: {
      ...initial.publicTask,
      prompt:
        'Fresh scenario: an IaaS host has 72 GB, 8 GB reserved, and needs 4 GB per VM. Identify guest-OS responsibility, available memory and whole-VM capacity.',
    },
    criteria: [
      { ...initial.criteria[0] },
      {
        ...initial.criteria[1],
        checker: {
          kind: 'numeric',
          field: 'available',
          expected: 64,
          tolerance: 0,
          unit: '',
        },
      },
      {
        ...initial.criteria[2],
        checker: { kind: 'numeric', field: 'capacity', expected: 16, tolerance: 0, unit: '' },
      },
    ],
  });
  // A second synthetically reviewed practice instance allows an authentic error →
  // correction demonstration. Same equivalence family: never independent evidence.
  const retries = withRetries
    ? practices.map((practice) =>
        m4InstrumentSchema.parse({
          ...practice,
          id: randomUUID(),
          teaching: {
            ...practice.teaching!,
            fragments: practice.teaching!.fragments.filter(
              (fragment) =>
                practice.teaching!.fragmentIds.includes(fragment.id) ||
                fragment.id === 'fresh-check',
            ),
          },
        }),
      )
    : [];
  return [
    initial,
    ...practices,
    ...retries,
    ...(withVerification && domain === 'cloud' ? [verification] : []),
  ];
}
export async function startM5Fixture(options: { practiceRetries?: boolean } = {}) {
  const f = await startM4Fixture();
  async function lesson(domain: 'cloud' | 'argument') {
    return f.lesson(domain, false, 'no_hints', {
      sourceName: domain === 'cloud' ? 'm5-cloud-capacity.txt' : 'argument.pdf',
      proposal: (p) => ({
        ...p,
        objectives: p.objectives.map((o, i) =>
          i === 0 && domain === 'cloud'
            ? {
                ...o,
                wording:
                  'Distinguish service responsibility and apply the bounded memory-capacity method.',
                support: p.claims.flatMap((c) => c.support),
              }
            : o,
        ),
      }),
      instruments: (base, p) =>
        buildTeachingInstruments(base, p, domain, false, options.practiceRetries),
    });
  }
  return { ...f, m5Lesson: lesson };
}
export type M5Fixture = Awaited<ReturnType<typeof startM5Fixture>>;
export const submitM5 = async (
  f: M4Fixture,
  s: Awaited<ReturnType<M4Fixture['start']>>,
  response: unknown,
  p = f.student,
) => {
  await f.sessions.commit(p, s.id, s.task!.taskId, {
    commandId: randomUUID(),
    expectedRevision: s.revision,
    epoch: s.epoch,
    taskInstanceHash: s.task!.instanceHash,
    canvasRevision: s.canvas?.revision ?? 0,
    response,
  });
  await f.worker.process({ sessionId: s.id, requestedBy: p.institutionUserId });
  return f.sessions.get(p, s.id);
};
export const m5FixtureHash = m4Hash;
