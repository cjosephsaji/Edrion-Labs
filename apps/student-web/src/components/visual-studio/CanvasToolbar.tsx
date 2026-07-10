'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Expand, FoldVertical, HelpCircle, LayoutGrid, Maximize2 } from 'lucide-react';
import type { VisualArchetype } from '@edrion/schemas';
import { ARCHETYPE_LABELS, evaluateArchetypeCompatibility } from '@/lib/visual-studio/canvas-compatibility';
import { collapseToOverview, expandAll } from '@/lib/visual-studio/canvas-visibility';
import { useVisualCanvasStore } from '@/lib/visual-studio/use-canvas-store';
import { PillChip } from '@/components/ui/primitives';
import { CanvasSaveIndicator } from './CanvasSaveIndicator';
import { CanvasExportButton } from './CanvasExportButton';
import { CanvasKeyboardHelp } from './CanvasKeyboardHelp';

const ARCHETYPES: VisualArchetype[] = [
  'mind_map',
  'flowchart',
  'hierarchy',
  'cycle',
  'timeline',
  'comparison',
];

type CanvasToolbarProps = {
  children?: ReactNode;
  dirty?: boolean;
  lastSavedAt?: string | null;
  conflictResolved?: boolean;
};

export function CanvasToolbar({
  children,
  dirty = false,
  lastSavedAt = null,
  conflictResolved = false,
}: CanvasToolbarProps) {
  const graph = useVisualCanvasStore((state) => state.graph);
  const saveStatus = useVisualCanvasStore((state) => state.saveStatus);
  const setGraph = useVisualCanvasStore((state) => state.setGraph);
  const bumpLayoutRequest = useVisualCanvasStore((state) => state.bumpLayoutRequest);
  const requestFitView = useVisualCanvasStore((state) => state.requestFitView);
  const [showArchetypes, setShowArchetypes] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  const compatibility = useMemo(() => evaluateArchetypeCompatibility(graph), [graph]);

  const applyArchetype = (archetype: VisualArchetype) => {
    if (archetype === graph.archetype) {
      setShowArchetypes(false);
      return;
    }
    setGraph({ ...graph, archetype });
    bumpLayoutRequest();
    setShowArchetypes(false);
  };

  return (
    <>
      <div className="thinking-canvas__panel flex flex-wrap items-center gap-2 border-b border-st-bd1 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-st-ink">{graph.title}</p>
          <p className="text-xs text-st-muted">{ARCHETYPE_LABELS[graph.archetype]}</p>
        </div>
        <CanvasSaveIndicator
          status={saveStatus}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
          conflictResolved={conflictResolved}
        />
        {children}
        <CanvasExportButton />
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink"
          onClick={() => setShowArchetypes((open) => !open)}
        >
          <span className="inline-flex items-center gap-2">
            <LayoutGrid size={16} /> Show differently
          </span>
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink"
          onClick={() => setGraph(expandAll(graph))}
        >
          <span className="inline-flex items-center gap-2">
            <Expand size={16} /> Expand all
          </span>
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink"
          onClick={() => {
            setGraph(collapseToOverview(graph));
            bumpLayoutRequest();
          }}
        >
          <span className="inline-flex items-center gap-2">
            <FoldVertical size={16} /> Collapse to overview
          </span>
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink"
          onClick={() => requestFitView()}
        >
          <span className="inline-flex items-center gap-2">
            <Maximize2 size={16} /> Fit
          </span>
        </button>
        <button
          type="button"
          className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink"
          onClick={() => setKeyboardHelpOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <HelpCircle size={16} /> Keyboard help
          </span>
        </button>

        {showArchetypes ? (
          <div className="flex w-full flex-wrap gap-2 border-t border-st-divider pt-3">
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
                  onClick={() => applyArchetype(archetype)}
                >
                  {ARCHETYPE_LABELS[archetype]}
                </PillChip>
              );
            })}
          </div>
        ) : null}
      </div>
      <CanvasKeyboardHelp open={keyboardHelpOpen} onClose={() => setKeyboardHelpOpen(false)} />
    </>
  );
}
