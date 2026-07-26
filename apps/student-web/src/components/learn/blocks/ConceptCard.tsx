import type { ConceptCardBlock } from '@edrion/schemas';
import { Lightbulb } from 'lucide-react';
import { MathText } from '../MathText';
import { BlockCard } from '../BlockCard';
import { Eyebrow, PillChip } from '@/components/ui/primitives';

export function ConceptCard({
  content,
  onAsk,
}: {
  content: ConceptCardBlock;
  onAsk?: (q: string) => void;
}) {
  return (
    <BlockCard eyebrow="CONCEPT" tone="accent" icon={Lightbulb}>
      <h2 className="font-display text-2xl font-semibold text-st-ink">{content.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-st-ink">
        <MathText>{content.summary}</MathText>
      </p>

      {content.keyPoints[0] && (
        <div className="mt-4 rounded-xl border border-st-accentBd bg-st-mintBg p-4">
          <Eyebrow color="accent">KEY IDEA</Eyebrow>
          <p className="mt-2 text-sm font-medium text-st-ink">
            <MathText>{content.keyPoints[0]}</MathText>
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {content.keyPoints.slice(1).map((point, i) => (
          <li key={i} className="flex gap-2 text-sm text-st-ink">
            <span className="text-st-accent">•</span>
            <MathText>{point}</MathText>
          </li>
        ))}
      </ul>

      {content.goDeeper?.map((section) => (
        <details key={section.heading} className="mt-3 rounded-xl border border-st-bd1 bg-st-surface2 p-4">
          <summary className="cursor-pointer font-semibold text-st-ink">{section.heading}</summary>
          <p className="mt-2 text-sm text-st-muted">
            <MathText>{section.body}</MathText>
          </p>
        </details>
      ))}

      {onAsk && content.suggestedQuestions.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => onAsk('Test me instead')}
            className="text-sm font-semibold text-st-accent"
          >
            Test me instead →
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            {content.suggestedQuestions.map((q) => (
              <PillChip key={q} onClick={() => onAsk(q)}>
                <MathText>{q}</MathText>
              </PillChip>
            ))}
          </div>
        </div>
      )}
    </BlockCard>
  );
}
