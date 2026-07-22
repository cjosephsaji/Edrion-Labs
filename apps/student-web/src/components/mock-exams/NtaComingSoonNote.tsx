'use client';

import { useState } from 'react';

const COPY =
  'NTA-exact interface coming soon — practicing in standard mode';

/** Calm, dismissible chrome note when blueprint skin is reserved `nta` (D-T2-017). */
export function NtaComingSoonNote() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-st-bd1 bg-st-card/80 px-4 py-1.5 text-xs text-st-muted">
      <p className="min-w-0 flex-1">{COPY}</p>
      <button
        type="button"
        className="shrink-0 text-st-ink/60 hover:text-st-ink"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
}
