import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisualEngine } from '../components/visual-engine';
import { makeTopicLesson, validTopicLesson, validOutline } from '../teaching/topic-content';
import { initialState, selectLesson, practice, interrupt, resume } from '../teaching/controller';
import {
  beginConceptTest,
  continueAssessment,
  continueCheckpoint,
  currentQuestion,
  goToCheckpoint,
  skipDiagnostic,
  startFinalAssessment,
  startLearning,
  teachAction,
} from '../teaching/checkpoint';
import { assistance, progressSummary } from '../teaching/learning-evidence';
import {
  runtime,
  transitionVisual,
  validVisualSpec,
  valueOf,
  type VisualSpec,
} from '../teaching/visual-spec';
import { visualScene } from '../teaching/visual-scene';
import {
  forceVisual,
  logicVisual,
  marketVisual,
  modelState,
  plateVisual,
  quadraticVisual,
  visualBase,
} from '../teaching/visual-examples';
import { restoreSession, serializeSession } from '../teaching/persistence';
import { tectonics } from '../lessons/tectonics';
import { subjectCases, subjectOutline } from './fixtures/visual-topics';
import { generateTopic } from '../teaching/topic-provider';
const start = (index = 0) =>
  goToCheckpoint(selectLesson(initialState, tectonics, null), tectonics, index);
