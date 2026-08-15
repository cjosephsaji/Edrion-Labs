import { describe, expect, it } from 'vitest';
import {
  TEACH_BACK_PERSONAS,
  TEACH_BACK_QUALITY_CASES,
  evaluateTeachBackQuality,
  idealTeachBackCandidate,
} from './fixtures/teach-back';

describe('Stage 10 Teach-it-back quality corpus', () => {
  it('covers all six required explanation personas', () => {
    expect(TEACH_BACK_QUALITY_CASES.map((item) => item.persona)).toEqual(TEACH_BACK_PERSONAS);
  });

  it.each(TEACH_BACK_QUALITY_CASES)(
    '$persona produces supported deterministic evidence',
    (qualityCase) => {
      const result = evaluateTeachBackQuality(qualityCase, idealTeachBackCandidate(qualityCase));
      expect(result.blockingFailures).toEqual([]);
      expect(result.evidence.length).toBeGreaterThan(0);
    },
  );

  it('catches an irrelevant follow-up', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[1]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    candidate.followUp = {
      ...(candidate.followUp as object),
      gapType: 'weak_example',
    };
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'follow_up_relevance',
    );
  });

  it('catches mocking junior language', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[2]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    candidate.followUp = {
      ...(candidate.followUp as object),
      juniorTransition: 'Obviously, even a child should know this.',
    };
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'tone_mocking',
    );
  });

  it('catches an overly lecturing first probe', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[1]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    candidate.followUp = {
      ...(candidate.followUp as object),
      helpAfterCap: 'Here is the full explanation before you have a chance to answer.',
    };
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'non_takeover',
    );
  });

  it('catches repetitive probing', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[4]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    candidate.priorQuestions = [(candidate.followUp as { question: string }).question];
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'repetitive_probe',
    );
  });

  it('catches unsupported verdict evidence', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[0]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    const verdict = candidate.verdict as {
      clear: Array<{ evidence: { excerpt: string } }>;
    };
    verdict.clear[0]!.evidence.excerpt = 'A claim the student never made.';
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'verdict_evidence',
    );
  });

  it('keeps STT corruption out of misconception evidence and follow-ups', () => {
    const qualityCase = TEACH_BACK_QUALITY_CASES[5]!;
    const candidate = idealTeachBackCandidate(qualityCase);
    candidate.analysis = {
      ...(candidate.analysis as object),
      speechRecognitionUncertain: false,
      primaryGap: {
        type: 'misconception',
        description: 'The corrupted words appear wrong.',
        evidence: {
          segmentId: '11111111-1111-4111-8111-111111111111',
          excerpt: qualityCase.explanation,
        },
        confidence: 0.9,
      },
      needsFollowUp: true,
    };
    expect(evaluateTeachBackQuality(qualityCase, candidate).blockingFailures.join('\n')).toContain(
      'stt_boundary',
    );
  });
});
