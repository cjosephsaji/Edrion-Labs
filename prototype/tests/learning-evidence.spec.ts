import { describe, expect, it } from 'vitest';
import { ai4 } from '../lessons/ai4';
import { lessons } from '../lessons';
import {
  initialState,
  selectLesson,
  practice,
  interrupt,
  resume,
} from '../teaching/controller';
import {
  startLearning,
  skipDiagnostic,
  beginConceptTest,
  goToCheckpoint,
  teachAction,
  currentQuestion,
  continueCheckpoint,
  startFinalAssessment,
} from '../teaching/checkpoint';
import {
  conceptEvidence,
  progressSummary,
  validEvidence,
  assistance,
  mixedCheckResults,
} from '../teaching/learning-evidence';
import { restoreSession, serializeSession } from '../teaching/persistence';
import { validateResponse } from '../teaching/validation';
import { makeTopicLesson } from '../teaching/topic-content';
import { topicOutlineFixture } from './fixtures/topic-outline';
import { retrieveExplanation } from '../teaching/contextual-explanations';
import type { ShowcaseState } from '../teaching/types';
const start = (index = 4) =>
  goToCheckpoint(selectLesson(initialState, ai4, null), ai4, index);
const answer = (
  s: ShowcaseState,
  response = currentQuestion(s, ai4).correct[0]!,
) => practice({ ...s, studentResponse: response }, currentQuestion(s, ai4));
const apply = (s: ShowcaseState) => answer(teachAction(s, ai4, 'check'));
const evidence = (s: ShowcaseState, index = 4) =>
  conceptEvidence(s, ai4)[index]!;
