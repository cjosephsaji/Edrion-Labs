'use client';
import { useEffect, useState } from 'react';
import type { CheckpointBlock } from '@edrion/schemas';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import type { BlockAnswerResult } from '@/lib/learn-session-types';
import { StudentClientError } from '@/lib/student-client';
import { MathText } from '../MathText';
import { BlockCard } from '../BlockCard';
import { BlockContinue } from '../BlockContinue';
import { PillButton } from '@/components/ui/pill-button';

export function Checkpoint({
  content,
  onAnswer,
  onContinue,
  readOnly,
  completed,
}: {
  content: CheckpointBlock;
  onAnswer: (choice: string, explanation?: string) => Promise<BlockAnswerResult>;
  onContinue?: () => void;
  readOnly?: boolean;
  completed?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');
  const [phase, setPhase] = useState<'choice' | 'explain' | 'done'>('choice');
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const [correctKey, setCorrectKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (completed) {
      setPhase('done');
      setPassed(true);
    }
  }, [completed]);

  const handleChoice = (key: string) => {
    if (readOnly || phase === 'done' || submitting) return;
    setSelected(key);
    setFeedback(null);
    const opt = content.options.find((o) => o.key === key);
    if (opt?.correct) {
      setCorrectKey(key);
      setWrongKey(null);
      setPhase('explain');
    } else {
      setWrongKey(key);
      setCorrectKey(null);
      setPhase('choice');
    }
  };

  const submit = async () => {
    if (!selected || submitting || readOnly) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await onAnswer(selected, explanation);
      const ok = Boolean(result.evaluation.correct || result.evaluation.accepted);
      setPassed(ok);
      setFeedback(result.evaluation.feedback ?? (ok ? 'Great — you explained it well.' : 'Try again.'));
      if (ok) {
        setPhase('done');
        setCorrectKey(selected);
      }
    } catch (err) {
      const message =
        err instanceof StudentClientError ? err.message : 'Something went wrong — try submitting again.';
      setFeedback(message);
    } finally {
      setSubmitting(false);
    }
  };

  const wrongOpt = wrongKey ? content.options.find((o) => o.key === wrongKey) : null;
  const showContinue = passed && (phase === 'done' || completed) && onContinue;

  return (
    <BlockCard eyebrow="CHECKPOINT" tone="checkpoint" icon={HelpCircle}>
      <p className="font-display text-lg font-semibold text-st-ink">
        <MathText>{content.question}</MathText>
      </p>
      {content.math && (
        <div className="mt-3">
          <MathText display>{content.math}</MathText>
        </div>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {content.options.map((opt) => {
          const isWrong = wrongKey === opt.key;
          const isCorrect = correctKey === opt.key || (passed && opt.correct);
          return (
            <button
              key={opt.key}
              type="button"
              disabled={readOnly || phase === 'done' || submitting}
              onClick={() => handleChoice(opt.key)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                isCorrect
                  ? 'border-st-success bg-st-mintBg text-st-success animate-st-pop-in'
                  : isWrong
                    ? 'border-st-amberBd bg-st-amberSoft text-st-amberInk'
                    : selected === opt.key
                      ? 'border-st-accent bg-st-accentSoft'
                      : 'border-st-bd1 bg-st-card hover:border-st-accent/30'
              }`}
            >
              <span className="flex items-center gap-2">
                {isCorrect && <CheckCircle2 size={16} aria-hidden />}
                <MathText>{opt.label}</MathText>
              </span>
            </button>
          );
        })}
      </div>

      {wrongOpt && phase === 'choice' && (
        <div className="mt-4 rounded-xl border border-st-amberBd bg-st-amberSoft px-4 py-3 text-sm text-st-amberInk">
          {wrongOpt.feedbackWrong ?? 'Not quite — try another option.'}
        </div>
      )}

      {phase === 'explain' && !passed && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-st-success">Correct choice — now explain in your own words.</p>
          <p className="text-sm text-st-muted">{content.explainPrompt}</p>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full rounded-xl border border-st-bd2 bg-st-card p-3 text-sm outline-none focus:border-st-accent"
            rows={3}
            placeholder="Explain your reasoning…"
          />
          <PillButton onClick={() => void submit()} disabled={submitting || explanation.trim().length < 12}>
            {submitting ? 'Checking…' : 'Submit answer'}
          </PillButton>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            passed
              ? 'border-st-success bg-st-mintBg text-st-success'
              : 'border-st-amberBd bg-st-amberSoft text-st-amberInk'
          }`}
        >
          {feedback}
        </div>
      )}

      {showContinue && <BlockContinue onContinue={onContinue} />}
    </BlockCard>
  );
}
