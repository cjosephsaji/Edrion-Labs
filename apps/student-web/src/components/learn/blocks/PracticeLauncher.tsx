'use client';
import { useState } from 'react';
import type { PracticeItemBlock } from '@edrion/schemas';
import { Pencil } from 'lucide-react';
import { MathText } from '../MathText';
import { HintLadder } from '../HintLadder';
import { BlockCard } from '../BlockCard';
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
    <BlockCard
      eyebrow="PRACTICE"
      tone="violet"
      icon={Pencil}
      footer={submitted ? 'Answer submitted — Petros will coach you on the next step.' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-st-ink">Solve it yourself</h2>
        {content.questionIndex != null && content.questionTotal != null && (
          <span className="font-mono-ui text-xs text-st-faint">
            {content.questionIndex}/{content.questionTotal}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-st-ink">{content.statement}</p>
      {content.math && (
        <div className="mt-3 rounded-xl bg-st-violetSoft/50 p-3">
          <MathText display>{content.math}</MathText>
        </div>
      )}
      {!readOnly && !submitted && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-st-bd1 bg-st-surface2/50 p-4">
            <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">SCRATCHPAD</p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Work through the problem here…"
              className="mt-2 w-full resize-none bg-transparent text-sm text-st-ink outline-none"
              rows={4}
            />
          </div>
          <HintLadder
            hints={content.hints}
            onReveal={(rung) => setHintsUsed((h) => Math.max(h, rung))}
          />
          <PillButton onClick={handleSubmit} disabled={!answer.trim()}>
            Check answer
          </PillButton>
        </div>
      )}
    </BlockCard>
  );
}
