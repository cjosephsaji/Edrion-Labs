import { describe, expect, it } from 'vitest';
import {
  buildInvestigation,
  freshProgress,
  advanceInvestigation,
} from '../core/investigation';
import {
  causalStops,
  doubtsFor,
  focusText,
  matchDoubts,
  nextMove,
  primers,
} from '../core/learning-guide';
import { TOPICS } from '../simulations/runtime';
import { frameInsight } from '../core/investigation-playback';

describe('shared learning guidance', () => {
  it('supports all fifteen cases without non-finite values or missing explanations', () => {
    for (const topic of TOPICS)
      for (const index of [0, 1, 2]) {
        const task = buildInvestigation(topic, index);
        expect(primers[topic].terms).toHaveLength(3);
        for (const frame of [
          0,
          Math.floor(task.frames.length / 2),
          task.frames.length - 1,
        ]) {
          for (const revealed of [false, true]) {
            const doubts = doubtsFor(task, frame, revealed);
            expect(new Set(doubts.map((doubt) => doubt.id)).size).toBe(
              doubts.length,
            );
            expect(doubts).toHaveLength(8);
            for (const doubt of doubts) {
              expect(doubt.answer.length).toBeGreaterThan(40);
              expect(doubt.answer).not.toMatch(/undefined|NaN|Infinity/);
            }
          }
        }
        for (const stage of [
          'predict',
          'observe',
          'explain',
          'reflect',
        ] as const)
          expect(nextMove(stage, task).goal).toBe(primers[topic].goal);
        for (const focus of ['change', 'measure', 'compare'] as const)
          expect(focusText(task, focus).length).toBeGreaterThan(20);
      }
  });
  it('walks through the visible values and does not reveal changed numbers before a prediction', () => {
    const task = buildInvestigation('neural');
    expect(
      doubtsFor(task, 12, true).find((d) => d.id === 'numbers')?.answer,
    ).toContain('2 × 0.8 = 1.6');
    expect(
      doubtsFor(task, 24, false).find((d) => d.id === 'numbers')?.answer,
    ).toContain('2 × 0.5 = 1');
    expect(
      doubtsFor(task, 24, false).find((d) => d.id === 'numbers')?.answer,
    ).not.toContain('2.2');
    expect(
      doubtsFor(task, 0, true).find((d) => d.id === 'why')?.answer,
    ).toMatch(/^At the end of this experiment:/);
  });
  it('finds relevant authored answers and reports unsupported questions without invented replies', () => {
    const doubts = doubtsFor(buildInvestigation('rocket'), 0, false);
    expect(matchDoubts(doubts, 'what does velocity mean')[0].id).toBe('term-0');
    expect(matchDoubts(doubts, 'walk through the numbers')[0].id).toBe(
      'numbers',
    );
    expect(matchDoubts(doubts, 'photosynthesis')).toEqual([]);
    expect(matchDoubts(doubts, 'the')).toEqual([]);
  });
  it('ties causal explanations to actual checkpoints, including discrete attention changes', () => {
    for (const topic of TOPICS)
      for (const index of [0, 1, 2]) {
        const task = buildInvestigation(topic, index);
        const stops = causalStops(task);
        expect(stops[0].frame).toBe(0);
        expect(stops.at(-1)?.frame).toBe(task.frames.length - 1);
        expect(new Set(stops.map((stop) => stop.frame)).size).toBe(
          stops.length,
        );
        for (const stop of stops)
          expect(stop.text).toContain(frameInsight(task, stop.frame).text);
        if (topic === 'attention')
          expect(stops.map((stop) => stop.frame)).toEqual([0, 1]);
      }
  });
  it('keeps help as assistance and allows a retry without erasing the original evidence', () => {
    const task = buildInvestigation('rocket');
    let progress = advanceInvestigation(freshProgress(), task, {
      type: 'hint',
    });
    progress = advanceInvestigation(progress, task, {
      type: 'predict',
      id: task.correctPrediction,
    });
    progress = advanceInvestigation(progress, task, { type: 'inspect' });
    progress = advanceInvestigation(progress, task, {
      type: 'explain',
      id: task.correctReason,
    });
    expect(progress.attempts[0].hint).toBe(true);
    const retry = advanceInvestigation(progress, task, {
      type: 'revisit',
      caseIndex: 0,
    });
    expect(retry.stage).toBe('predict');
    expect(retry.hint).toBe(false);
    expect(retry.attempts).toEqual(progress.attempts);
  });
});
