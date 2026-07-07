'use client';
import { useState } from 'react';
import type { WorkedExampleBlock } from '@edrion/schemas';
import { BookOpen } from 'lucide-react';
import { MathText } from '../MathText';
import { BlockCard } from '../BlockCard';
import { PillChip } from '@/components/ui/primitives';

export function WorkedExample({
  content,
  onAsk,
}: {
  content: WorkedExampleBlock;
  onAsk?: (q: string) => void;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [openWhy, setOpenWhy] = useState<number | null>(null);

  return (
    <BlockCard eyebrow="WORKED EXAMPLE" tone="gold" icon={BookOpen}>
      {content.equation && (
        <div className="rounded-xl bg-st-goldSoftBg p-4">
          <MathText display>{content.equation}</MathText>
        </div>
      )}
      <p className="mt-4 text-sm text-st-ink">{content.problem}</p>

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
        {content.steps.map((step, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveStep(i)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              i === activeStep ? 'bg-st-gold text-white' : 'bg-st-surface2 text-st-muted'
            }`}
          >
            {step.label}
          </button>
        ))}
      </div>

      {content.steps[activeStep] && (
        <div className="mt-4 rounded-xl border border-st-goldBd bg-st-card p-4">
          <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-gold">
            STEP {activeStep + 1}
          </p>
          {content.steps[activeStep].math && (
            <div className="mt-2">
              <MathText display>{content.steps[activeStep].math}</MathText>
            </div>
          )}
          <p className="mt-2 text-sm text-st-ink">{content.steps[activeStep].explanation}</p>
          {content.steps[activeStep].why && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpenWhy(openWhy === activeStep ? null : activeStep)}
                className="text-xs font-semibold text-st-goldInk"
              >
                Why does this work? {openWhy === activeStep ? '↑' : '↓'}
              </button>
              {openWhy === activeStep && (
                <p className="mt-2 text-sm text-st-muted">{content.steps[activeStep].why}</p>
              )}
            </div>
          )}
        </div>
      )}

      {onAsk && content.suggestedQuestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {content.suggestedQuestions.map((q) => (
            <PillChip key={q} onClick={() => onAsk(q)}>
              {q}
            </PillChip>
          ))}
        </div>
      )}
    </BlockCard>
  );
}