const submit = (s: ReturnType<typeof start>, correct = true) => {
  const q = currentQuestion(s, tectonics);
  return practice(
    {
      ...s,
      studentResponse: correct ? q.correct[0]! : q.options.find((x) => !q.correct.includes(x))!,
    },
    q,
  );
};
describe('safe visual contract and renderer selection', () => {
  const specs = [
    plateVisual('layers'),
    quadraticVisual(),
    forceVisual(),
    marketVisual(),
    logicVisual(),
  ];
  it.each(specs)('validates and renders actual geometry for $type', (spec) => {
    expect(validVisualSpec(spec)).toBe(true);
    const s = start();
    s.visualState = {
      kind: 'topic',
      heading: 'Model',
      labels: ['One', 'Two', 'Three'],
      caption: 'Schematic',
      visual: spec,
      runtime: runtime(spec.initial),
    };
    const html = renderToStaticMarkup(createElement(VisualEngine, { state: s, patch: () => {} }));
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain(`data-visual-type="${spec.type}"`);
    expect(html).not.toContain('topicConceptFlow');
    expect(html).not.toContain('<script');
  });
  it.each([
    (s: any) => {
      s.type = 'arbitrary-js';
    },
    (s: any) => {
      s.code = 'alert(1)';
    },
    (s: any) => {
      s.initial.values[0].value = Infinity;
    },
    (s: any) => {
      s.initial.values[0].value = 800;
    },
    (s: any) => {
      s.initial.values[0].id = 'unknown';
    },
    (s: any) => {
      s.initial.highlights = ['not-a-feature'];
    },
    (s: any) => {
      s.objective = '<script>alert(1)</script>';
    },
    (s: any) => {
      s.initial.selected = 'constructor';
    },
  ])('rejects unsafe, unknown and invalid state before rendering', (mutate) => {
    const s = structuredClone(quadraticVisual());
    mutate(s);
    expect(validVisualSpec(s)).toBe(false);
  });
  it('rejects disconnected identifiers and repeated nodes in relation specs', () => {
    const s = logicVisual();
    if (s.type !== 'relationships') throw Error();
    s.edges[0]!.to = 'missing';
    expect(validVisualSpec(s)).toBe(false);
    s.edges[0]!.to = 'rule';
    s.nodes[1]!.id = 'fact';
    expect(validVisualSpec(s)).toBe(false);
  });
  it('supports reusable layers, shapes, cycles, comparisons and an explicit unavailable fallback', () => {
    const base = visualBase('Locate the regions.', modelState());
    const layers: VisualSpec = {
      ...base,
      type: 'cross-section',
      layers: [
        { id: 'outer', label: 'Outer layer', thickness: 1 },
        { id: 'inner', label: 'Inner layer', thickness: 4 },
      ],
    };
    const structure: VisualSpec = {
      ...base,
      type: 'structure',
      shapes: [
        {
          id: 'outline',
          label: 'Region',
          shape: 'polygon',
          points: [
            { x: 150, y: 100 },
            { x: 300, y: 90 },
            { x: 260, y: 200 },
          ],
        },
      ],
    };
    for (const spec of [layers, structure]) {
      expect(validVisualSpec(spec)).toBe(true);
      expect(visualScene(spec, spec.initial).marks.some((x) => x.kind === 'path')).toBe(true);
    }
    for (const layout of ['process', 'cycle', 'causal', 'comparison', 'concept-map'] as const) {
      const spec = logicVisual();
      if (spec.type !== 'relationships') throw Error();
      spec.layout = layout;
      expect(validVisualSpec(spec)).toBe(true);
      expect(visualScene(spec, spec.initial).marks.length).toBeGreaterThan(6);
    }
    const unsupported: VisualSpec = {
      ...base,
      type: 'unsupported',
      reason: 'A live fluid solver is unavailable. Compare the worked examples instead.',
    };
    expect(validVisualSpec(unsupported)).toBe(true);
    expect(visualScene(unsupported, unsupported.initial).note).toContain('unavailable');
  });
});
describe('meaningful model transitions and teaching evidence', () => {
  it('moves real geometry, stops, and preserves evidence while exploring', () => {
    const s = start(2),
      spec = plateVisual('boundaries'),
      initial = runtime(spec.initial);
    const playing = transitionVisual(spec, initial, { type: 'play' });
    let moved = transitionVisual(spec, playing, { type: 'tick' });
    expect(valueOf(moved, 'progress')).toBeGreaterThan(valueOf(initial, 'progress'));
    expect(visualScene(spec, moved).marks).not.toEqual(visualScene(spec, initial).marks);
    moved = transitionVisual(spec, moved, { type: 'pause' });
    expect(transitionVisual(spec, moved, { type: 'tick' })).toEqual(moved);
    const transformed = transitionVisual(spec, moved, { type: 'boundary', value: 'transform' });
    expect(visualScene(spec, transformed).description).toContain('Plan view');
    expect(s.evidence?.attempts).toHaveLength(0);
    expect(progressSummary(s, tectonics).verified).toBe(0);
  });
  it('shows three recognizably different boundary geometries', () => {
    const spec = plateVisual('boundaries');
    const scenes = (['divergent', 'convergent', 'transform'] as const).map((boundary) =>
      visualScene(spec, { ...spec.initial, boundary }),
    );
    expect(scenes[0]!.marks.some((x) => x.id === 'upwelling')).toBe(true);
    expect(scenes[1]!.marks.some((x) => x.id === 'slab')).toBe(true);
    expect(scenes[2]!.description).toContain('Plan view');
    expect(new Set(scenes.map((x) => JSON.stringify(x.marks))).size).toBe(3);
  });
  it('uses equal vector scales and computes the graph/market features from current values', () => {
    const forces = forceVisual(),
      same = modelState({ fx: 3, fy: 3 });
    const marks = visualScene(forces, same).marks;
    expect(marks.find((m) => m.id === 'force-x' && m.kind === 'path')).toMatchObject({
      d: 'M340 185L388 185',
    });
    expect(marks.find((m) => m.id === 'force-y' && m.kind === 'path')).toMatchObject({
      d: 'M340 185L340 137',
    });
    const market = marketVisual();
    expect(visualScene(market, market.initial).marks).toContainEqual(
      expect.objectContaining({ kind: 'text', text: 'Equilibrium: Q=5.00, P=5.00' }),
    );
    expect(
      visualScene(market, { ...market.initial, reveal: true }, true).marks.some(
        (m) => m.id === 'equilibrium',
      ),
    ).toBe(false);
    const graph = quadraticVisual();
    expect(visualScene(graph, { ...graph.initial, reveal: true }).marks).toContainEqual(
      expect.objectContaining({ text: 'Vertex (0, 0)' }),
    );
  });
  it('remediates a transform/divergent mistake using motion highlights and then a fresh example', () => {
    let s = teachAction(start(3), tectonics, 'check');
    s = submit(s, false);
    expect(s.teaching.status).toBe('RETEACHING');
    expect(s.visualState.kind === 'topic' && s.visualState.runtime?.highlights).toContain('motion');
    expect(s.lastFeedback).toContain('along the shared fault');
    const before = s.questionId;
    s = teachAction(s, tectonics, 'check');
    expect(currentQuestion(s, tectonics).id).toContain('followup');
    expect(s.visualState.kind === 'topic' && s.visualState.runtime?.boundary).toBe('divergent');
    s = submit(s);
    expect(s.teaching.status).toBe('READY_TO_CONTINUE');
    expect(s.questionId).toBe(before);
    expect(continueCheckpoint(s, tectonics).questionId).not.toBe(before);
  });
  it('keeps independent assessment fresh, strips answer labels, and records help separately', () => {
    const layers = plateVisual('layers');
    expect(
      visualScene(layers, layers.initial, true)
        .marks.filter((m) => m.kind === 'text')
        .some((m) => /lithosphere|lithospheric|asthenosphere/i.test(m.text)),
    ).toBe(false);
    let s = submit(teachAction(start(2), tectonics, 'check'));
    s = beginConceptTest(s, tectonics);
    expect(currentQuestion(s, tectonics).id).toContain('independent');
    const v = s.visualState;
    if (v.kind !== 'topic' || !v.visual || !v.runtime) throw Error();
    const scene = visualScene(v.visual, v.runtime, true);
    expect(
      scene.marks
        .filter((m) => m.kind === 'text')
        .some((m) => /subduct|volcanic arc|convergent/i.test(m.text)),
    ).toBe(false);
    s = submit(s);
    expect(s.evidence?.attempts.at(-1)?.independent).toBe(true);
    expect(progressSummary(s, tectonics).verified).toBe(1);
    let assisted = submit(teachAction(start(3), tectonics, 'check'));
    assisted = assistance(beginConceptTest(assisted, tectonics), 'hint');
    assisted = submit(assisted);
    expect(assisted.evidence?.attempts.at(-1)?.independent).toBe(false);
    expect(assisted.evidence?.attempts.at(-1)?.assisted).toBe(true);
    expect(progressSummary(assisted, tectonics).verified).toBe(0);
  });
  it('finishes diagnostics and the end-of-lesson check through the existing controller', () => {
    let s = startLearning(selectLesson(initialState, tectonics, null), tectonics);
    expect(s.learning?.activity).toBe('diagnostic');
    for (let i = 0; i < 2; i++) {
      s = submit(s);
      s = continueAssessment(s, tectonics);
    }
    expect(s.evidence?.diagnostic).toBe('completed');
    expect(s.learning?.introduction).toBeUndefined();
    s = { ...s, phase: 'recap' };
    s = startFinalAssessment(s, tectonics);
    for (let i = 0; i < tectonics.questions.length; i++) {
      s = submit(s);
      s = continueAssessment(s, tectonics);
    }
    expect(s.phase).toBe('recap');
    expect(s.evidence?.attempts.filter((x) => x.kind === 'final')).toHaveLength(5);
  });
  it('recovers model, answer, assessment and help across mode switches and rejects damaged checkpoints', () => {
    let s = submit(teachAction(start(2), tectonics, 'check'));
    s = beginConceptTest(s, tectonics);
    s = assistance(s, 'question');
    s = { ...s, mode: 'world', studentResponse: 'draft' };
    const paused = interrupt(s, '');
    expect(resume(restoreSession(serializeSession(paused))!)).toMatchObject({
      visualState: s.visualState,
      studentResponse: 'draft',
      learning: paused.learning,
      mode: 'world',
    });
    const bad = structuredClone(s);
    if (bad.visualState.kind === 'topic') bad.visualState.runtime!.values[0]!.value = NaN;
    expect(restoreSession(serializeSession(bad))).toBeNull();
  });
});
describe('the generated pipeline generalizes across subjects', () => {
  it.each(subjectCases)(
    'normalizes, renders and recovers $name from provider JSON',
    async (entry) => {
      const outline = subjectOutline(entry);
      expect(validOutline(outline)).toBe(true);
      vi.stubEnv('OPENAI_API_KEY', 'test-fixture');
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ status: 'completed', output_text: JSON.stringify(outline) }),
        );
      vi.stubGlobal('fetch', fetch);
      try {
        const lesson = await generateTopic(entry.name);
        expect(validTopicLesson(lesson)).toBe(true);
        const s = goToCheckpoint(selectLesson(initialState, lesson, null), lesson, 0);
        expect(s.visualState.kind === 'topic' && s.visualState.visual).toEqual(entry.spec);
        expect(restoreSession(serializeSession(s))?.visualState).toEqual(s.visualState);
        const html = renderToStaticMarkup(
          createElement(VisualEngine, { state: s, patch: () => {} }),
        );
        expect(html).toContain('<svg');
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    },
  );
  it('rejects a generated blueprint that omits its visual rather than silently showing cards', () => {
    const outline = subjectOutline(subjectCases[0]!);
    delete outline.steps[0]!.visual;
    expect(() => makeTopicLesson(outline, 'generated', 'topic-invalid')).toThrow();
  });
});
