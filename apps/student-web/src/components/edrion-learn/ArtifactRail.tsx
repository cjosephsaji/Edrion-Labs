'use client';
import type { LearnSessionV1Dto } from '@edrion/schemas';

export function ArtifactRail({ session }: { session: LearnSessionV1Dto }) {
  const artifacts = session.blocks.filter(
    (b) => b.block.block_type === 'artifact_commit' && (b.interactionState as { committed?: boolean })?.committed,
  );
  const count = artifacts.reduce(
    (n, b) => n + Number((b.interactionState as { cardCount?: number })?.cardCount ?? 0),
    0,
  );

  if (!count) {
    return (
      <aside className="hidden w-60 shrink-0 rounded-[15px] border border-st-bd2 bg-st-card p-4 lg:block">
        <p className="text-xs text-st-muted">What you make here shows up here.</p>
      </aside>
    );
  }

  return (
    <aside className="hidden w-60 shrink-0 rounded-[15px] border border-st-bd2 bg-st-card p-4 lg:block">
      <p className="text-sm font-semibold text-st-ink">{count} ✦ saved</p>
      <p className="mt-1 text-xs text-st-muted">Flashcards committed to your Library.</p>
    </aside>
  );
}
