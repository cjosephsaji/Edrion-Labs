'use client';
import { useState } from 'react';
import type { VisualExplainerBlock } from '@edrion/schemas';
import { GraphCanvas } from '../GraphCanvas';

export function VisualExplainer({
  content,
  onAsk,
}: {
  content: VisualExplainerBlock;
  onAsk?: (q: string) => void;
}) {
  const [viewIdx, setViewIdx] = useState(0);
  const view = content.views[viewIdx];

  return (
    <article className="space-y-4 animate-st-block-in">
      {content.views.length > 1 && (
        <div className="flex gap-2">
          {content.views.map((v, i) => (
            <button
              key={v.title}
              type="button"
              onClick={() => setViewIdx(i)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                i === viewIdx ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {v.title}
            </button>
          ))}
        </div>
      )}
      {view && (
        <>
          <h2 className="font-display text-xl font-semibold text-st-ink">{view.title}</h2>
          <GraphCanvas viewBox={view.svgSpec.viewBox} elements={view.svgSpec.elements} />
        </>
      )}
      {onAsk && content.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {content.suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="rounded-full border border-st-bd1 px-3 py-1.5 text-xs text-st-muted hover:border-st-accent/40"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
