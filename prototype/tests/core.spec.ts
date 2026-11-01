import { describe, it, expect } from 'vitest';
import {
  alphaBeta,
  minimax,
  entail,
  elapsedTime,
} from '../teaching/algorithms';
import { ai3 } from '../lessons/ai3';
import {
  initialState,
  practice,
  interrupt,
  resume,
  cueAllowed,
  yieldCue,
  selectLesson,
} from '../teaching/controller';
import { goToCheckpoint, teachAction } from '../teaching/checkpoint';
import { recognize } from '../teaching/server';
import manifest from '../assets/source-manifest.json';
describe('Checkpoint A', () => {
  it('backs up minimax and really prunes two leaves', () => {
    expect(minimax()).toEqual({ children: [3, 2, 1], value: 3, best: 0 });
    const a = alphaBeta();
    expect([a.value, a.visited, a.skipped]).toEqual([3, 4, 2]);
    expect(a.events.filter((e) => e.skipped).map((e) => e.value)).toEqual([
      9, 4,
    ]);
  });
  it('has all 12 sourced checkpoints and scaffold metadata', () => {
    expect(ai3.questions).toHaveLength(12);
    for (const q of ai3.questions) {
      expect(q.pages.length).toBeGreaterThan(0);
      expect(q.hints).toHaveLength(2);
      expect(q.misconception).toBeTruthy();
    }
  });
  it('records explanations without keyword grading', () => {
    const s = practice(
      {
        ...initialState,
        studentResponse: 'I am not sure; perhaps the bound excludes it.',
      },
      { ...ai3.questions[11]!, type: 'text' },
    );
    expect(s.completion['AI3-Q12']?.outcome).toBe('recorded');
    expect(s.lastFeedback).toContain('not automatically evaluated');
  });
  it('supports specific retry and worked-step help exposure', () => {
    const q = ai3.questions[2]!;
    const start = teachAction(
      goToCheckpoint(selectLesson(initialState, ai3, null), ai3, 2),
      ai3,
      'check',
    );
    let s = practice({ ...start, studentResponse: '5' }, q);
    expect(s.lastFeedback).toContain('MIN');
    s = practice({ ...teachAction(s, ai3, 'check'), studentResponse: '5' }, q);
    expect(s.completion[q.id]).toBeUndefined();
    expect(s.permittedHintLevel).toBe(2);
    expect(s.teaching.status).toBe('RETEACHING');
  });
  it('mode switching preserves dirty response and interruption checkpoint', () => {
    const s = interrupt(
      {
        ...initialState,
        studentResponse: 'my draft',
        stepId: 3,
        highlightTargetId: 'B',
      },
      'req',
    );
    const switched = { ...s, mode: 'world' as const };
    expect(switched.studentResponse).toBe('my draft');
    expect(resume(switched).stepId).toBe(3);
    expect(switched.interruptionCheckpoint?.highlight).toBe('B');
  });
  it('associates source only by hash', () => {
    expect(recognize(manifest.source_files[0]!.sha256)).toBe('ai3');
    expect(recognize('AI_Module_3.pdf')).toBeNull();
  });
  it('does not turn unknown into false', () => {
    expect(entail(['Bird(Tweety)'], 'CanFly(Tweety)').status).toBe(
      'not entailed',
    );
  });
  it('tests clock formula', () => {
    expect(elapsedTime(10, 0.6)).toBeCloseTo(8);
    expect(elapsedTime(10, 0.8)).toBeCloseTo(6);
    expect(() => elapsedTime(10, 1)).toThrow();
  });
  it('yields automatic clouds while typing', () => {
    expect(cueAllowed(true, false)).toBe(false);
    expect(cueAllowed(true, true)).toBe(true);
  });
  it('pins user-requested hints while automatic cues yield to input', () => {
    const cue = {
      text: 'Compare the two leaves.',
      kind: 'thought' as const,
      requested: true,
    };
    expect(yieldCue(cue)).toBe(cue);
    expect(yieldCue({ ...cue, requested: false })).toBeNull();
  });
});
