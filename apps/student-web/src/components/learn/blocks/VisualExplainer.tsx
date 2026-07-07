'use client';
import { useState } from 'react';
import type { VisualExplainerBlock } from '@edrion/schemas';
import { Eye } from 'lucide-react';
import { GraphCanvas } from '../GraphCanvas';
import { BlockCard } from '../BlockCard';
import { PillChip } from '@/components/ui/primitives';

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
    <BlockCard eyebrow="VISUAL EXPLAINER" tone="blue" icon={Eye}>
      {content.views.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {content.views.map((v, i) => (
            <PillChip key={v.title} variant={i === viewIdx ? 'primary' : 'default'} onClick={() => setViewIdx(i)}>
              {v.title}
            </PillChip>
          ))}
        </div>
      )}
      {view && (
        <>
          <h2 className="font-display text-xl font-semibold text-st-ink">{view.title}</h2>
          <div className="mt-4 rounded-xl border border-st-bd1 bg-st-blueSoft/30 p-3">
            <GraphCanvas viewBox={view.svgSpec.viewBox} elements={view.svgSpec.elements} />
          </div>
        </>
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
