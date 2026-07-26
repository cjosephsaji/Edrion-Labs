'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { VisualArchetype, VisualEdgeType, VisualGraphEdge } from '@edrion/schemas';
import { Select } from '@edrion/ui';
import { PillButton } from '@/components/ui/pill-button';
import { ARCHETYPE_LABELS } from '@/lib/visual-studio/canvas-compatibility';

const FLOW_TYPES: VisualEdgeType[] = ['leads_to', 'causes', 'requires', 'alternative_to'];
const STRUCTURE_TYPES: VisualEdgeType[] = ['part_of', 'example_of', 'contrasts_with', ...FLOW_TYPES];

type EdgeEditorProps = {
  archetype: VisualArchetype;
  sourceId: string;
  targetId: string;
  onSave: (edge: Omit<VisualGraphEdge, 'id'> & { id?: string }) => void;
  onClose: () => void;
  existing?: VisualGraphEdge;
};

function defaultEdgeType(archetype: VisualArchetype): VisualEdgeType {
  if (archetype === 'mind_map' || archetype === 'hierarchy' || archetype === 'comparison') {
    return 'part_of';
  }
  return 'leads_to';
}

export function EdgeEditor({ archetype, sourceId, targetId, onSave, onClose, existing }: EdgeEditorProps) {
  const allowed =
    archetype === 'mind_map' || archetype === 'hierarchy' || archetype === 'comparison'
      ? STRUCTURE_TYPES
      : FLOW_TYPES;
  const [type, setType] = useState<VisualEdgeType>(existing?.type ?? defaultEdgeType(archetype));
  const [label, setLabel] = useState(existing?.label ?? '');

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-st-ink/40 p-4">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="edge-editor-title"
        className="thinking-canvas__panel w-full max-w-md rounded-3xl border border-st-bd1 bg-st-page p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="edge-editor-title" className="font-display text-lg font-semibold text-st-ink">
            Connect ideas
          </h2>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-st-bd1" onClick={onClose} aria-label="Close edge editor">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-st-muted">{ARCHETYPE_LABELS[archetype]}</p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">
          Connection type
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as VisualEdgeType)}
            className="mt-1 rounded-xl"
            options={allowed.map((entry) => ({ value: entry, label: entry.replace(/_/g, ' ') }))}
          />
        </label>
        {type === 'part_of' ? (
          <p className="mt-2 text-xs text-st-muted">The first idea is part of the second.</p>
        ) : null}

        <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">
          Label (optional)
          <input
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-st-bd1 bg-st-card px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <PillButton
            onClick={() =>
              onSave({
                id: existing?.id,
                source: sourceId,
                target: targetId,
                type,
                label: label.trim() || undefined,
              })
            }
          >
            {existing ? 'Update connection' : 'Add connection'}
          </PillButton>
          <PillButton variant="soft" onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </div>
    </div>
  );
}
