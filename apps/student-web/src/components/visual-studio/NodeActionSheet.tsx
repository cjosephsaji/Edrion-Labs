'use client';

import { useEffect, useRef } from 'react';
import type { VisualGraphNode } from '@edrion/schemas';
import { X } from 'lucide-react';

export type NodeAction =
  | 'explain'
  | 'quiz'
  | 'mark_shaky'
  | 'resolve'
  | 'expand'
  | 'alternative'
  | 'edit'
  | 'add_note'
  | 'delete_node'
  | 'delete_branch';

type NodeActionSheetProps = {
  open: boolean;
  node: VisualGraphNode | null;
  quotaRemaining?: { expand?: number; expandLimit?: number; alternative?: number; alternativeLimit?: number };
  online?: boolean;
  onAction: (action: NodeAction) => void;
  onClose: () => void;
  desktop?: boolean;
};

function quotaLabel(used: number | undefined, limit: number | undefined, noun: string) {
  if (limit == null || used == null) return null;
  const remaining = Math.max(0, limit - used);
  return `${remaining} of ${limit} ${noun} left today`;
}

export function NodeActionSheet({
  open,
  node,
  quotaRemaining,
  online = true,
  onAction,
  onClose,
  desktop,
}: NodeActionSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !node) return null;

  const actions: Array<{ id: NodeAction; label: string; hint?: string; disabled?: boolean }> = [
    { id: 'explain', label: 'Explain this' },
    {
      id: 'quiz',
      label: 'Quiz me on this',
      disabled: !online,
      hint: !online ? 'A new quiz needs a connection. You can keep editing.' : undefined,
    },
    node.status === 'shaky'
      ? { id: 'resolve', label: 'Resolve' }
      : { id: 'mark_shaky', label: "Mark shaky" },
    {
      id: 'expand',
      label: 'Go deeper',
      hint: quotaLabel(quotaRemaining?.expand, quotaRemaining?.expandLimit, 'deeper looks') ?? undefined,
      disabled:
        quotaRemaining?.expandLimit != null &&
        (quotaRemaining.expand ?? 0) >= quotaRemaining.expandLimit,
    },
  ];

  if (node.type === 'decision' || node.type === 'process_step') {
    actions.push({
      id: 'alternative',
      label: 'What if instead?',
      disabled: quotaRemaining?.alternativeLimit != null && (quotaRemaining.alternative ?? 0) >= quotaRemaining.alternativeLimit,
    });
  }

  actions.push(
    { id: 'edit', label: 'Edit' },
    { id: 'add_note', label: 'Add note' },
    { id: 'delete_node', label: 'Delete node' },
    { id: 'delete_branch', label: 'Delete branch' },
  );

  const content = (
  <div
    ref={panelRef}
    role="dialog"
    aria-modal
    tabIndex={-1}
    aria-labelledby="node-action-title"
    className={
      desktop
        ? 'thinking-canvas__panel w-72 rounded-2xl border border-st-bd1 bg-st-page p-3 shadow-xl'
        : 'thinking-canvas__panel max-h-[72dvh] w-full overflow-y-auto rounded-t-3xl border border-st-bd1 bg-st-page p-4 pb-8 shadow-2xl'
    }
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-faint">
          Actions
        </p>
        <h2 id="node-action-title" className="mt-1 font-display text-lg font-semibold text-st-ink">
          {node.title}
        </h2>
      </div>
      <button
        type="button"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-st-bd1"
        aria-label="Close actions"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </div>

    <ul className="mt-4 space-y-1">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            disabled={action.disabled}
            onClick={() => {
              onAction(action.id);
              onClose();
            }}
            className="flex w-full flex-col rounded-xl px-3 py-3 text-left text-sm font-semibold text-st-ink transition hover:bg-st-cardAlt disabled:cursor-not-allowed disabled:text-st-faint"
          >
            {action.label}
            {action.hint ? <span className="mt-0.5 text-xs font-normal text-st-muted">{action.hint}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  </div>
  );

  if (desktop) return content;

  return (
    <div className="fixed inset-0 z-[65] grid place-items-end bg-st-ink/35" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{content}</div>
    </div>
  );
}
