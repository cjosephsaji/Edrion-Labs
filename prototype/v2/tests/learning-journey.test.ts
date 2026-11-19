import { describe, expect, it } from 'vitest';
import { buildInvestigation } from '../core/investigation';
import { observationJourney } from '../core/learning-journey';
import { TOPICS } from '../simulations/runtime';

describe('guided comparison navigation', () => {
  for (const topic of TOPICS) for (const caseIndex of [0, 1, 2]) {
    it(`${topic} case ${caseIndex + 1} reaches the outcome and can return to the start`, () => {
      const task = buildInvestigation(topic, caseIndex);
      let frame = 0;
      let journey = observationJourney(task, frame);
      expect(journey.previous).toBeUndefined();
      expect(journey.atEnd).toBe(false);
      const visited = [frame];
      while (journey.next) {
        expect(journey.next.index).toBeGreaterThan(frame);
        frame = journey.next.index;
        visited.push(frame);
        journey = observationJourney(task, frame);
      }
      expect(frame).toBe(task.frames.length - 1);
      expect(journey.atEnd).toBe(true);
      expect(visited).toHaveLength(topic === 'attention' ? 2 : 3);
      while (journey.previous) {
        expect(journey.previous.index).toBeLessThan(frame);
        frame = journey.previous.index;
        journey = observationJourney(task, frame);
      }
      expect(frame).toBe(0);
      if (task.frames.length > 3) {
        const between = observationJourney(task, 1);
        expect(between.previous?.index).toBe(0);
        expect(between.next!.index).toBeGreaterThan(1);
        expect(between.current).toBe(0);
      }
    });
  }
});
