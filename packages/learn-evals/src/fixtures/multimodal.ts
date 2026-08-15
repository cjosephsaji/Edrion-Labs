import type { QualityCase } from './manifest';
import { QUALITY_CASES } from './manifest';

const byTopic = (key: string) => QUALITY_CASES.find((item) => item.topic.key === key)!;

function modalityCase(base: QualityCase, patch: Partial<QualityCase>): QualityCase {
  return {
    ...base,
    ...patch,
    provenance: {
      licence: 'CC0-1.0',
      source: 'Edrion-authored synthetic fixture',
      copyrightedText: false,
    },
  };
}

/** Stage 9 derivatives keep the frozen Stage 5 factual corpus while exercising each new entrance. */
export const MULTIMODAL_QUALITY_CASES: QualityCase[] = [
  modalityCase(byTopic('topic:quadratic-formula'), {
    id: 'pq-mm-snap-quadratic',
    goal: 'doubt',
    entryMode: 'snap_question',
    timeBudgetMinutes: 8,
    expectedMoves: ['layered_explanation', 'recall_check', 'synthesis'],
    rubricAnchors: ['Begin at a confirmed stuck point.', 'Teach one setup step before any complete solution.'],
    seed: 91_001,
  }),
  modalityCase(byTopic('topic:integration-by-parts'), {
    id: 'pq-mm-handwriting-integration',
    goal: 'repair',
    entryMode: 'handwriting',
    timeBudgetMinutes: 10,
    expectedMoves: ['worked_example', 'recall_check', 'artifact_commit', 'synthesis'],
    rubricAnchors: ['Teach the first logical break.', 'Keep later consequence errors distinct and support a reattempt.'],
    seed: 91_002,
  }),
  modalityCase(byTopic('topic:photosynthesis'), {
    id: 'pq-mm-voice-photosynthesis',
    goal: 'learn',
    entryMode: 'voice',
    timeBudgetMinutes: 10,
    expectedMoves: ['predict_then_reveal', 'layered_explanation', 'recall_check', 'artifact_commit'],
    rubricAnchors: ['Keep every spoken move concise.', 'Keep all essential information in the transcript.'],
    seed: 91_003,
  }),
  modalityCase(byTopic('topic:ohm-law'), {
    id: 'pq-mm-five-minute-ohm',
    goal: 'learn',
    entryMode: 'five_minute',
    timeBudgetMinutes: 5,
    expectedMoves: ['predict_then_reveal', 'layered_explanation', 'recall_check', 'artifact_commit'],
    rubricAnchors: ['Exactly one guess, teaching move, check, and card.', 'Never expand automatically.'],
    seed: 91_004,
  }),
];
