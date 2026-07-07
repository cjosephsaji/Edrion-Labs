'use client';
import { useState } from 'react';
import type { CheckpointBlock } from '@edrion/schemas';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import { MathText } from '../MathText';
import { BlockCard } from '../BlockCard';
import { PillButton } from '@/components/ui/pill-button';

export function Checkpoint({
  content,
  onAnswer,
  readOnly,
}: {
  content: CheckpointBlock;
  onAnswer: (choice: string, explanation?: string) => void;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');
  const [phase, setPhase] = useState<'choice' | 'explain' | 'done'>('choice');
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const [correctKey, setCorrectKey] = useState<string | null>(null);

  const handleChoice = (key: string) => {
    if (readOnly || phase === 'done') return;
    setSelected(key);
    const opt = content.options.find((o) => o.key === key);
    if (opt?.correct) {
      setCorrectKey(key);
      setWrongKey(null);
      setPhase('explain');
    } else {
      setWrongKey(key);
      setCorrectKey(null);
    }
  };

  const submit = () => {
    if (!selected) return;
    onAnswer(selected, explanation);
    setPhase('done');
  };

  const wrongOpt = wrongKey ? content.options.find((o) => o.key === wrongKey) : null;

  return (
    <BlockCard eyebrow="CHECKPOINT" tone="checkpoint" icon={HelpCircle}>
      <p className="font-display text-lg font-semibold text-st-ink">{content.question}</p>
      {content.math && (
        <div className="mt-3">
          <MathText display>{content.math}</MathText>
        </div>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {content.options.map((opt) => {
          const isWrong = wrongKey === opt.key;
          const isCorrect = correctKey === opt.key || (phase === 'done' && opt.correct);
          return (
            <button
              key={opt.key}
              type="button"
              disabled={readOnly || phase === 'done'}
              onClick={() => handleChoice(opt.key)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                isCorrect
                  ? 'border-st-success bg-st-mintBg text-st-success animate-st-pop-in'
                  : isWrong
                    ? 'border-st-danger bg-st-dangerSoft text-st-danger'
                    : selected === opt.key
                      ? 'border-st-accent bg-st-accentSoft'
                      : 'border-st-bd1 bg-st-card hover:border-st-accent/30'
              }`}
            >
              <span className="flex items-center gap-2">
                {isCorrect && <CheckCircle2 size={16} aria-hidden />}
                {opt.label}
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

      {phase === 'explain' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-st-muted">{content.explainPrompt}</p>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full rounded-xl border border-st-bd2 bg-st-card p-3 text-sm outline-none focus:border-st-accent"
            rows={3}
            placeholder="Explain your reasoning…"
          />
          <PillButton onClick={submit}>Submit</PillButton>
        </div>
      )}
    </BlockCard>
  );
}
