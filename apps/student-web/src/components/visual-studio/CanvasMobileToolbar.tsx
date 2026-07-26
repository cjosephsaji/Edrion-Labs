'use client';

import { useMemo, useState } from 'react';
import { Expand, LayoutGrid, Maximize2 } from 'lucide-react';
import type { VisualArchetype } from '@edrion/schemas';
import { ARCHETYPE_LABELS, evaluateArchetypeCompatibility } from '@/lib/visual-studio/canvas-compatibility';
import { collapseToOverview, expandAll } from '@/lib/visual-studio/canvas-visibility';
import { useVisualCanvasStore } from '@/lib/visual-studio/use-canvas-store';
import { PillChip } from '@/components/ui/primitives';

const ARCHETYPES: VisualArchetype[] = [
  'mind_map',
  'flowchart',
  'hierarchy',
  'cycle',
  'timeline',
  'comparison',
];

export function CanvasMobileToolbar({ onOpenActions }: { onOpenActions?: () => void }) {
  const graph = useVisualCanvasStore((state) => state.graph);
  const setGraph = useVisualCanvasStore((state) => state.setGraph);
  const bumpLayoutRequest = useVisualCanvasStore((state) => state.bumpLayoutRequest);
  const requestFitView = useVisualCanvasStore((state) => state.requestFitView);
  const [showArchetypes, setShowArchetypes] = useState(false);
  const compatibility = useMemo(() => evaluateArchetypeCompatibility(graph), [graph]);

  return (
    <div className="border-t border-st-bd1 bg-st-sidebar/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="grid grid-cols-5 gap-1">
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-2xl text-[11px] font-semibold text-st-ink disabled:text-st-faint"
          disabled={!onOpenActions}
          onClick={onOpenActions}
        >
          Actions
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-2xl text-[11px] font-semibold text-st-ink"
          onClick={() => setGraph(expandAll(graph))}
        >
          <Expand size={16} className="mx-auto" />
          Expand
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-2xl text-[11px] font-semibold text-st-ink"
          onClick={() => {
            setGraph(collapseToOverview(graph));
            bumpLayoutRequest();
          }}
        >
          Overview
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-2xl text-[11px] font-semibold text-st-ink"
          onClick={() => setShowArchetypes((open) => !open)}
        >
          <LayoutGrid size={16} className="mx-auto" />
          Shape
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-2xl text-[11px] font-semibold text-st-ink"
          onClick={() => requestFitView()}
        >
          <Maximize2 size={16} className="mx-auto" />
          Fit
        </button>
      </div>

      {showArchetypes ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {ARCHETYPES.map((archetype) => {
            const entry = compatibility.find((item) => item.archetype === archetype);
            const disabled = !entry?.compatible;
            if (disabled) {
              return (
                <span
                  key={archetype}
                  title={entry?.reason ?? undefined}
                  className="inline-flex cursor-not-allowed rounded-full border border-st-bd2 bg-st-surface2 px-3 py-1.5 text-xs font-semibold text-st-faint"
                >
                  {ARCHETYPE_LABELS[archetype]}
                </span>
              );
            }
            return (
              <PillChip
                key={archetype}
                variant={graph.archetype === archetype ? 'primary' : 'default'}
                onClick={() => {
                  setGraph({ ...graph, archetype });
                  bumpLayoutRequest();
                  setShowArchetypes(false);
                }}
              >
                {ARCHETYPE_LABELS[archetype]}
              </PillChip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
