'use client';
import { useState } from 'react';
import type { PracticeItemBlock } from '@edrion/schemas';
import { MathText } from '../MathText';
import { HintLadder } from '../HintLadder';
import { PillButton } from '@/components/ui/pill-button';

export function PracticeLauncher({
  content,
  onSubmit,
  readOnly,
}: {
  content: PracticeItemBlock;
  onSubmit: (answer: string, hintsUsed: number) => void;
  readOnly?: boolean;
}) {
  const [answer, setAnswer] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim() || readOnly) return;
    onSubmit(answer, hintsUsed);
    setSubmitted(true);
  };

  return (
    <article className="space-y-4 animate-st-block-in">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-st-ink">Practice</h2>
        {content.questionIndex != null && content.questionTotal != null && (
          <span className="text-xs text-st-muted">
            {content.questionIndex}/{content.questionTotal}
          </span>
        )}
      </div>
      <p className="text-sm text-st-ink">{content.statement}</p>
      {content.math && <MathText display>{content.math}</MathText>}
      {!readOnly && !submitted && (
        <>
          <HintLadder hints={content.hints} onReveal={() => setHintsUsed((h) => h + 1)} />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer…"
            className="w-full rounded-xl border border-st-bd1 bg-st-card p-3 text-sm"
            rows={3}
          />
          <PillButton onClick={handleSubmit} disabled={!answer.trim()}>
            Check answer
          </PillButton>
        </>
      )}
    </article>
  );
}
