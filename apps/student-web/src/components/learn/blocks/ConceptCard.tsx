import type { ConceptCardBlock } from '@edrion/schemas';
import { MathText } from '../MathText';

export function ConceptCard({
  content,
  onAsk,
}: {
  content: ConceptCardBlock;
  onAsk?: (q: string) => void;
}) {
  return (
    <article className="space-y-4 animate-st-block-in">
      <h2 className="font-display text-2xl font-semibold text-st-ink">{content.title}</h2>
      <p className="text-sm leading-relaxed text-st-ink">{content.summary}</p>
      <ul className="space-y-2">
        {content.keyPoints.map((point, i) => (
          <li key={i} className="flex gap-2 text-sm text-st-ink">
            <span className="text-st-accent">•</span>
            <MathText>{point}</MathText>
          </li>
        ))}
      </ul>
      {content.goDeeper?.map((section) => (
        <details key={section.heading} className="rounded-xl border border-st-bd1 bg-st-surface2 p-4">
          <summary className="cursor-pointer font-semibold text-st-ink">{section.heading}</summary>
          <p className="mt-2 text-sm text-st-muted">{section.body}</p>
        </details>
      ))}
      {onAsk && content.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {content.suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="rounded-full border border-st-bd1 bg-st-card px-3 py-1.5 text-xs text-st-muted hover:border-st-accent/40"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
