'use client';
import { normalizeQuestionType } from '../answer-model';
import type { QuestionInputProps } from './types';
import { McqSingle } from './McqSingle';
import { McqMulti } from './McqMulti';
import { AssertionReason } from './AssertionReason';
import { FillBlank } from './FillBlank';
import { MatchFollowing } from './MatchFollowing';
import { Numerical } from './Numerical';
import { ShortAnswer } from './ShortAnswer';
import { LongAnswer } from './LongAnswer';
import { CaseBased } from './CaseBased';

export function QuestionInput(props: QuestionInputProps) {
  const type = normalizeQuestionType(props.question.qtype);
  switch (type) {
    case 'mcq_single':
      return <McqSingle {...props} />;
    case 'mcq_multi':
      return <McqMulti {...props} />;
    case 'assertion_reason':
      return <AssertionReason {...props} />;
    case 'fill_blank':
      return <FillBlank {...props} />;
    case 'match_following':
      return <MatchFollowing {...props} />;
    case 'numerical':
      return <Numerical {...props} />;
    case 'short_answer':
      return <ShortAnswer {...props} />;
    case 'long_answer':
      return <LongAnswer {...props} />;
    case 'case_based':
      return <CaseBased {...props} />;
    default:
      return <ShortAnswer {...props} />;
  }
}
