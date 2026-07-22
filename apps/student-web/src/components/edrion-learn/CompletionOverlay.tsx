'use client';
import Link from 'next/link';
import type { LearnSessionV1Dto } from '@edrion/schemas';

export function CompletionOverlay({ session }: { session: LearnSessionV1Dto }) {
  if (session.orchestratorStatus !== 'closed') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[15px] bg-st-card p-6 text-center shadow-lg">
        <h2 className="text-lg font-semibold text-st-ink">Lesson complete</h2>
        <p className="mt-2 text-sm text-st-muted">
          {session.checkpointsDone} checkpoint{session.checkpointsDone === 1 ? '' : 's'} · {session.planMoveCount} moves
        </p>
        <Link
          href="/learn"
          className="mt-6 inline-block rounded-full bg-[#1f604a] px-6 py-2 text-sm font-medium text-white"
        >
          Back to Learn
        </Link>
      </div>
    </div>
  );
}
