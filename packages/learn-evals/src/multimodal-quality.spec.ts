import { describe, expect, it } from 'vitest';
import { MULTIMODAL_QUALITY_CASES } from './fixtures/multimodal';
import { evaluateTranscript } from './rubrics/structural';
import { runFixtureSession } from './runner/fixture-driver';

describe('Stage 5 quality rubrics over Stage 9 multimodal entrances', () => {
  for (const qualityCase of MULTIMODAL_QUALITY_CASES) {
    it(`${qualityCase.entryMode} preserves correctness, pedagogy, pacing, and artifact ownership`, () => {
      const transcript = runFixtureSession({
        runId: 'petros-stage9-multimodal-fixture-v1',
        case: qualityCase,
        persona: 'fast_confident',
        runSeed: 9_009,
      });
      const result = evaluateTranscript(transcript, qualityCase);
      expect(result.blockingFailures).toEqual([]);
      expect(result.scores.find((score) => score.dimension === 'correctness')?.score).toBe(5);
      expect(result.scores.find((score) => score.dimension === 'pacing')?.score).toBe(5);
      expect(transcript.moves.every((move) => !/provider:|model:|credential/i.test(move.content))).toBe(true);
      if (qualityCase.goal !== 'doubt') {
        expect(transcript.moves.find((move) => move.type === 'artifact_commit')).toMatchObject({ artifactProposed: true, studentConsentRequired: true });
      }
      if (qualityCase.entryMode === 'five_minute') {
        expect(transcript.moves.map((move) => move.type)).toEqual(['predict_then_reveal', 'layered_explanation', 'recall_check', 'artifact_commit']);
      }
    });
  }
});
