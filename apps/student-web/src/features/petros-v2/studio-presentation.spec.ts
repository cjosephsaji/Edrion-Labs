import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  m4SnapshotSchema,
  m4LessonSchema,
  type M4Snapshot,
  type CompanionCue,
} from '@edrion/schemas';
import { PresentationController } from './presentation-controller';
import {
  studioCue,
  studioExcerpt,
  studioPassages,
  studioSourceKey,
  studioTimeline,
} from './studio-presentation';
const id = '10000000-0000-4000-8000-000000000001';
const ref = {
  sourceId: id,
  sourceRevisionId: id,
  sourceHash: 'a'.repeat(64),
  representationHash: 'b'.repeat(64),
  unitId: id,
  unitHash: 'c'.repeat(64),
  locator: { kind: 'synthetic' as const, section: 'source', span: { start: 0, end: 20 } },
  semanticId: null,
};
function snapshot(): M4Snapshot {
  return m4SnapshotSchema.parse({
    engine: 'v2',
    id,
    lesson: {
      title: 'An authorized idea',
      subject: 'A subject',
      objective: { id, version: 1, label: 'Compare the supplied source' },
      explanation: 'First exact source statement.\n\nSecond exact statement.',
      citation: 'Reviewed excerpt',
      references: [ref],
      excerpts: [{ text: 'A source detail.', reference: ref }],
      limitations: [],
    },
    status: 'active',
    stage: 'delivering',
    revision: 1,
    epoch: 0,
    task: null,
    draft: '',
    canvas: null,
    checkpointId: null,
    submission: null,
    evaluation: null,
    actions: ['next', 'ask'],
    progress: {
      contentViewed: false,
      responsesCommitted: 0,
      responsesEvaluated: 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: 'Saved session.',
  });
}
function setup() {
  const s = snapshot();
  const c = new PresentationController(studioTimeline(s.lesson!));
  c.step();
  return { s, c, state: c.getSnapshot(), published: c.timeline.beats[0]!.action.cue };
}
function submitted(s: M4Snapshot) {
  s.submission = {
    id,
    commandId: id,
    status: 'complete',
    response: { kind: 'text', text: 'My work' },
  };
  return s;
}
afterEach(() => vi.useRealTimers());
describe('M4 studio public presentation and companion fencing', () => {
  it('preserves a long structured quotation and its exact source identity', () => {
    const lesson = snapshot().lesson!;
    const text = 'Exact reviewed source. '.repeat(85);
    lesson.excerpts = [{ text, reference: ref }];
    const timeline = studioTimeline(lesson);
    expect(timeline.beats.at(-1)!.action.operations[0]).toMatchObject({ element: { text } });
    expect(studioExcerpt(lesson, `excerpt-${timeline.beats.length - 1}`)?.reference).toEqual(ref);
  });
  it('does not confuse identical quotations with different source references', () => {
    const lesson = snapshot().lesson!;
    const other = { ...ref, unitId: '10000000-0000-4000-8000-000000000002' };
    lesson.excerpts = [
      { text: 'Same words.', reference: ref },
      { text: 'Same words.', reference: other },
    ];
    expect(studioExcerpt(lesson, 'excerpt-2')?.reference.unitId).toBe(ref.unitId);
    expect(studioExcerpt(lesson, 'excerpt-3')?.reference.unitId).toBe(other.unitId);
    expect(studioExcerpt(lesson, 'not-an-excerpt')).toBeUndefined();
  });
  it('retains all long explanation text instead of silently truncating at twelve beats', () => {
    const lesson = snapshot().lesson!;
    lesson.explanation = 'x'.repeat(12000);
    lesson.excerpts = Array.from({ length: 16 }, () => ({
      text: 'y'.repeat(2000),
      reference: ref,
    }));
    const c = new PresentationController(studioTimeline(lesson));
    while (c.getSnapshot().status !== 'complete') c.step();
    expect(
      c
        .getSnapshot()
        .canvas.elements.map((e) => ('text' in e ? e.text : ''))
        .join(''),
    ).toBe(lesson.explanation + lesson.excerpts.map((e) => e.text).join(''));
    c.dispose();
  });
  it('keeps highly fragmented source text within the validated timeline bound', () => {
    const lesson = snapshot().lesson!;
    lesson.explanation = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const passages = studioPassages(lesson);
    expect(passages.map((p) => p.text).join('')).toContain(lesson.explanation);
    expect(() => new PresentationController(studioTimeline(lesson))).not.toThrow();
  });
  it('fits maximum-sized reviewed excerpts alongside fragmented explanation text', () => {
    const lesson = snapshot().lesson!;
    lesson.explanation = Array.from({ length: 40 }, () => 'z'.repeat(290)).join('\n\n');
    lesson.excerpts = Array.from({ length: 16 }, () => ({
      text: 'y'.repeat(2000),
      reference: ref,
    }));
    expect(() => new PresentationController(studioTimeline(lesson))).not.toThrow();
    expect(
      studioPassages(lesson)
        .map((p) => p.text)
        .join(''),
    ).toBe(lesson.explanation + 'y'.repeat(32000));
  });
  it('has no invented source passage when the public wording is blank', () => {
    const lesson = snapshot().lesson!;
    lesson.explanation = '   ';
    lesson.excerpts = [];
    expect(studioPassages(lesson)).toEqual([]);
  });
  it('only reveals exact source strings with no assessment invitation or inferred relationships', () => {
    const { c } = setup();
    while (c.getSnapshot().status !== 'complete') c.step();
    expect(c.getSnapshot().canvas.elements.map((e) => ('text' in e ? e.text : ''))).toEqual([
      'First exact source statement.',
      'Second exact statement.',
      'A source detail.',
    ]);
    expect(c.getSnapshot().canvas.invitation).toBeNull();
    expect(c.getSnapshot().feedback).toBeNull();
  });
  it('refuses a nonexistent target and never references a missing element', () => {
    const { c, s } = setup();
    c.select('nonexistent');
    expect(c.getSnapshot().selectedId).toBe('excerpt-0');
    c.play();
    const cue = studioCue(
      s,
      c.getSnapshot(),
      c.timeline.beats[c.getSnapshot().index]!.action.cue,
      false,
    );
    expect(c.getSnapshot().canvas.elements.some((e) => e.id === cue.targetId)).toBe(true);
    c.dispose();
  });
  it('stops old presentation callbacks on interruption', () => {
    vi.useFakeTimers();
    const { c } = setup();
    c.play();
    c.interrupt();
    const before = c.getSnapshot();
    vi.advanceTimersByTime(30000);
    expect(c.getSnapshot()).toBe(before);
    expect(c.getSnapshot().speech.phase).toBe('text');
    c.dispose();
  });
  it('drops a cue for a nonexistent or no-longer-highlighted target', () => {
    const { s, c, published } = setup();
    c.play();
    const cue = studioCue(s, c.getSnapshot(), { ...published, targetId: 'nonexistent' }, false);
    expect(cue.targetId).toBeNull();
    expect(cue.gesture).toBe('neutral');
    c.dispose();
  });
  it.each(['paused', 'blocked', 'closed'] as const)('revokes all target cues when %s', (status) => {
    const { s, c, published } = setup();
    s.status = status;
    c.play();
    const cue = studioCue(s, c.getSnapshot(), published, false);
    expect(cue.targetId).toBeNull();
    expect(cue.gesture).toBe('neutral');
    expect(cue.mode).toBe('paused');
    c.dispose();
  });
  it('yields without reading any draft during an independent task', () => {
    const { s, state, published } = setup();
    s.task = {
      taskId: id,
      instanceHash: 'a'.repeat(64),
      prompt: 'Choose',
      passage: null,
      responseKind: 'choice',
      choices: [],
      fields: [],
      helpPolicy: 'no_hints',
      citation: 'Reviewed',
    };
    s.draft = 'PRIVATE_ANSWER';
    const cue = studioCue(s, state, published, true);
    expect(cue.mode).toBe('waiting');
    expect(cue.targetId).toBeNull();
    expect(cue.caption).not.toContain('PRIVATE_ANSWER');
  });
  it.each(['unavailable', 'review_required', 'invalidated'] as const)(
    'never acknowledges success for %s feedback',
    (status) => {
      const { s, state, published } = setup();
      submitted(s);
      s.evaluation = {
        id,
        responseId: id,
        status,
        evaluatorVersion: 'petros.m4.kernel.v1',
        supersedes: null,
        reason: null,
        criteria: [
          {
            criterionId: id,
            label: 'Reasoning',
            status: 'abstained',
            origin: 'review_required',
            feedback: 'Not verified.',
          },
        ],
      };
      expect(studioCue(s, state, published, false).mode).toBe('waiting');
      expect(s.progress.mastery).toBe(false);
    },
  );
  it('requires an evaluation bound to the committed response before an earned acknowledgment', () => {
    const { s, state, published } = setup();
    submitted(s);
    s.evaluation = {
      id,
      responseId: id,
      status: 'evaluated',
      evaluatorVersion: 'petros.m4.kernel.v1',
      supersedes: null,
      reason: null,
      criteria: [
        {
          criterionId: id,
          label: 'Selection',
          status: 'satisfied',
          origin: 'trusted_kernel',
          feedback: 'Checked.',
        },
      ],
    };
    expect(studioCue(s, state, published, false).mode).toBe('acknowledging');
    const criteria = s.evaluation.criteria;
    s.evaluation.criteria = [];
    expect(studioCue(s, state, published, false).mode).toBe('waiting');
    s.evaluation.criteria = criteria.map((criterion) => ({
      ...criterion,
      origin: 'review_required',
    }));
    expect(studioCue(s, state, published, false).mode).toBe('waiting');
    s.evaluation.criteria = criteria;
    s.evaluation.responseId = '10000000-0000-4000-8000-000000000002';
    expect(studioCue(s, state, published, false).mode).toBe('waiting');
    s.evaluation.responseId = id;
    s.submission!.status = 'pending';
    expect(studioCue(s, state, published, false).mode).toBe('waiting');
  });
  it('keeps local reading keys distinct across source revisions and sessions', () => {
    const s = snapshot(),
      original = studioSourceKey(s);
    s.lesson!.references[0]!.sourceHash = 'f'.repeat(64);
    expect(studioSourceKey(s)).not.toBe(original);
    expect(studioSourceKey(s)).not.toContain('First exact');
  });
  it('supports historical publications without new excerpts and rejects foreign source pins', () => {
    const s = snapshot(),
      { excerpts: _, ...old } = s.lesson!;
    expect(m4LessonSchema.parse(old)).toEqual(old);
    expect(JSON.stringify(m4LessonSchema.parse(old))).toBe(JSON.stringify(old));
    s.lesson!.excerpts![0]!.reference = { ...ref, sourceHash: 'e'.repeat(64) };
    expect(m4LessonSchema.safeParse(s.lesson).success).toBe(false);
  });
  it('reduced motion gives complete semantic steps and dispose stops playback', () => {
    vi.useFakeTimers();
    const { c } = setup();
    c.configure({ reducedMotion: true });
    c.play();
    expect(c.getSnapshot().progress).toBe(1);
    c.dispose();
    const before = c.getSnapshot();
    vi.advanceTimersByTime(30000);
    expect(c.getSnapshot()).toBe(before);
  });
  it('all authored gestures stay within the actual supported cue contract', () => {
    const { c } = setup();
    expect(
      c.timeline.beats.every((b) =>
        (['neutral', 'point-right', 'point-left'] as CompanionCue['gesture'][]).includes(
          b.action.cue.gesture,
        ),
      ),
    ).toBe(true);
  });
});
