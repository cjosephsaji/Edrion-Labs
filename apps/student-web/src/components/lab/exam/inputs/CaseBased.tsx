'use client';
import { MathText } from '@/components/learn/MathText';
import { normalizeQuestionType, type ExamRoomQuestion, type LocalAnswer } from '../answer-model';
import type { QuestionInputProps } from './types';
import { McqSingle } from './McqSingle';
import { McqMulti } from './McqMulti';
import { AssertionReason } from './AssertionReason';
import { FillBlank } from './FillBlank';
import { MatchFollowing } from './MatchFollowing';
import { Numerical } from './Numerical';
import { ShortAnswer } from './ShortAnswer';
import { LongAnswer } from './LongAnswer';

type SubQuestion = Record<string, unknown> & { id: string; type: string; prompt: string };

function adapt(sub: SubQuestion): ExamRoomQuestion {
  return {
    id: sub.id,
    sequence: 0,
    topic: (sub.topicLabel as string) ?? '',
    qtype: sub.type as ExamRoomQuestion['qtype'],
    prompt: sub.prompt,
    options: (sub.options as ExamRoomQuestion['options']) ?? null,
    marks: (sub.marks as number) ?? 1,
    payload: sub,
  };
}

function LeafInput(props: QuestionInputProps) {
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
    case 'long_answer':
      return <LongAnswer {...props} />;
    case 'short_answer':
    default:
      return <ShortAnswer {...props} />;
  }
}

export function CaseBased({ question, value, onChange, disabled }: QuestionInputProps) {
  const payload = question.payload ?? {};
  const passage = (payload.passage as string) ?? '';
  const subs = ((payload.subQuestions as SubQuestion[]) ?? []).filter(
    (s): s is SubQuestion => !!s && typeof s === 'object' && 'id' in s,
  );
  const subAnswers = value.subAnswers ?? [];

  const answerFor = (id: string): LocalAnswer =>
    (subAnswers.find((s) => s.subQuestionId === id)?.payload as LocalAnswer) ?? {};

  const setSubAnswer = (id: string, patch: Partial<LocalAnswer>) => {
    const existing = answerFor(id);
    const merged = { ...existing, ...patch };
    const next = subAnswers.filter((s) => s.subQuestionId !== id);
    next.push({ subQuestionId: id, payload: merged as Record<string, unknown> });
    onChange({ subAnswers: next });
  };

  return (
    <div className="grid gap-4">
      {passage && (
        <div className="rounded-[13px] border border-st-bd1 bg-st-cardAlt p-4 text-sm leading-relaxed text-st-ink">
          <p className="mb-2 font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
            CASE STUDY
          </p>
          <MathText>{passage}</MathText>
        </div>
      )}
      {subs.map((sub, idx) => {
        const adapted = adapt(sub);
        return (
          <div key={sub.id} className="rounded-[13px] border border-st-bd2 bg-st-card p-4">
            <p className="font-display text-[15px] text-st-ink">
              <span className="font-mono-ui text-[12px] font-semibold text-st-accent">
                {idx + 1}.
              </span>{' '}
              <MathText>{sub.prompt}</MathText>
            </p>
            <div className="mt-3">
              <LeafInput
                question={adapted}
                value={answerFor(sub.id)}
                onChange={(patch) => setSubAnswer(sub.id, patch)}
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
