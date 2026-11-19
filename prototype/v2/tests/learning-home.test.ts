import { describe, expect, it } from 'vitest';
import {
  advanceInvestigation,
  buildInvestigation,
  freshInvestigationSession,
  freshProgress,
  openInvestigation,
  parseInvestigationSession,
  type Progress,
} from '../core/investigation';
import {
  findQuestions,
  investigationHref,
  learningQuestions,
  learningRecord,
  nextStep,
} from '../core/learning-home';

function complete(
  progress = freshProgress(),
  correct = true,
  hint = false,
): Progress {
  const task = buildInvestigation('traffic', progress.caseIndex);
  let p = advanceInvestigation(progress, task, {
    type: 'predict',
    id: task.correctPrediction,
  });
  if (hint) p = advanceInvestigation(p, task, { type: 'hint' });
  p = advanceInvestigation(p, task, { type: 'inspect' });
  return advanceInvestigation(p, task, {
    type: 'explain',
    id: correct
      ? task.correctReason
      : task.reasons.find((choice) => choice.id !== task.correctReason)!.id,
  });
}

describe('a question-led entrance', () => {
  it('offers only actual authored investigations, with valid deep links and three cases', () => {
    expect(new Set(learningQuestions.map((q) => q.topic)).size).toBe(5);
    for (const q of learningQuestions) {
      expect(investigationHref(q.topic)).toBe(
        `/prototype?view=2d&lesson=${q.topic}`,
      );
      for (const i of [0, 1, 2])
        expect(buildInvestigation(q.topic, i).topic).toBe(q.topic);
    }
  });
  it('finds plain-language topics without matching short words inside unrelated words', () => {
    expect(
      findQuestions('I want to understand AI').map((q) => q.topic),
    ).toEqual(['neural', 'attention']);
    expect(findQuestions('why do traffic jams happen')[0].topic).toBe(
      'traffic',
    );
    expect(findQuestions('forces')[0].topic).toBe('rocket');
    expect(findQuestions('time')[0].topic).toBe('relativity');
    expect(findQuestions('biology')).toEqual([]);
    expect(findQuestions('the')).toEqual([]);
    expect(findQuestions('')).toHaveLength(5);
  });
  it('recommends the next unfinished action instead of counting an opened topic as learned', () => {
    expect(nextStep(freshProgress()).label).toBe('Your question is waiting');
    expect(nextStep({ ...freshProgress(), stage: 'observe' }).label).toBe(
      'Your experiment is ready',
    );
    expect(nextStep({ ...freshProgress(), stage: 'explain' }).label).toBe(
      'Connect the cause and effect',
    );
    const record = learningRecord({
      ...freshInvestigationSession(),
      active: 'traffic',
      topics: { traffic: freshProgress() },
    });
    expect(record[0]).toMatchObject({ explored: 0, explained: 0, assisted: 0 });
  });
  it('opens the requested topic without replacing its answers or another topic’s progress', () => {
    const traffic = complete();
    const session = {
      ...freshInvestigationSession(),
      topics: { traffic, neural: freshProgress(1) },
    };
    const opened = openInvestigation(session, 'traffic');
    expect(opened.active).toBe('traffic');
    expect(opened.topics.traffic).toBe(traffic);
    expect(opened.topics.neural).toBe(session.topics.neural);
    const restored = parseInvestigationSession(JSON.stringify(opened));
    expect(openInvestigation(restored).topics.traffic?.stage).toBe('reflect');
    expect(openInvestigation(opened, 'rocket').topics.rocket).toEqual(
      freshProgress(),
    );
    expect(session.topics).not.toHaveProperty('rocket');
  });
  it('recommends feedback after an incorrect explanation and independent practice after a hint', () => {
    expect(nextStep(complete(freshProgress(), false)).label).toBe(
      'Let’s untangle the explanation',
    );
    expect(nextStep(complete(freshProgress(), true, true)).label).toBe(
      'A little less help this time',
    );
    expect(nextStep(complete()).label).toBe('See if your idea holds up');
    expect(nextStep(complete(freshProgress(2))).label).toBe(
      'Bring your three cases together',
    );
  });
  it('keeps repeated attempts from inflating progress and uses the latest explanation', () => {
    const first = complete(freshProgress(), false);
    const retry = advanceInvestigation(first, buildInvestigation('traffic'), {
      type: 'revisit',
      caseIndex: 0,
    });
    const corrected = complete(retry, true, true);
    const session = {
      ...freshInvestigationSession(),
      active: 'traffic' as const,
      topics: { traffic: corrected },
    };
    const [record] = learningRecord(
      parseInvestigationSession(JSON.stringify(session)),
    );
    expect(record).toMatchObject({ explored: 1, explained: 1, assisted: 1 });
    expect(record.progress.attempts).toHaveLength(2);
  });
});
