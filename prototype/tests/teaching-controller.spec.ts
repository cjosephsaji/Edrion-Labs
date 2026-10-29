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
  continueCheckpoint,
  currentQuestion,
  goToCheckpoint,
  teachAction,
} from '../teaching/checkpoint';
import { teachingPlan } from '../teaching/curriculum';
import { lessonForState } from '../teaching/tree-variant';
import { retrieveExplanation } from '../teaching/contextual-explanations';
const ai3 = lessons[0]!;
function start(index = 0) {
  return goToCheckpoint(selectLesson(initialState, ai3, null), ai3, index);
}
function ask(s: ReturnType<typeof start>, lesson = ai3) {
  return teachAction(
    teachAction(teachAction(s, lesson, 'demonstrate'), lesson, 'check'),
    lesson,
    'answer',
  );
}
describe('student-paced instructional decisions', () => {
  it('requires a response and explicit continuation before the next concept', () => {
    let s = ask(start(1));
    expect(continueCheckpoint(s, ai3)).toEqual(s);
    s = practice({ ...s, studentResponse: '7' }, currentQuestion(s, ai3));
    expect(s.teaching.status).toBe('READY_TO_CONTINUE');
    expect(s.questionId).toBe('AI3-Q02');
    expect(s.observations['AI3-Q02']?.explicitContinuation).toBe(false);
    s = continueCheckpoint(s, ai3);
    expect(s.questionId).toBe('AI3-Q03');
    expect(s.observations['AI3-Q02']?.continuation).toBe('validated');
  });
  it('diagnoses the MIN misconception and checks different actual values before continuation', () => {
    let s = practice(
      { ...ask(start(2)), studentResponse: '5' },
      ai3.questions[2]!,
    );
    expect(s.questionId).toBe('AI3-Q03');
    expect(s.misconceptionCategory).toBe('MIN-maximizes-MAX-score');
    expect(s.completion['AI3-Q03']).toBeUndefined();
    expect(
      s.visualState.kind === 'tree' && s.visualState.example?.values,
    ).toEqual([2, 6]);
    expect(continueCheckpoint(s, ai3)).toEqual(s);
    s = teachAction(teachAction(s, ai3, 'check'), ai3, 'answer');
    const follow = currentQuestion(s, ai3);
    expect(follow.correct).toEqual(['1']);
    expect(
      s.visualState.kind === 'tree' && s.visualState.example?.values,
    ).toEqual([1, 7]);
    s = practice({ ...s, studentResponse: '1' }, ai3.questions[2]!);
    expect(s.lastFeedback).toContain('min(1,7)=1');
    expect(s.questionId).toBe('AI3-Q03');
    expect(
      s.observations['AI3-Q03']?.responses.map((r) => r.validation),
    ).toEqual(['incorrect', 'correct']);
    expect(continueCheckpoint(s, ai3).questionId).toBe('AI3-Q04');
  });
  it('does not convert repeated wrong answers into completion', () => {
    let s = practice(
      { ...ask(start(2)), studentResponse: '5' },
      ai3.questions[2]!,
    );
    s = teachAction(teachAction(s, ai3, 'check'), ai3, 'answer');
    s = practice({ ...s, studentResponse: '7' }, ai3.questions[2]!);
    expect(s.teaching.variant).toBe('second-example');
    expect(s.observations['AI3-Q03']?.retries).toBe(2);
    expect(s.completion['AI3-Q03']).toBeUndefined();
    expect(s.questionId).toBe('AI3-Q03');
  });
  it('separates skipping, self-report and validated practice evidence', () => {
    const skipped = continueCheckpoint(start(1), ai3, 'skipped');
    expect(skipped.completion['AI3-Q02']?.outcome).toBe('skipped');
    expect(skipped.observations['AI3-Q02']?.responses).toEqual([]);
    const understood = continueCheckpoint(start(1), ai3, 'self-reported');
    expect(understood.completion['AI3-Q02']).toBeUndefined();
    expect(understood.observations['AI3-Q02']?.continuation).toBe(
      'self-reported',
    );
  });
  it('keeps ambiguous and free explanations unqualified', () => {
    let s = practice(
      { ...ask(start(5)), studentResponse: 'maybe three' },
      ai3.questions[5]!,
    );
    expect(s.observations['AI3-Q06']?.responses[0]?.validation).toBe('unclear');
    expect(s.teaching.status).toBe('AWAITING_RESPONSE');
    s = practice(
      { ...ask(start(11)), studentResponse: 'I do not know' },
      ai3.questions[11]!,
    );
    expect(s.observations['AI3-Q12']?.responses[0]?.validation).toBe(
      'unverified',
    );
    expect(s.completion['AI3-Q12']?.outcome).toBe('recorded');
    expect(continueCheckpoint(s, ai3)).toEqual(s);
  });
  it('retains supported portions of a partially correct multi-selection', () => {
    const lesson = lessons.find((l) => l.id === 'ehs5')!;
    const s = goToCheckpoint(
      selectLesson(initialState, lesson, null),
      lesson,
      10,
    );
    const partial = practice(
      { ...ask(s, lesson), studentResponse: 'Treat wastewater' },
      lesson.questions[10]!,
    );
    expect(partial.lastFeedback).toContain(
      'supported controls: Treat wastewater',
    );
    expect(partial.observations['EHS5-Q11']?.responses[0]?.validation).toBe(
      'partial',
    );
    expect(partial.completion['EHS5-Q11']).toBeUndefined();
  });
  it('preserves visual, draft, checkpoint and correctness across interruption and both modes', () => {
    let s = { ...ask(start(3)), studentResponse: 'my draft' };
    const saved = structuredClone(s);
    s = interrupt(s, 'ask');
    expect(s.teaching.status).toBe('INTERRUPTED');
    expect(continueCheckpoint(s, ai3, 'self-reported')).toEqual(s);
    s = resume({ ...s, pendingRequest: null, mode: 'world' });
    expect(s.visualState).toEqual(saved.visualState);
    expect(s.studentResponse).toBe('my draft');
    expect(s.teaching).toEqual(saved.teaching);
    const classic = practice(
      { ...s, mode: 'classic', studentResponse: '2' },
      ai3.questions[3]!,
    );
    const world = practice(
      { ...s, mode: 'world', studentResponse: '2' },
      ai3.questions[3]!,
    );
    expect(classic.observations).toEqual(world.observations);
    expect(classic.completion).toEqual(world.completion);
    expect(lessonForState(ai3, { ...s, mode: 'world' })?.questions).toEqual(
      lessonForState(ai3, { ...s, mode: 'classic' })?.questions,
    );
  });
  it('provides distinct explanations, worked examples and qualified follow-ups for all 64 checkpoints', () => {
    for (const lesson of lessons)
      for (const q of lesson.questions) {
        const s = goToCheckpoint(
          selectLesson(initialState, lesson, null),
          lesson,
          lesson.questions.indexOf(q),
        );
        const plan = teachingPlan(s, lesson, q);
        expect(plan.introduction).not.toBe(plan.simpler);
        expect(plan.demonstration).not.toBe(plan.simpler);
        expect(plan.example.length).toBeGreaterThan(25);
        expect(plan.followup.id).not.toBe(q.id);
        expect(plan.followup.correct.length).toBeGreaterThan(0);
      }
  });
  it('grounds a natural numeric interruption in the actual worked example', () => {
    const s = teachAction(start(2), ai3, 'demonstrate');
    const reply = retrieveExplanation(
      s,
      ai3,
      'Why did you choose that number?',
    )!;
    expect(reply.text).toContain('min(1, 4) = 1');
    expect(reply.target).toBe(s.highlightTargetId);
  });
});

