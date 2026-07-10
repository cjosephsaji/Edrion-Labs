'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CanvasSaveStatus } from '@/lib/visual-studio/canvas-store';

function formatSavedAgo(lastSavedAt: string | null): string {
  if (!lastSavedAt) return 'just now';
  const elapsedMs = Date.now() - new Date(lastSavedAt).getTime();
  if (elapsedMs < 60_000) return 'just now';
  const minutes = Math.floor(elapsedMs / 60_000);
  return `${minutes}m ago`;
}

type CanvasSaveIndicatorProps = {
  status: CanvasSaveStatus;
  dirty?: boolean;
  lastSavedAt?: string | null;
  conflictResolved?: boolean;
  validationMessage?: string | null;
};

export function CanvasSaveIndicator({
  status,
  dirty = false,
  lastSavedAt = null,
  conflictResolved = false,
  validationMessage = null,
}: CanvasSaveIndicatorProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (status !== 'saved' || !lastSavedAt) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [lastSavedAt, status]);

  const label = useMemo(() => {
    if (validationMessage) return 'This draft needs one fix before it can sync.';
    if (conflictResolved && status === 'saved') return 'Saved — the other copy is in history.';
    if (dirty && status === 'saved') return 'Unsaved changes';
    if (status === 'saving') return 'Saving…';
    if (status === 'offline') return "Saved on this device — we'll sync when you're back.";
    if (status === 'error') return 'Save failed';
    return `Saved · ${formatSavedAgo(lastSavedAt)}`;
  }, [conflictResolved, dirty, lastSavedAt, status, validationMessage]);

  const tone =
    validationMessage || status === 'error'
      ? 'text-st-danger'
      : status === 'offline'
        ? 'text-st-amberInk'
        : status === 'saving' || dirty
          ? 'text-st-muted'
          : 'text-st-faint';

  return (
    <span className={`font-mono-ui text-xs font-medium ${tone}`} aria-live="polite">
      {label}
      {validationMessage ? (
        <span className="mt-0.5 block font-sans text-[11px] font-normal">{validationMessage}</span>
      ) : null}
    </span>
  );
}
