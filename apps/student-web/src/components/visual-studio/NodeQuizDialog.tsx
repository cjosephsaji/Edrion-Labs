'use client';

import { useState } from 'react';
import { PillButton } from '@/components/ui/pill-button';
import { X } from 'lucide-react';

type PublicQuiz = {
  quiz_id: string;
  canvas_id: string;
  node_id: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ key: 'a' | 'b' | 'c' | 'd'; label: string }>;
  }>;
  expires_at: string;
};

type QuizResult = {
  question_id: string;
  correct: boolean;
  feedback: string;
};

type NodeQuizDialogProps = {
  quiz: PublicQuiz;
  loading?: boolean;
  submitting?: boolean;
  onSubmit: (answers: Array<{ question_id: string; choice_key: 'a' | 'b' | 'c' | 'd' }>) => Promise<QuizResult[]>;
  onClose: () => void;
};

export function NodeQuizDialog({
  quiz,
  loading,
  submitting,
  onSubmit,
  onClose,
}: NodeQuizDialogProps) {
  const [answers, setAnswers] = useState<Record<string, 'a' | 'b' | 'c' | 'd'>>({});
  const [results, setResults] = useState<QuizResult[] | null>(null);

  const allAnswered = quiz.questions.every((q) => answers[q.id]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-st-ink/40 p-0 min-[921px]:place-items-center min-[921px]:p-4">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="node-quiz-title"
        className="thinking-canvas__panel max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border border-st-bd1 bg-st-page p-5 shadow-2xl min-[921px]:max-w-lg min-[921px]:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-violet">
              Quick check
            </p>
            <h2 id="node-quiz-title" className="mt-1 font-display text-xl font-semibold text-st-ink">
              Quiz me on this
            </h2>
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-st-bd1 text-st-ink"
            aria-label="Close quiz"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="mt-8 space-y-3">
            <div className="h-16 shimmer rounded-xl" />
            <div className="h-16 shimmer rounded-xl" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {quiz.questions.map((question, index) => {
              const result = results?.find((r) => r.question_id === question.id);
              return (
                <fieldset key={question.id} className="space-y-3">
                  <legend className="text-sm font-semibold text-st-ink">
                    {index + 1}. {question.prompt}
                  </legend>
                  <div className="grid gap-2">
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option.key;
                      const isCorrect = result?.correct && selected;
                      const isWrong = result && !result.correct && selected;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={!!results || submitting}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [question.id]: option.key }))
                          }
                          className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                            isCorrect
                              ? 'border-st-success bg-st-mintBg text-st-ink'
                              : isWrong
                                ? 'border-st-danger bg-st-dangerSoft text-st-ink'
                                : selected
                                  ? 'border-st-violet bg-st-violetSoft text-st-ink'
                                  : 'border-st-bd1 bg-st-card text-st-inkSoft'
                          }`}
                        >
                          <span className="font-mono text-xs uppercase text-st-faint">{option.key}.</span>{' '}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {result ? (
                    <p className="text-sm text-st-muted">
                      {result.correct ? 'This connection is clear.' : 'Revisit this idea.'} {result.feedback}
                    </p>
                  ) : null}
                </fieldset>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {!results ? (
            <PillButton
              disabled={!allAnswered || submitting || loading}
              onClick={() =>
                void onSubmit(
                  quiz.questions.map((q) => ({
                    question_id: q.id,
                    choice_key: answers[q.id]!,
                  })),
                ).then(setResults)
              }
            >
              {submitting ? 'Checking…' : 'Submit answers'}
            </PillButton>
          ) : (
            <PillButton variant="soft" onClick={onClose}>
              Done
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
}
