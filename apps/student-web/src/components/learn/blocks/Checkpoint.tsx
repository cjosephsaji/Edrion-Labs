'use client';
import { useState } from 'react';
import type { CheckpointBlock } from '@edrion/schemas';
import { MathText } from '../MathText';
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
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleChoice = (key: string) => {
    if (readOnly || phase !== 'choice') return;
    setSelected(key);
    const opt = content.options.find((o) => o.key === key);
    if (opt?.correct) {
      setPhase('explain');
    } else {
      setFeedback(opt?.feedbackWrong ?? 'Not quite — try again.');
    }
  };

  const submit = () => {
    if (!selected) return;
    onAnswer(selected, explanation);
    setPhase('done');
  };

  return (
    <article className="space-y-4 animate-st-block-in">
      <h2 className="font-display text-xl font-semibold text-st-ink">Check your understanding</h2>
      <p className="text-sm text-st-ink">{content.question}</p>
      {content.math && <MathText display>{content.math}</MathText>}
      <div className="space-y-2">
        {content.options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            disabled={readOnly || phase === 'done'}
            onClick={() => handleChoice(opt.key)}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
              selected === opt.key
                ? 'border-st-accent bg-st-accentSoft'
                : 'border-st-bd1 bg-st-card hover:border-st-accent/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {feedback && <p className="text-sm text-st-red">{feedback}</p>}
      {phase === 'explain' && (
        <div className="space-y-2">
          <p className="text-sm text-st-muted">{content.explainPrompt}</p>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full rounded-xl border border-st-bd1 bg-st-card p-3 text-sm"
            rows={3}
          />
          <PillButton onClick={submit}>Submit</PillButton>
        </div>
      )}
    </article>
  );
}
