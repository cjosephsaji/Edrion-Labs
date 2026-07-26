'use client';

import Link from 'next/link';
import { useOrchestratorSession } from '@/lib/hooks/useOrchestratorSession';

/** P1.6 orchestrator session document (flag-gated API). */
export function OrchestratorSessionDocument({ sessionId }: { sessionId: string }) {
  const { session, loading, error, endSession } = useOrchestratorSession(sessionId, true);

  if (loading && !session) {
    return <div className="mx-auto max-w-[640px] px-4 py-10 shimmer h-40 rounded-2xl" />;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10 text-sm text-st-danger">
        {error}
        <Link href="/learn" className="ml-2 underline">
          Back
        </Link>
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8 pb-24">
      <header className="sticky top-0 z-10 border-b border-st-bd1 bg-st-bg/90 py-3 backdrop-blur">
        <p className="text-xs uppercase tracking-wide text-st-faint">{session.topicKey}</p>
        <h1 className="font-display text-xl font-semibold text-st-ink">Guided session</h1>
        <div className="mt-2 flex gap-1">
          {session.blocks.map((b) => (
            <span key={b.id} className="h-1 flex-1 rounded-full bg-st-accent" title={b.moveType ?? b.blockType} />
          ))}
        </div>
      </header>

      <div className="mt-6 space-y-4">
        {session.blocks.map((block) => (
          <article
            key={block.id}
            className="rounded-2xl border border-st-bd1 bg-st-card p-4 shadow-sm"
          >
            <p className="text-[10px] font-medium uppercase text-st-faint">{block.moveType ?? block.blockType}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-st-ink">
              {String((block.content as { body?: string }).body ?? JSON.stringify(block.content, null, 2))}
            </pre>
          </article>
        ))}
      </div>

      <footer className="mt-8 flex gap-3">
        <button
          type="button"
          className="rounded-full bg-st-accent px-5 py-2.5 text-sm font-medium text-white"
          onClick={() => void endSession()}
        >
          End session
        </button>
        <Link href="/learn" className="rounded-full px-4 py-2.5 text-sm text-st-muted">
          Exit
        </Link>
      </footer>
    </div>
  );
}
