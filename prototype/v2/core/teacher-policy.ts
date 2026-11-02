export const moves = [
  'diagnose',
  'demonstrate',
  'predict_then_reveal',
  'invite_experiment',
  'respond_to_misconception',
  'change_representation',
  'provide_hint',
  'explain_result',
  'transfer_check',
  'summarize',
] as const;
export type Move = (typeof moves)[number];
export type Assessment =
  | 'correct'
  | 'wrong'
  | 'ambiguous'
  | 'skipped'
  | 'interrupted'
  | 'question';
export interface Evidence {
  question: string;
  answer: string;
  assessment: Assessment;
  move: Move;
  assistance: number;
  at: number;
}
/** Evidence is not a mastery score. No timer/audio/button can promote mastery. */
export function policy(evidence: Evidence[]) {
  const last = evidence.at(-1);
  return {
    allowedMoves:
      last?.assessment === 'wrong'
        ? [
            'respond_to_misconception',
            'change_representation',
            'provide_hint',
            'transfer_check',
          ]
        : moves,
    avoidQuestion: last?.assessment === 'wrong' ? last.question : null,
    mastery: 'not_assessed',
    requireFreshTransfer: evidence.some((e) => e.assessment === 'wrong'),
  };
}
