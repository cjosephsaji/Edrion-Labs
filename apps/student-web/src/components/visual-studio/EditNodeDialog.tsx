'use client';

import { useEffect, useRef, useState } from 'react';
import type { VisualGraphNode, VisualNodeType } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';
import { X } from 'lucide-react';

const EDITABLE_TYPES: VisualNodeType[] = [
  'concept',
  'process_step',
  'decision',
  'example',
  'question',
  'definition',
  'formula',
  'note',
];

type EditNodeDialogProps = {
  node: VisualGraphNode;
  onSave: (patch: Pick<VisualGraphNode, 'title' | 'body' | 'type'>) => void;
  onClose: () => void;
};

export function EditNodeDialog({ node, onSave, onClose }: EditNodeDialogProps) {
  const [title, setTitle] = useState(node.title);
  const [body, setBody] = useState(node.body);
  const [type, setType] = useState<VisualNodeType>(node.type);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-st-ink/40 p-4">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="edit-node-title"
        className="thinking-canvas__panel w-full max-w-md rounded-3xl border border-st-bd1 bg-st-page p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="edit-node-title" className="font-display text-lg font-semibold text-st-ink">
            Edit idea
          </h2>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-st-bd1"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">
          Title ({title.length}/160)
          <input
            ref={titleRef}
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-st-bd1 bg-st-card px-3 py-2 text-sm text-st-ink"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">
          Body ({body.length}/1500)
          <textarea
            value={body}
            maxLength={1500}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-xl border border-st-bd1 bg-st-card px-3 py-2 text-sm text-st-ink"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as VisualNodeType)}
            className="mt-1 w-full rounded-xl border border-st-bd1 bg-st-card px-3 py-2 text-sm text-st-ink"
          >
            {EDITABLE_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex gap-2">
          <PillButton
            disabled={!title.trim()}
            onClick={() => onSave({ title: title.trim(), body: body.trim(), type })}
          >
            Save
          </PillButton>
          <PillButton variant="soft" onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </div>
    </div>
  );
}