describe('authored Learn / Apply / Test evidence', () => {
  it('offers two diagnostics and branches successful prerequisites directly to application without verification', () => {
    let s = startLearning(selectLesson(initialState, ai4, null), ai4);
    expect(s.learning?.activity).toBe('diagnostic');
    s = continueCheckpoint(answer(s), ai4, 'self-reported');
    s = continueCheckpoint(answer(s), ai4, 'self-reported');
    expect(s.evidence?.startingPoint).toBe('application');
    expect(s.learning?.stage).toBe('apply');
    expect(s.teaching.status).toBe('AWAITING_RESPONSE');
    expect(progressSummary(s, ai4).verified).toBe(0);
  });
  it.each([
    ['foundation', 'Bird(Lark)', 'Not established by these statements'],
    ['rule-repair', 'Bird(x) → HasWings(x)', 'Yes, reverse the rule'],
  ])('branches observed diagnostic errors to %s', (route, first, second) => {
    let s = startLearning(selectLesson(initialState, ai4, null), ai4);
    s = continueCheckpoint(answer(s, first), ai4, 'self-reported');
    s = continueCheckpoint(answer(s, second), ai4, 'self-reported');
    expect(s.evidence?.startingPoint).toBe(route);
    expect(s.learning?.introduction).toBeTruthy();
    expect(s.learning?.stage).toBe('learn');
  });
  it('allows skipping diagnostic and preserves an unassessed starting point', () => {
    const s = skipDiagnostic(
      startLearning(selectLesson(initialState, ai4, null), ai4),
      ai4,
    );
    expect(s.evidence?.diagnostic).toBe('skipped');
    expect(s.evidence?.attempts).toEqual([]);
    expect(s.learning?.stage).toBe('learn');
  });
  it('does not turn a demonstration, guided correct answer or continuation into verification', () => {
    let s = teachAction(start(), ai4, 'demonstrate');
    expect(evidence(s).status).toBe('Learning');
    s = apply(s);
    expect(evidence(s).verified).toBe(false);
    s = continueCheckpoint(s, ai4);
    expect(progressSummary(s, ai4).verified).toBe(0);
  });
  it('verifies one fresh unassisted correct application, without awarding retention', () => {
    let s = beginConceptTest(apply(start()), ai4);
    expect(currentQuestion(s, ai4).board?.facts).toEqual(['Sensor(Sora5)']);
    s = answer(s);
    expect(evidence(s).status).toBe('Verified now');
    expect(s.evidence?.attempts.at(-1)?.independent).toBe(true);
    expect(conceptEvidence(s, ai4).some((c) => c.status === 'Retained')).toBe(
      false,
    );
  });
  it('records help on an independent task and requires another unused variant', () => {
    let s = beginConceptTest(apply(start()), ai4);
    const first = currentQuestion(s, ai4).id;
    s = resume({ ...interrupt(s, ''), pendingRequest: null });
    s = answer(s);
    expect(evidence(s).status).toBe('Needs practice');
    expect(s.evidence?.attempts.at(-1)?.assisted).toBe(true);
    expect(s.evidence?.attempts.at(-1)?.independent).toBe(false);
    s = beginConceptTest(s, ai4);
    expect(currentQuestion(s, ai4).id).not.toBe(first);
    expect(currentQuestion(s, ai4).board?.facts).toEqual(['Plant(Milo5)']);
    s = answer(s);
    expect(evidence(s).verified).toBe(true);
  });
  it('remediates an unsupported conclusion, rather than treating a wrong answer as verification', () => {
    let s = beginConceptTest(apply(start()), ai4);
    s = answer(s, 'Calibrated(Sora5)');
    expect(evidence(s).status).toBe('Needs practice');
    expect(s.learning?.stage).toBe('apply');
    expect(s.teaching.status).toBe('RETEACHING');
    expect(s.highlightTargetId).toBe('unsupported');
    expect(s.evidence?.attempts.at(-1)?.intervention).toBe(
      'unsupported-conclusion',
    );
    expect(s.lastFeedback).toContain('not been supplied');
  });
  it('uses a different intervention for a reversed rule and neutral handling for an unknown error', () => {
    let s = beginConceptTest(apply(start(9)), ai4);
    s = answer(s, 'Sensor(Kit10)');
    expect(s.highlightTargetId).toBe('rule');
    expect(s.evidence?.attempts.at(-1)?.intervention).toBe('wrong-rule');
    const unknown = practice(
      {
        ...teachAction(start(0), ai4, 'check'),
        studentResponse: 'Only pictures',
      },
      ai4.questions[0]!,
    );
    expect(unknown.evidence?.attempts.at(-1)?.intervention).toBeNull();
  });
  it('blocks duplicate submissions and prevents a repeated question from manufacturing independent success', () => {
    const s = answer(beginConceptTest(apply(start()), ai4));
    expect(answer(s).evidence?.attempts).toHaveLength(
      s.evidence!.attempts.length,
    );
    const repeated = answer({
      ...s,
      teaching: { ...s.teaching, status: 'AWAITING_RESPONSE' },
      learning: { ...s.learning!, fresh: true },
    });
    expect(repeated.evidence?.attempts.at(-1)?.independent).toBe(false);
    expect(progressSummary(repeated, ai4).verified).toBe(1);
  });
  it('records skips and written explanations as unverified evidence', () => {
    const skipped = continueCheckpoint(
      beginConceptTest(apply(start()), ai4),
      ai4,
      'skipped',
    );
    expect(skipped.evidence?.attempts.at(-1)?.skipped).toBe(true);
    expect(skipped.evidence?.attempts.at(-1)?.independent).toBe(false);
    const written = answer(
      teachAction(start(11), ai4, 'check'),
      'TELL adds a fact and ASK checks a supported consequence.',
    );
    expect(written.evidence?.attempts.at(-1)?.validation).toBe('unverified');
    expect(evidence(written, 11).verified).toBe(false);
  });
  it('exhausts authored variants gracefully and retains evidence when going backwards', () => {
    let s = beginConceptTest(apply(start()), ai4);
    s = answer(s);
    s = beginConceptTest(s, ai4);
    s = answer(s);
    const attempts = s.evidence?.attempts;
    expect(beginConceptTest(s, ai4).lastFeedback).toContain('No unused');
    s = goToCheckpoint(s, ai4, 0, true);
    expect(s.evidence?.attempts).toEqual(attempts);
    expect(evidence(s).verified).toBe(true);
  });
  it('round-trips a genuine assisted task and mode change, rejecting old or corrupt envelopes', () => {
    let s = beginConceptTest(apply(start()), ai4);
    s = { ...interrupt(s, 'pending'), mode: 'world', studentResponse: 'draft' };
    const restored = restoreSession(serializeSession(s))!;
    expect(restored.evidence).toEqual(s.evidence);
    expect(restored.learning?.assisted).toBe(true);
    expect(restored.pendingRequest).toBeNull();
    expect(restored.mode).toBe('world');
    expect(resume(restored).studentResponse).toBe('draft');
    const old = JSON.parse(serializeSession(s));
    old.version = 3;
    expect(restoreSession(JSON.stringify(old))).toBeNull();
    old.version = 4;
    old.state.evidence.attempts[0].independent = true;
    old.state.evidence.attempts[0].assisted = true;
    expect(restoreSession(JSON.stringify(old))).toBeNull();
  });
  it('runs five mixed questions, records actual independent, assisted, incorrect and skipped outcomes, then resumes a weak concept', () => {
    let s = startFinalAssessment({ ...start(), phase: 'recap' }, ai4);
    s = continueCheckpoint(answer(s), ai4, 'self-reported');
    expect(currentQuestion(s, ai4).board?.rules).toHaveLength(2);
    s = continueCheckpoint(answer(s, 'CanFly(Elm)'), ai4, 'self-reported');
    s = resume({ ...interrupt(s, ''), pendingRequest: null });
    s = continueCheckpoint(answer(s), ai4, 'self-reported');
    s = continueCheckpoint(s, ai4, 'skipped');
    s = continueCheckpoint(answer(s), ai4, 'self-reported');
    expect(s.phase).toBe('recap');
    const attempts = s.evidence!.attempts.filter((a) => a.kind === 'final');
    expect(attempts).toHaveLength(5);
    expect(
      attempts.filter((a) => a.independent && a.validation === 'correct'),
    ).toHaveLength(2);
    expect(attempts.filter((a) => a.assisted)).toHaveLength(1);
    expect(attempts.filter((a) => a.skipped)).toHaveLength(1);
    const review = goToCheckpoint(s, ai4, 4, true);
    expect(review.phase).toBe('introduce');
    expect(review.evidence).toEqual(s.evidence);
  });
  it('authored questions have unique identities and coherent answers; the two-rule result really follows', () => {
    const x = ai4.experience!;
    const all = [
      ...x.diagnostic,
      ...Object.values(x.tests).flat(),
      ...x.final.map((e) => e.question),
    ];
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    expect(all).toHaveLength(31);
    for (const q of all) {
      expect(validateResponse(q, q.correct[0]!)).toBe('correct');
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options).size).toBe(3);
      expect(q.board).toBeTruthy();
      expect(ai4.questions.map((base) => base.task)).not.toContain(q.task);
    }
    const chain = x.final[1]!.question;
    const facts = new Set(chain.board!.facts);
    for (let pass = 0; pass < 4; pass++)
      for (const r of chain.board!.rules) {
        for (const f of [...facts]) {
          const name = f.slice(f.indexOf('(') + 1, -1);
          if (r.premise.replace('(x)', '(' + name + ')') === f)
            facts.add(r.conclusion.replace('(x)', '(' + name + ')'));
        }
      }
    expect(facts.has(chain.correct[0]!)).toBe(true);
    expect(facts.has('Tree(Bay)')).toBe(false);
  });
  it('keeps unsupported lessons functioning without inventing independent verification', () => {
    const l = lessons[0]!;
    let s = goToCheckpoint(selectLesson(initialState, l, null), l, 0);
    s = teachAction(s, l, 'check');
    s = practice(
      { ...s, studentResponse: currentQuestion(s, l).correct[0]! },
      currentQuestion(s, l),
    );
    expect(s.evidence?.attempts).toHaveLength(1);
    expect(progressSummary(s, l).verified).toBe(0);
    expect(validEvidence(s.evidence)).toBe(true);
  });
  it('groups multiple tasks under the actual eight minimax concepts', () => {
    const l = lessons[0]!;
    let s = goToCheckpoint(selectLesson(initialState, l, null), l, 3);
    s = goToCheckpoint(s, l, 4, true);
    s = goToCheckpoint(s, l, 5, true);
    const summary = progressSummary(s, l);
    expect(summary.concepts).toHaveLength(8);
    expect(summary.visited).toBe(1);
    expect(summary.verified).toBe(0);
    expect(summary.concepts[3]?.questionIndex).toBe(3);
  });
  it('counts mixed questions separately from repeated response attempts', () => {
    let s = startFinalAssessment({ ...start(), phase: 'recap' }, ai4);
    s = answer(s, 'not a supplied option');
    s = answer(s);
    expect(s.evidence?.attempts).toHaveLength(2);
    const summary = mixedCheckResults(s);
    expect(summary.questions).toHaveLength(1);
    expect(summary.correct).toBe(0);
    s = continueCheckpoint(s, ai4, 'skipped');
    expect(s.evidence?.attempts).toHaveLength(2);
    expect(mixedCheckResults(s).skipped).toBe(0);
  });
  it('answers contextual help against the actual assessment premises rather than the previous bird diagram', () => {
    const s = beginConceptTest(apply(start()), ai4);
    const hint = retrieveExplanation(s, ai4, 'Why is this rule relevant?');
    expect(hint?.text).toContain('Sensor(Sora5)');
    expect(hint?.text).toContain('Sensor(x) → Online(x)');
    expect(hint?.text).not.toContain('Bird(Tweety)');
    expect(hint?.label).toBe('Authored assessment hint');
  });
  it('keeps diagnostics and independent questions intact when another example is requested', () => {
    for (const s of [
      startLearning(selectLesson(initialState, ai4, null), ai4),
      beginConceptTest(apply(start()), ai4),
    ]) {
      const helped = teachAction(s, ai4, 'example');
      expect(currentQuestion(helped, ai4).id).toBe(currentQuestion(s, ai4).id);
      expect(helped.learning?.activity).toBe(s.learning?.activity);
      expect(helped.learning?.stage).toBe('test');
      expect(helped.learning?.assisted).toBe(true);
      expect(helped.studentResponse).toBe(s.studentResponse);
    }
  });
  it('records partial answers without independent verification and rejects duplicate multi-select values', () => {
    const l = lessons.find((entry) => entry.id === 'ehs5')!;
    const index = l.questions.findIndex(
      (q) => q.type === 'multi' && q.correct.length > 1,
    );
    let s = teachAction(
      goToCheckpoint(selectLesson(initialState, l, null), l, index),
      l,
      'check',
    );
    const q = currentQuestion(s, l);
    s = practice({ ...s, studentResponse: q.correct[0]! }, q);
    expect(s.evidence?.attempts.at(-1)?.validation).toBe('partial');
    expect(s.evidence?.attempts.at(-1)?.intervention).toBe('partial');
    expect(progressSummary(s, l).verified).toBe(0);
    expect(validateResponse(q, q.correct[0] + '|' + q.correct[0])).toBe(
      'unclear',
    );
  });
  it('recognizes repeated failure across variants of the same skill and offers a different teaching move', () => {
    let s = teachAction(start(), ai4, 'check');
    for (let i = 0; i < 3; i++) {
      const q = currentQuestion(s, ai4);
      s = answer(s, q.options.find((v) => !q.correct.includes(v))!);
      if (i < 2) s = teachAction(s, ai4, 'check');
    }
    expect(s.evidence?.attempts.at(-1)?.intervention).toBe('repeated');
    expect(s.lastFeedback).toContain('Repeating this check is not helping');
    const example = teachAction(s, ai4, 'example');
    expect(example.teaching.variant).toBe('second-example');
    expect(evidence(example).verified).toBe(false);
  });
  it('does not burn another variant or final question on a duplicate opening action', () => {
    const s = beginConceptTest(apply(start()), ai4);
    expect(beginConceptTest(s, ai4)).toEqual(s);
    const final = startFinalAssessment({ ...start(), phase: 'recap' }, ai4);
    expect(startFinalAssessment(final, ai4)).toEqual(final);
    const diagnostic = startLearning(
      selectLesson(initialState, ai4, null),
      ai4,
    );
    expect(startLearning(diagnostic, ai4)).toEqual(diagnostic);
  });
  it('records source help on the current independent task and does not validate an unsupported response', () => {
    const s = beginConceptTest(apply(start()), ai4);
    const assisted = answer(assistance(s, 'read-source'));
    expect(assisted.evidence?.attempts.at(-1)?.assistance).toContain(
      'read-source',
    );
    expect(evidence(assisted).verified).toBe(false);
    const invalid = answer(s, 'not an available candidate');
    expect(invalid.evidence?.attempts.at(-1)?.validation).toBe('unclear');
    expect(evidence(invalid).verified).toBe(false);
    expect(invalid.teaching.status).toBe('AWAITING_RESPONSE');
  });
  it.each([true, false])(
    'treats generated answer-key comparison as unverified, whether a choice matches: %s',
    (matches) => {
      const l = makeTopicLesson(
        topicOutlineFixture,
        'generated',
        'topic-unqualified-key',
      );
      let s = teachAction(
        goToCheckpoint(selectLesson(initialState, l, null), l, 0),
        l,
        'check',
      );
      const q = currentQuestion(s, l);
      const response = matches
        ? q.correct[0]!
        : q.options.find((v) => !q.correct.includes(v))!;
      s = practice({ ...s, studentResponse: response }, q);
      expect(s.evidence?.attempts.at(-1)?.validation).toBe('unverified');
      expect(s.observations[q.id]?.responses.at(-1)?.validation).toBe(
        'unverified',
      );
      expect(s.teaching.status).toBe(matches ? 'READY_TO_CONTINUE' : 'RETEACHING');
      expect(s.completion[q.id]?.outcome).toBe(matches ? 'recorded' : undefined);
      expect(s.lastFeedback).toContain('not an independently validated answer');
      expect(progressSummary(s, l).verified).toBe(0);
    },
  );
});
