import { describe, expect, it } from 'vitest';
import { provisionalTopicShape } from './topic/topic-shape.provisional';
import { buildLessonShape, isGenericLabel } from './shape/lesson-shape.service';
import { selectArc, openingSurfaceFor, TEACHING_SURFACES } from './shape/shape-grammar';
import { decideNextStep } from './loop/step-decider';
import { gradeInstant } from './grade/instant-grader';
import { detectNameTemplate, CHARTER_VERSION } from './tutor/tutor-charter';
import { assertSurfaceAllowed, resolveCapabilities } from './capabilities/capability-resolver';
import { buildFixtureLesson } from './generate/fixture-lesson';
import { validateGeneratedLesson } from './generate/validate-lesson';
import { buildTutorGenerationSystem } from './generate/tutor-generation.prompt';

describe('shape grammar variance', () => {
  it('picks different arcs for math procedure vs history body', () => {
    const math = provisionalTopicShape('Graphing functions and vertical shifts');
    const hist = provisionalTopicShape('French Revolution causes');
    expect(selectArc(math, 'learn').id).toBe('procedure.linear');
    expect(selectArc(hist, 'learn').id).toBe('body.causal_contested');
    expect(selectArc(math, 'practice').id).toBe('goal.practice');
  });

  it('never opens with a test surface', () => {
    const shape = provisionalTopicShape('Integration by parts');
    const arc = selectArc(shape, 'learn');
    const opening = openingSurfaceFor(shape, arc);
    expect(TEACHING_SURFACES.has(opening)).toBe(true);
    expect(opening).not.toBe('question_set');
    expect(opening).not.toBe('probe');
  });

  it('rejects generic checkpoint labels', () => {
    expect(isGenericLabel('Introduction', 'Calculus')).toBe(true);
    expect(isGenericLabel('Understanding photosynthesis', 'photosynthesis')).toBe(true);
    expect(isGenericLabel('Where the graph sits', 'Graph shifts')).toBe(false);
  });

  it('builds lesson shapes with contentful unique labels', () => {
    const shape = provisionalTopicShape('French Revolution');
    const lesson = buildLessonShape(shape, 'learn', 'French Revolution');
    expect(lesson.checkpoints.length).toBeGreaterThanOrEqual(3);
    const labels = lesson.checkpoints.map((c) => c.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    for (const cp of lesson.checkpoints) {
      expect(isGenericLabel(cp.label, 'French Revolution')).toBe(false);
    }
  });

  it('gives every major family a substantive multi-step spine', () => {
    for (const title of [
      'Graphing quadratic functions',
      'Photosynthesis',
      'French Revolution',
      'Binary search',
      'Passé composé',
    ]) {
      const shape = provisionalTopicShape(title);
      expect(shape.spine.length).toBeGreaterThanOrEqual(3);
      expect(shape.spine.every((s) => s.gist.length >= 40)).toBe(true);
    }
  });

  it('does not teach graph shifts for matrices', () => {
    const shape = provisionalTopicShape('Matrix and Determinants');
    expect(shape.subject_family).toBe('mathematics');
    expect(shape.spine[0]?.label.toLowerCase()).toMatch(/matrix/);
    expect(shape.spine.some((s) => /graph sits|shifting/i.test(s.label))).toBe(false);
    expect(shape.canonical_examples[0]?.setup.toLowerCase()).toMatch(/pmatrix|det/);

    const lesson = buildLessonShape(shape, 'learn', 'Matrix and Determinants');
    const blocks = buildFixtureLesson('Matrix and Determinants', shape, lesson);
    const text = JSON.stringify(blocks).toLowerCase();
    expect(text).not.toMatch(/x\^2|parabola|vertex sits/);
    expect(text).toMatch(/det|matrix/);
    expect(blocks.some((b) => b.surface === 'graph_plot')).toBe(false);
  });
});

describe('decideNextStep', () => {
  const base = {
    budgetExhausted: false,
    teachingBlocksInCheckpoint: 1,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    checkpointTaught: true,
    checkDone: false,
    insertionsUsed: 0,
    consecutiveProbes: 0,
    probeChains: 0,
    hitMisconceptionName: null as string | null,
    shakyPrerequisite: false,
    roleAllowsProbe: true,
    unvisitedSpineRef: null as number | null,
  };

  it('teaches first when checkpoint has no teaching yet', () => {
    expect(decideNextStep({ ...base, teachingBlocksInCheckpoint: 0 }).type).toBe('teach');
  });

  it('repairs named misconceptions', () => {
    const a = decideNextStep({
      ...base,
      consecutiveWrong: 1,
      hitMisconceptionName: 'Horizontal/vertical mix-up',
    });
    expect(a).toEqual({ type: 'repair', misconceptionName: 'Horizontal/vertical mix-up' });
  });

  it('checks after teaching before probe', () => {
    expect(decideNextStep(base).type).toBe('check');
  });

  it('caps probe chains via consecutiveProbes', () => {
    const a = decideNextStep({
      ...base,
      checkDone: true,
      consecutiveProbes: 2,
      unvisitedSpineRef: 1,
    });
    expect(a.type).toBe('teach');
  });

  it('consolidates when budget exhausted', () => {
    expect(decideNextStep({ ...base, budgetExhausted: true }).type).toBe('consolidate');
  });
});

describe('instant grader', () => {
  it('grades MCQ with high confidence', () => {
    expect(
      gradeInstant({ kind: 'mcq', correctOptionId: 'a', selectedOptionId: 'a' }),
    ).toEqual({ correct: true, confidence: 'high' });
    expect(
      gradeInstant({ kind: 'mcq', correctOptionId: 'a', selectedOptionId: 'b' }).correct,
    ).toBe(false);
  });

  it('grades numeric within tolerance', () => {
    expect(
      gradeInstant({ kind: 'numeric', expected: 3, tolerance: 0.1, given: 3.05 }).correct,
    ).toBe(true);
  });

  it('returns low confidence for ambiguous short text', () => {
    const r = gradeInstant({
      kind: 'short_text',
      mustContain: ['vertical'],
      given: 'it moves somehow',
    });
    expect(r.correct).toBeNull();
    expect(r.confidence).toBe('low');
  });
});

describe('tutor charter', () => {
  it('exposes a charter version', () => {
    expect(CHARTER_VERSION.length).toBeGreaterThan(4);
  });

  it('detects topic-name template failures', () => {
    expect(detectNameTemplate('Why does **Photosynthesis** work the way it does?', 'Photosynthesis')).toBe(
      true,
    );
    expect(
      detectNameTemplate(
        'The graph of $f(x)=x^2$ is shifted so its vertex sits at $(0,3)$. What is the new equation?',
        'Graph shifts',
      ),
    ).toBe(false);
  });
});

describe('capabilities', () => {
  it('unlocks graph_plot for mathematics', () => {
    const shape = provisionalTopicShape('Graphing quadratic functions');
    const caps = resolveCapabilities(shape);
    expect(caps.capabilities).toContain('quantitative.graphical');
    expect(assertSurfaceAllowed(caps, 'graph_plot')).toBe(true);
    expect(assertSurfaceAllowed(caps, 'timeline')).toBe(false);
  });

  it('forbids graph_plot for history', () => {
    const shape = provisionalTopicShape('Cold War origins');
    const caps = resolveCapabilities(shape);
    expect(assertSurfaceAllowed(caps, 'timeline')).toBe(true);
    expect(assertSurfaceAllowed(caps, 'graph_plot')).toBe(false);
  });
});

describe('fixture lesson', () => {
  it('never starts with a question and never uses name templates', () => {
    const title = 'Vertical shifts of graphs';
    const shape = provisionalTopicShape(title);
    const lesson = buildLessonShape(shape, 'learn', title);
    const blocks = buildFixtureLesson(title, shape, lesson);
    expect(blocks[0]?.surface).not.toBe('question_set');
    expect(blocks[0]?.surface).not.toBe('probe');
    for (const b of blocks) {
      if (b.surface === 'question_set') {
        expect(detectNameTemplate(b.promptMd, title)).toBe(false);
      }
      if (b.surface === 'explanation') {
        expect(detectNameTemplate(b.bodyMd, title)).toBe(false);
      }
    }
  });

  it('includes graph_plot for graphing math topics', () => {
    const title = 'Graphing functions';
    const shape = provisionalTopicShape(title);
    const lesson = buildLessonShape(shape, 'learn', title);
    const blocks = buildFixtureLesson(title, shape, lesson);
    expect(blocks.some((b) => b.surface === 'graph_plot')).toBe(true);
  });

  it('uses topic-specific probes, not generic core-idea wording', () => {
    const title = 'French Revolution';
    const shape = provisionalTopicShape(title);
    const lesson = buildLessonShape(shape, 'learn', title);
    const blocks = buildFixtureLesson(title, shape, lesson);
    const probe = blocks.find((b) => b.surface === 'probe');
    expect(probe && probe.surface === 'probe' && probe.questionMd).toBeTruthy();
    if (probe && probe.surface === 'probe') {
      expect(probe.questionMd).not.toMatch(/core idea in your own words/i);
    }
  });
});

describe('generated lesson validation', () => {
  it('rejects name-template openings and generic probes', () => {
    const shape = provisionalTopicShape('Photosynthesis');
    const caps = resolveCapabilities(shape);
    const bad = validateGeneratedLesson(
      {
        blocks: [
          {
            surface: 'explanation',
            bodyMd: 'Why does **Photosynthesis** work the way it does? Because it does.',
            whyHere: 'bad',
          },
          {
            surface: 'probe',
            questionMd: 'In one sentence, what is the core idea in your own words?',
            whyHere: 'bad',
          },
          { surface: 'checkpoint', name: 'Done' },
          {
            surface: 'system_notice',
            message: 'When you are ready, curate flashcards.',
          },
        ],
      },
      { topicTitle: 'Photosynthesis', capabilities: caps },
    );
    expect(bad.ok).toBe(false);
  });

  it('accepts a clean STEM-shaped lesson', () => {
    const shape = provisionalTopicShape('Graphing functions');
    const caps = resolveCapabilities(shape);
    const good = validateGeneratedLesson(
      {
        blocks: [
          {
            surface: 'explanation',
            heading: 'Where the graph sits',
            bodyMd:
              'A graph is the set of points (x, f(x)). Shifting moves every point the same way without changing the shape of the curve.',
            deeperMd: 'The derivative is unchanged by a constant vertical shift.',
            whyHere: 'Ground the object before transforming it.',
          },
          {
            surface: 'graph_plot',
            caption: 'Drag k',
            expression: 'x^2+k',
            param: { name: 'k', min: -2, max: 3, value: 0 },
            whyHere: 'See the shift.',
          },
          {
            surface: 'question_set',
            promptMd: 'Vertex at (0,3) after shifting x^2. New equation?',
            options: [
              { id: 'a', label: 'x^2+3', correct: true },
              {
                id: 'b',
                label: '(x+3)^2',
                mistake: { name: 'Mix-up', explainsMd: 'Inside shifts horizontally.' },
              },
              {
                id: 'c',
                label: '3x^2',
                mistake: { name: 'Scale', explainsMd: 'Multiply stretches.' },
              },
            ],
            answerKey: { correctOptionId: 'a' },
            whyHere: 'Check the shift.',
          },
          { surface: 'checkpoint', name: 'Where the graph sits' },
          {
            surface: 'system_notice',
            message: 'Curate a few cards from what you missed.',
            actionLabel: 'Review',
          },
        ],
      },
      { topicTitle: 'Graphing functions', capabilities: caps },
    );
    expect(good.ok).toBe(true);
  });
});

describe('tutor generation prompts', () => {
  it('gives every family dignity and STEM an extra edge', () => {
    const hist = provisionalTopicShape('French Revolution');
    const math = provisionalTopicShape('Graphing functions');
    const histSys = buildTutorGenerationSystem({
      topicTitle: 'French Revolution',
      goal: 'learn',
      shape: hist,
      capabilities: resolveCapabilities(hist),
    });
    const mathSys = buildTutorGenerationSystem({
      topicTitle: 'Graphing functions',
      goal: 'learn',
      shape: math,
      capabilities: resolveCapabilities(math),
    });
    expect(histSys).toContain('Every subject is first-class');
    expect(histSys).toContain('History:');
    expect(histSys).not.toContain('STEM EDGE');
    expect(mathSys).toContain('Every subject is first-class');
    expect(mathSys).toContain('STEM EDGE');
    expect(mathSys).toContain('graph_plot');
  });
});
