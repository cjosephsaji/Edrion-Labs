import { describe, expect, it } from 'vitest';
import { lessons } from '../lessons';
import {
  initialState,
  selectLesson,
  practice,
  interrupt,
  resume,
} from '../teaching/controller';
import {
  goToCheckpoint,
  teachAction,
  currentQuestion,
  continueCheckpoint,
} from '../teaching/checkpoint';
import { serializeSession, restoreSession } from '../teaching/persistence';
import { alphaBeta, minimax } from '../teaching/algorithms';
import { activeTree } from '../teaching/tree-variant';
const lesson = lessons[0]!;
const start = (i: number) =>
  teachAction(
    goToCheckpoint(selectLesson(initialState, lesson, null), lesson, i),
    lesson,
    'check',
  );
describe('refresh recovery and fresh applications', () => {
  it('round-trips a real interrupted response and assistance record, removing pending requests and uploaded contents', () => {
    let s = practice(
      { ...start(2), studentResponse: '8' },
      lesson.questions[2]!,
    );
    s = teachAction(s, lesson, 'check');
    s = { ...s, studentResponse: '3', mode: 'world' };
    s = interrupt(s, 'network-pending');
    const restored = restoreSession(serializeSession(s))!;
    expect(restored.mode).toBe('world');
    expect(restored.studentResponse).toBe('3');
    expect(restored.observations).toEqual(s.observations);
    expect(restored.pendingRequest).toBeNull();
    expect(restored.receipts).toEqual([]);
    expect(resume(restored).visualState).toEqual(
      s.interruptionCheckpoint?.visual,
    );
    expect(resume(restored).teaching.status).toBe('AWAITING_RESPONSE');
  });
  it.each([
    null,
    '{',
    '{}',
    '{"version":1}',
    '{"version":3,"state":{"lessonId":"missing"}}',
  ])('ignores missing, corrupted and obsolete persistence: %s', (raw) =>
    expect(restoreSession(raw)).toBeNull(),
  );
  it('requires a different application after a primary MAX/MIN success and keeps help distinct', () => {
    for (const index of [1, 2]) {
      let s = start(index);
      s = practice(
        { ...s, studentResponse: index === 1 ? '8' : '3' },
        lesson.questions[index]!,
      );
      expect(continueCheckpoint(s, lesson)).toEqual(s);
      const original = s.visualState;
      s = teachAction(s, lesson, 'practice');
      expect(s.visualState).not.toEqual(original);
      expect(s.observations[lesson.questions[index]!.id]?.assistance).toEqual(
        [],
      );
      s = practice(
        { ...s, studentResponse: currentQuestion(s, lesson).correct[0]! },
        lesson.questions[index]!,
      );
      expect(continueCheckpoint(s, lesson).questionId).not.toBe(s.questionId);
    }
  });
  it('uses the specified introductory tree in either mode and computes five actual visits', () => {
    const s = start(3),
      tree = activeTree(s.visualState);
    expect(tree).toEqual([
      [3, 5],
      [2, 9],
      [4, 1],
    ]);
    expect(minimax(tree).value).toBe(3);
    expect(alphaBeta(tree).visited).toBe(5);
    expect(
      alphaBeta(tree)
        .events.filter((e) => e.skipped)
        .map((e) => e.value),
    ).toEqual([9]);
  });
});