describe('conversation recovery and application boundaries', () => {
  it('preserves a pending prepared teaching variant through a second interruption', () => {
    const original = start(2);
    const simpler = teachAction(original, ai3, 'simpler');
    const paused = {
      ...interrupt(original, 'first'),
      pendingRequest: null,
      interruptionCheckpoint: {
        questionId: original.questionId,
        stepId: original.stepId,
        highlight: original.highlightTargetId,
        visual: simpler.visualState,
        sceneStation: original.sceneStation,
        teaching: simpler.teaching,
      },
    };
    const again = interrupt(paused, 'second');
    const restored = resume({ ...again, pendingRequest: null });
    expect(restored.teaching.status).toBe('RETEACHING');
    expect(restored.visualState).toEqual(simpler.visualState);
    expect(resume(again)).toEqual(again);
  });
  it('conceals the new tree guarantees until an application response is recorded', () => {
    let s = ask(start(11));
    expect(s.visualState.kind === 'tree' && s.visualState.transfer).toBe(true);
    expect(s.visualState.kind === 'tree' && s.visualState.reveal).toBe(1);
    s = practice(
      { ...s, studentResponse: 'A, because its smaller child is 4.' },
      ai3.questions[11]!,
    );
    expect(s.visualState.kind === 'tree' && s.visualState.reveal).toBe(3);
    expect(s.observations['AI3-Q12']?.responses[0]?.validation).toBe(
      'unverified',
    );
  });
  it('changes actual KB and model state only after the permitted checked action', () => {
    const kb = lessons[1]!;
    let s = goToCheckpoint(selectLesson(initialState, kb, null), kb, 4);
    expect(s.visualState.kind === 'kb' && s.visualState.derived).toEqual([]);
    s = practice(
      { ...ask(s, kb), studentResponse: 'HasWings(Tweety)' },
      kb.questions[4]!,
    );
    expect(s.visualState.kind === 'kb' && s.visualState.derived).toContain(
      'HasWings(Tweety)',
    );
    const model = lessons.find((l) => l.id === 'open-ai')!;
    s = goToCheckpoint(selectLesson(initialState, model, null), model, 5);
    s = practice(
      { ...ask(s, model), studentResponse: 'Weight set to 1.5' },
      model.questions[5]!,
    );
    expect(s.visualState.kind === 'network' && s.visualState.weight).toBe(1.5);
  });
});

it('distinguishes an explicitly named node from an article in a contextual request', () => {
  const s = teachAction(start(3), ai3, 'demonstrate');
  const named = retrieveExplanation(s, ai3, 'Why did MIN A choose 3?')!;
  expect(named.target).toBe('branch-0');
  expect(named.text).toContain('min(3, 5) = 3');
  const contextual = retrieveExplanation(
    s,
    ai3,
    'Why choose a smaller number here?',
  )!;
  expect(contextual.target).toBe('branch-1');
  expect(contextual.text).toContain('min(2, 9) = 2');
});

it('marks a pruned edge when its actual cutoff response is validated', () => {
  let s = practice(
    { ...ask(start(8)), studentResponse: 'Yes' },
    ai3.questions[8]!,
  );
  expect(s.visualState.kind === 'tree' && s.visualState.pruneStep).toBe(4);
  expect(s.questionId).toBe('AI3-Q09');
  s = practice({ ...ask(start(9)), studentResponse: '4' }, ai3.questions[9]!);
  expect(s.visualState.kind === 'tree' && s.visualState.pruneStep).toBe(6);
  expect(s.questionId).toBe('AI3-Q10');
});
