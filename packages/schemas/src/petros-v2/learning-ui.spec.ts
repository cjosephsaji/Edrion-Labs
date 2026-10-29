import { describe, expect, it } from 'vitest';
import { initialSharedCanvas } from './canvas-reducer';
import type { M4Snapshot } from './student-session';
import {
  canvasLearningBlocks,
  composeLearningUI,
  learningUIFor,
} from './learning-ui-composer';
import { learningUIPlanSchema } from './learning-ui';

const id = '10000000-0000-4000-8000-000000000001';
function snapshot(capability?: string): M4Snapshot {
  return {
    id,
    engine: 'v2',
    revision: 2,
    epoch: 1,
    status: 'active',
    stage: 'delivering',
    lesson: null,
    task: null,
    draft: '',
    canvas: { ...initialSharedCanvas('work'), mode: 'session' },
    checkpointId: null,
    submission: null,
    evaluation: null,
    actions: [],
    assistance: 'independent',
    progress: {
      contentViewed: false,
      responsesCommitted: 0,
      responsesEvaluated: 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: '',
    teaching: capability
      ? ({
          capability,
          caption: 'Exact authorized instruction.',
          status: 'presenting',
          decision: {
            strategy: 'orientation',
            reason: 'INTERNAL_DIAGNOSTIC_DO_NOT_DISPLAY',
          },
        } as unknown as NonNullable<M4Snapshot['teaching']>)
      : null,
  };
}
const text = {
  id: 'passage',
  kind: 'text' as const,
  version: 1,
  label: 'Quoted material',
  sourceId: 'source',
  editable: false,
  text: 'Exact words, including <script>literal source</script>.',
};
describe('Edrion Labs structured learning UI composer', () => {
  it.each([
    ['source', 'reading'],
    ['equation', 'equation'],
    ['diagram', 'relationships'],
    ['table', 'comparison'],
    ['graph', 'graph'],
    ['code_trace', 'process'],
    ['process', 'process'],
    ['simulation', 'experiment'],
  ])(
    'selects %s from the declared learning capability before any beat is revealed',
    (capability, family) => {
      const s = snapshot(capability),
        p = composeLearningUI(s);
      expect(p.family).toBe(family);
      expect(p.blocks).toEqual([]);
      expect(JSON.stringify(p)).not.toContain('INTERNAL_DIAGNOSTIC');
      expect(p.binding).toEqual({
        sessionId: id,
        revision: 2,
        epoch: 1,
        canvasRevision: 0,
      });
    },
  );
  it('groups every visible element once and keeps exact content outside the plan', () => {
    const node = {
      id: 'idea',
      kind: 'node',
      version: 1,
      label: 'Idea',
      text: 'Renamed idea',
      x: 120,
      y: 80,
      editable: true,
      sourceId: 'source',
    } as const;
    const blocks = canvasLearningBlocks([
      text,
      node,
      { ...node, id: 'other' },
      {
        id: 'link',
        kind: 'edge',
        version: 1,
        label: 'Link',
        from: 'idea',
        to: 'other',
        relation: 'supports',
        text: 'supports',
        sourceId: 'source',
        editable: true,
      },
    ]);
    expect(blocks[0]).toMatchObject({
      kind: 'relationships',
      elementIds: ['idea', 'other', 'link'],
    });
    expect(blocks[1]).toMatchObject({ kind: 'passage', emphasis: 'supporting' });
    expect(new Set(blocks.flatMap((b) => b.elementIds)).size).toBe(4);
    expect(text.text).toContain('<script>literal source</script>');
  });
  it('uses content structure when historical snapshots have no capability or plan', () => {
    const s = snapshot();
    s.task = {} as NonNullable<M4Snapshot['task']>;
    s.submission = { status: 'complete' } as NonNullable<M4Snapshot['submission']>;
    s.canvas!.elements = [
      {
        id: 'table',
        kind: 'table',
        label: 'Cases',
        version: 1,
        sourceId: 'source',
        editable: false,
        columns: ['Case', 'Property'],
        rows: [['A', 'One']],
        editableCells: [],
      },
    ];
    expect(composeLearningUI(s).family).toBe('comparison');
  });
  it('does not select a diagram from topic names or prose keywords', () => {
    const s = snapshot('source');
    s.canvas!.elements = [text];
    const p = composeLearningUI(s);
    s.lesson = {
      title: 'Graph equation process experiment',
      subject: 'Renamed subject',
    } as NonNullable<M4Snapshot['lesson']>;
    expect(composeLearningUI(s)).toEqual(p);
    expect(p.family).toBe('reading');
  });
  it('keeps an independent question in practice mode without inventing teaching or an experiment', () => {
    const s = snapshot();
    s.task = {} as NonNullable<M4Snapshot['task']>;
    s.canvas!.elements = [text];
    const p = composeLearningUI(s);
    expect(p.family).toBe('practice');
    expect(p.blocks.some((b) => b.kind === 'experiment')).toBe(false);
    expect(JSON.stringify(p)).not.toContain('checked answer');
  });
  it('rebuilds a plan after epoch or canvas changes and rejects omitted or misclassified elements', () => {
    const s = snapshot('source');
    s.canvas!.elements = [text];
    s.learningUI = composeLearningUI(s);
    s.epoch++;
    expect(learningUIFor(s).binding.epoch).toBe(s.epoch);
    s.learningUI = composeLearningUI(s);
    s.learningUI.blocks = [];
    expect(learningUIFor(s).blocks[0]?.elementIds).toEqual(['passage']);
    s.learningUI = composeLearningUI(s);
    s.learningUI.blocks[0]!.kind = 'process';
    expect(learningUIFor(s).blocks[0]?.kind).toBe('passage');
  });
  it('never includes unrevealed elements or model output', () => {
    const s = snapshot('simulation');
    s.teaching!.simulation = { kernel: 'linear-rate.v1', rate: 5, seconds: 3 };
    const p = composeLearningUI(s);
    expect(p.blocks).toEqual([]);
    expect(JSON.stringify(p)).not.toContain('15');
    s.teaching!.status = 'complete';
    expect(composeLearningUI(s).blocks).toEqual([
      {
        id: 'checked-experiment',
        kind: 'experiment',
        elementIds: [],
        emphasis: 'primary',
      },
    ]);
  });
  it('rejects executable components, unknown attributes and duplicate element plans', () => {
    const p = composeLearningUI(snapshot('source'));
    expect(learningUIPlanSchema.safeParse({ ...p, html: '<script/>' }).success).toBe(
      false,
    );
    expect(
      learningUIPlanSchema.safeParse({
        ...p,
        blocks: [{ id: 'x', kind: 'script', elementIds: [], emphasis: 'primary' }],
      }).success,
    ).toBe(false);
    expect(
      learningUIPlanSchema.safeParse({
        ...p,
        blocks: [
          { id: 'x', kind: 'passage', elementIds: ['passage'], emphasis: 'primary' },
          { id: 'y', kind: 'passage', elementIds: ['passage'], emphasis: 'primary' },
        ],
      }).success,
    ).toBe(false);
  });
  it('does not produce content blocks for a blocked snapshot', () => {
    const s = snapshot('source');
    s.status = 'blocked';
    s.canvas!.elements = [text];
    expect(composeLearningUI(s).blocks).toEqual([]);
  });
});
