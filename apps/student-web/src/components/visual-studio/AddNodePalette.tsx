'use client';

import { useState } from 'react';
import type { VisualNodeType } from '@edrion/schemas';
import { PillChip } from '@/components/ui/primitives';

const PRIMARY: Array<{ type: VisualNodeType; label: string }> = [
  { type: 'concept', label: 'Idea' },
  { type: 'process_step', label: 'Step' },
  { type: 'example', label: 'Example' },
  { type: 'formula', label: 'Formula' },
  { type: 'note', label: 'Note' },
];

const MORE: Array<{ type: VisualNodeType; label: string }> = [
  { type: 'decision', label: 'Decision' },
  { type: 'question', label: 'Question' },
  { type: 'definition', label: 'Definition' },
];

type AddNodePaletteProps = {
  onAdd: (type: VisualNodeType) => void;
  compact?: boolean;
};

export function AddNodePalette({ onAdd, compact }: AddNodePaletteProps) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className={`thinking-canvas__panel ${compact ? 'p-2' : 'p-3'}`}>
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-faint">
        Add
      </p>
      <div className="flex flex-wrap gap-2">
        {PRIMARY.map((item) => (
          <PillChip key={item.type} onClick={() => onAdd(item.type)}>
            {item.label}
          </PillChip>
        ))}
        <PillChip variant="default" onClick={() => setShowMore((v) => !v)}>
          More
        </PillChip>
      </div>
      {showMore ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {MORE.map((item) => (
            <PillChip key={item.type} onClick={() => onAdd(item.type)}>
              {item.label}
            </PillChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
