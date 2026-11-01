import { describe, it, expect } from 'vitest';
import { retrieveExplanation } from '../teaching/contextual-explanations';
import { initialState, lessonVisual } from '../teaching/controller';
import { lessons } from '../lessons';
import { greeting, teachingStepForQuestion } from '../world/storyboard';
import type { ShowcaseState } from '../teaching/types';
const ai3 = lessons[0]!;
const state = (patch: Partial<ShowcaseState> = {}): ShowcaseState => ({
  ...initialState,
  lessonId: 'ai3',
  questionId: 'AI3-Q03',
  mode: 'world',
  visualState: lessonVisual('ai3'),
  ...patch,
});
describe('immersive teaching and contextual retrieval', () => {
  it('uses the actual selected topic for the welcome', () =>
    expect(greeting(ai3, state())).toContain('minimax'));
  it('explains the selected MIN A and its actual 3/5 values', () => {
    const r = retrieveExplanation(
      state({ highlightTargetId: 'leaf-0-0' }),
      ai3,
      'Why did MIN A choose 3 instead of 5?',
    )!;
    expect(r.label).toBe('Prepared source-linked explanation');
    expect(r.text).toContain('min(3, 5) = 3');
    expect(r.target).toBe('leaf-0-0');
  });
  it('explains MIN B without confusing it with A', () =>
    expect(
      retrieveExplanation(
        state({ highlightTargetId: 'branch-1', questionId: 'AI3-Q04' }),
        ai3,
        'Why did MIN B choose 2 instead of 9?',
      )?.text,
    ).toContain('min(2, 9) = 2'));
  it('asks for clarification when the supplied numbers do not match the highlighted node', () =>
    expect(
      retrieveExplanation(
        state({ highlightTargetId: 'branch-1' }),
        ai3,
        'Why did you choose 3 instead of 9?',
      )?.clarification,
    ).toBe(true));
  it('asks which node when none is actually selected', () =>
    expect(
      retrieveExplanation(state(), ai3, 'Why this step?')?.clarification,
    ).toBe(true));
  it('does not disguise broader unsupported questions as contextual explanations', () =>
    expect(
      retrieveExplanation(
        state({ highlightTargetId: 'root' }),
        ai3,
        'Why did the Roman Empire collapse?',
      ),
    ).toBeNull());
  it('uses actual pruning counts and never mutates the original student answer', () => {
    const s = state({ studentResponse: 'my original explanation' });
    const r = retrieveExplanation(
      s,
      ai3,
      'Why does pruning skip those leaves?',
    )!;
    expect(r.text).toContain('evaluates 5 leaves and skips 1');
    expect(s.studentResponse).toBe('my original explanation');
  });
  it('keeps unsupported flight distinct from false', () => {
    const l = lessons[1]!;
    const s = state({
      lessonId: 'ai4',
      questionId: 'AI4-Q07',
      visualState: {
        kind: 'kb',
        facts: ['Bird(Tweety)'],
        derived: [],
        query: 'CanFly(Tweety)',
        direction: 'forward',
      },
    });
    expect(retrieveExplanation(s, l, 'Why is this unknown?')?.text).toContain(
      'does not prove falsehood',
    );
  });
  it('grounds a selected construction hazard in its actual source page', () => {
    const l = lessons[2]!;
    const s = state({
      lessonId: 'ehs3',
      questionId: 'EHS3-Q02',
      visualState: {
        kind: 'hazards',
        selected: 'edge',
        inspected: [],
        safer: false,
      },
    });
    expect(retrieveExplanation(s, l, 'Why is this a hazard?')?.text).toContain(
      'p. 9',
    );
  });
  it('uses current controls rather than inventing water-quality claims', () => {
    const l = lessons[3]!;
    const s = state({
      lessonId: 'ehs5',
      questionId: 'EHS5-Q03',
      visualState: { kind: 'river', selected: 'sewage', controls: ['sewage'] },
    });
    const r = retrieveExplanation(s, l, 'Why did this change?')!;
    expect(r.text).toContain('currently controlled');
    expect(r.text).toContain('does not measure water quality');
  });
  it('computes a current clock explanation using the active speed', () => {
    const l = lessons.find((l) => l.id === 'time')!;
    const s = state({
      lessonId: 'time',
      questionId: 'TIME-Q05',
      visualState: { kind: 'clocks', speed: 0.8, earthYears: 10 },
    });
    expect(
      retrieveExplanation(s, l, 'Why does this clock differ?')?.text,
    ).toContain('6.00 traveler years');
  });
  it('maps World progress back into the same authored Classic teaching steps', () => {
    expect(teachingStepForQuestion('ai3', 8)).toBe(4);
    expect(teachingStepForQuestion('ai4', 4)).toBe(3);
    expect(teachingStepForQuestion('ehs3', 10)).toBe(5);
  });
  it('resolves a named flight question without needing a prior ASK click', () => {
    const l = lessons[1]!;
    const r = retrieveExplanation(
      state({
        lessonId: 'ai4',
        questionId: 'AI4-Q07',
        visualState: {
          kind: 'kb',
          facts: ['Bird(Tweety)'],
          derived: [],
          query: '',
          direction: 'forward',
        },
      }),
      l,
      'Why is CanFly(Tweety) not supported?',
    );
    expect(r?.target).toBe('CanFly(Tweety)');
    expect(r?.text).toContain('not entailed');
  });
});
