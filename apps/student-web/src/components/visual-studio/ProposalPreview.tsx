'use client';

import type { VisualGraphPatch } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';

type ProposalPreviewProps = {
  proposal: VisualGraphPatch;
  confirming?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
};

export function ProposalPreview({
  proposal,
  confirming,
  onConfirm,
  onDismiss,
}: ProposalPreviewProps) {
  const isAlternative = proposal.kind === 'alternative';

  return (
    <div className="thinking-canvas__panel rounded-2xl border border-st-violet/30 bg-st-violetSoft/50 p-4 shadow-lg">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-violet">
        {isAlternative ? 'Petros found another route' : 'Petros suggests a deeper branch'}
      </p>
      <p className="mt-2 text-sm text-st-inkSoft">{proposal.summary}</p>
      <p className="mt-1 text-xs text-st-muted">
        {proposal.nodes.length} idea{proposal.nodes.length === 1 ? '' : 's'} previewed on the canvas
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <PillButton onClick={() => void onConfirm()} disabled={confirming}>
          {isAlternative ? 'Add this route' : 'Add this branch'}
        </PillButton>
        <PillButton variant="soft" onClick={onDismiss} disabled={confirming}>
          Not now
        </PillButton>
      </div>
    </div>
  );
}
