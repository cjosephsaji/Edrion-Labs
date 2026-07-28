'use client';
import Link from 'next/link';
import type { LearnSessionV1Dto } from '@edrion/schemas';
import { useModalDialog } from '@/lib/hooks/useModalDialog';
import { PillButton } from '@/components/ui/pill-button';

export function CompletionOverlay({ session }: { session: LearnSessionV1Dto }) {
  const open = session.orchestratorStatus === 'closed' && session.endReason !== 'abandoned';
  const panelRef = useModalDialog(open, () => undefined);

  if (!open) return null;

  const summary = session.summary as
    | { end_reason?: string; elapsed_minutes?: number; moves?: number; checkpoints?: { done: number; total: number } }
    | null
    | undefined;

  const line =
    summary && typeof summary === 'object'
      ? [
          summary.checkpoints
            ? `${summary.checkpoints.done}/${summary.checkpoints.total} checkpoints`
            : null,
          typeof summary.moves === 'number' ? `${summary.moves} moves` : null,
          typeof summary.elapsed_minutes === 'number' ? `${summary.elapsed_minutes} min` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${session.checkpointsDone} checkpoints · ${session.planMoveCount} moves`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-complete-title"
        className="w-full max-w-md rounded-[15px] bg-st-card p-6 text-center shadow-lg"
      >
        <h2 id="learn-complete-title" className="text-lg font-semibold text-st-ink">
          Lesson complete
        </h2>
        <p className="mt-2 text-sm text-st-muted">{line || 'Nice work — this lesson is saved.'}</p>
        <Link href="/learn" className="mt-6 inline-block">
          <PillButton className="min-h-0 px-6 py-2">Back to Learn</PillButton>
        </Link>
      </div>
    </div>
  );
}
