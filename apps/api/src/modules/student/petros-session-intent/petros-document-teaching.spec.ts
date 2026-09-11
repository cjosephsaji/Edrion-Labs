import { describe, expect, it } from 'vitest';
import {
  bindDocumentTeachingGeneration,
  documentTeachingGenerationSchema,
  fallbackDocumentTeachingPlan,
  publicDocumentTeachingPlan,
  recoverInstructionalPhaseLabels,
  validateDocumentTeachingGeneration,
  validateSubjectVisualCoverage,
} from './petros-document-teaching';

const input = () => ({
  documentId: '22222222-2222-4222-8222-222222222222',
  documentVersion: 1,
  sourceFingerprint: 'b'.repeat(64),
  topicId: 'concept-1',
  title: 'Area accumulation',
  summary: 'A definite integral accumulates signed area over an interval.',
  prerequisites: ['functions'],
  pages: [{ page: 1, text: 'A definite integral can represent signed accumulation.' }],
});

describe('document teaching generation', () => {
  it('publishes a complete teaching arc without leaking classification keys', () => {
    const generated = fallbackDocumentTeachingPlan(input());
    const publicPlan = publicDocumentTeachingPlan(generated);
    expect(new Set(publicPlan.scenes.map((scene) => scene.phase))).toEqual(new Set([
      'concrete_opening', 'visual_explanation', 'guided_application', 'independent_check', 'feedback_transfer',
    ]));
    expect(JSON.stringify(publicPlan)).not.toContain('correctChoiceId');
    expect(JSON.stringify(publicPlan)).not.toContain('rubric');
  });

  it('builds the integrals reference as explain, explore, complete, and fresh expression work', () => {
    const generated = fallbackDocumentTeachingPlan(input());
    const publicPlan = publicDocumentTeachingPlan(generated);
    expect(publicPlan.schemaVersion).toBe('petros.document-teaching.v4');
    expect(publicPlan.scenes.map((scene) => scene.purpose)).toEqual([
      'teaching', 'exploration', 'guided_practice', 'independent_check', 'connection_review',
    ]);
    expect(publicPlan.scenes[1]?.activitySpec).toMatchObject({
      kind: 'coordinate_graph',
      verticalShift: { label: 'C', unchangedFunctionIndex: 1 },
    });
    expect(publicPlan.scenes[2]?.response).toEqual({ kind: 'missing_step', lineId: 'answer' });
    expect(publicPlan.scenes[3]?.response).toEqual({ kind: 'expression', variables: ['x'] });
    expect(publicPlan.scenes[2]?.example).toBe('Ask Petros to reveal a worked example.');
    expect(JSON.stringify(publicPlan)).not.toContain('2*x^4+x^2');
   });
  it('creates a source-referenced plan for a non-inflation topic', () => {
    const generated = fallbackDocumentTeachingPlan({
      documentId: '22222222-2222-4222-8222-222222222222',
      documentVersion: 1,
      sourceFingerprint: 'b'.repeat(64),
      topicId: 'concept-2',
      title: 'The water cycle',
      summary: 'How water moves through Earth systems.',
      prerequisites: ['states of matter'],
      pages: [
        { page: 7, text: 'Evaporation moves water into the atmosphere.' },
        { page: 8, text: 'Condensation forms clouds.' },
      ],
    });
    const parsed = documentTeachingGenerationSchema.parse(generated);
    const publicPlan = publicDocumentTeachingPlan(parsed);
    expect(publicPlan.experience).toBe('document-teaching-v1');
    expect(
      publicPlan.scenes.every((scene) => scene.sourceRefs.length > 0),
    ).toBe(true);
    expect(JSON.stringify(publicPlan)).not.toContain('rubric');
    expect(JSON.stringify(publicPlan)).not.toContain('correctChoiceId');
  });

  it('rejects malformed or ungrounded generated output', () => {
    expect(() =>
      documentTeachingGenerationSchema.parse({
        schemaVersion: 'petros.document-teaching.v1',
        experience: 'document-teaching-v1',
        scenes: [],
      }),
    ).toThrow();
  });

  it('binds source identity and coverage from the authorized request', () => {
    const generated = fallbackDocumentTeachingPlan({
      documentId: '22222222-2222-4222-8222-222222222222',
      documentVersion: 1,
      sourceFingerprint: 'b'.repeat(64),
      topicId: 'wrong-topic',
      title: 'The water cycle',
      summary: 'How water moves through Earth systems.',
      prerequisites: [],
      pages: [{ page: 99, text: 'Evaporation moves water.' }],
    });
    generated.scenes.forEach((scene) => {
      scene.sourceRefs = [{ page: 7 }];
    });
    generated.coverage.relevantPages = [7];
    generated.coverage.objectives.forEach((objective) => {
      objective.pages = [7];
    });
    const bound = bindDocumentTeachingGeneration(generated, {
      documentId: '33333333-3333-4333-8333-333333333333',
      documentVersion: 4,
      sourceFingerprint: 'c'.repeat(64),
      topicId: 'concept-7',
      sourceComplete: true,
      sourcePages: [{ page: 7 }, { page: 8 }],
    });
    expect(bound).toMatchObject({
      documentId: '33333333-3333-4333-8333-333333333333',
      documentVersion: 4,
      sourceFingerprint: 'c'.repeat(64),
      topicId: 'concept-7',
      sourcePageCount: 2,
      coveredPages: [7],
    });
    expect(bound.coverage.suppliedPages).toEqual([7, 8]);
  });

  it('rejects an unanswerable choice or a source page outside the selected topic', () => {
    const generated = fallbackDocumentTeachingPlan({
      documentId: '22222222-2222-4222-8222-222222222222',
      documentVersion: 1,
      sourceFingerprint: 'c'.repeat(64),
      topicId: 'concept-1',
      title: 'Plate tectonics',
      summary: 'How moving plates shape Earth.',
      prerequisites: [],
      pages: [{ page: 4, text: 'Plates move.' }],
    });
    generated.scenes[0]!.purpose = 'guided_practice';
    generated.scenes[0]!.responseType = 'choice';
    generated.scenes[0]!.response = { kind: 'choice' };
    generated.scenes[0]!.choices = [];
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 4 }])).toThrow(/answerable/);
    generated.scenes[0]!.purpose = 'teaching';
    generated.scenes[0]!.responseType = 'explanation';
    generated.scenes[0]!.response = { kind: 'none' };
    generated.scenes[0]!.sourceRefs = [{ page: 99 }];
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 4 }])).toThrow(/outside the selected source/);
  });

  it('rejects diagram edges without real targets', () => {
    const generated = fallbackDocumentTeachingPlan({
      documentId: '22222222-2222-4222-8222-222222222222', documentVersion: 1,
      sourceFingerprint: 'd'.repeat(64), topicId: 'concept-1', title: 'Cell division',
      summary: 'Cells copy and divide in ordered stages.', prerequisites: [],
      pages: [{ page: 2, text: 'Chromosomes separate before the cell divides.' }],
    });
    generated.scenes[0]!.activity = 'concept_map';
    generated.scenes[0]!.activitySpec = {
      kind: 'concept_map', layout: 'flow', annotations: [],
      nodes: [{ id: 'copy', label: 'Copy chromosomes' }, { id: 'divide', label: 'Divide cell' }],
      edges: [{ from: 'copy', to: 'missing', label: 'then' }],
    };
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 2 }])).toThrow(/visual target/);
  });

  it('rejects numeric activities that become undefined within their slider range', () => {
    const generated = fallbackDocumentTeachingPlan({
      documentId: '22222222-2222-4222-8222-222222222222', documentVersion: 1,
      sourceFingerprint: 'e'.repeat(64), topicId: 'concept-1', title: 'Ratios',
      summary: 'A ratio compares two quantities.', prerequisites: [],
      pages: [{ page: 3, text: 'Divide one quantity by another to form a ratio.' }],
    });
    generated.scenes[0]!.activity = 'numeric_exploration';
    generated.scenes[0]!.activitySpec = {
      kind: 'numeric_exploration',
      variable: { label: 'Divisor', unit: 'items', min: 0, max: 2, step: 1, initial: 1 },
      outputs: [{ label: 'Ratio', unit: 'to one', initial: 10, steps: [{ operation: 'divide', operand: { source: 'input' } }] }],
    };
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 3 }])).toThrow(/undefined/);
  });

  it('rejects a graph whose declared range would silently clip the function', () => {
    const generated = fallbackDocumentTeachingPlan(input());
    const graphScene = generated.scenes.find((scene) => scene.activitySpec.kind === 'coordinate_graph')!;
    if (graphScene.activitySpec.kind !== 'coordinate_graph') throw new Error('Expected graph fixture');
    graphScene.activitySpec.yAxis.max = 2;
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 1 }])).toThrow(/clip/);
  });

  it('recovers a mislabeled authored transfer scene without inventing content', () => {
    const generated = fallbackDocumentTeachingPlan(input());
    generated.scenes.at(-1)!.phase = 'independent_check';
    recoverInstructionalPhaseLabels(generated);
    expect(generated.scenes.at(-1)!.phase).toBe('feedback_transfer');
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 1 }])).not.toThrow();
  });

  it('does not relabel a duplicate phase when no transfer content exists', () => {
    const generated = fallbackDocumentTeachingPlan(input());
    const last = generated.scenes.at(-1)!;
    last.phase = 'independent_check';
    last.title = 'Independent check two';
    last.introduction = 'Solve this question independently.';
    last.explanation = 'Use the same method.';
    last.question = 'What is the answer?';
    last.rubric = 'The response must provide the correct result and enough working to justify it.';
    recoverInstructionalPhaseLabels(generated);
    expect(last.phase).toBe('independent_check');
    expect(() => validateDocumentTeachingGeneration(generated, [{ page: 1 }])).toThrow(/feedback_transfer/);
  });

  it.each([
    ['mathematics', 'coordinate_graph'], ['physics', 'process_diagram'],
    ['chemistry', 'equation_steps'], ['biology', 'concept_map'],
    ['economics', 'comparison'], ['computing', 'code_trace'],
    ['humanities', 'timeline_evidence'], ['language', 'annotated_text'],
  ] as const)('accepts a meaningful %s teaching family', (subject, activity) => {
    expect(() => validateSubjectVisualCoverage(subject, [activity])).not.toThrow();
    expect(() => validateSubjectVisualCoverage(subject, ['scenario'])).toThrow(/subject-appropriate/);
  });
});
