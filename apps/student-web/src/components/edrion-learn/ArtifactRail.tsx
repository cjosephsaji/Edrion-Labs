'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { LearnSessionV1Dto } from '@edrion/schemas';

type RailItem = {
  id: string;
  kind: 'flashcards' | 'canvas';
  label: string;
  href?: string;
  preview?: string;
  canvasId?: string;
};

function collectItems(session: LearnSessionV1Dto): RailItem[] {
  const items: RailItem[] = [];
  for (const b of session.blocks) {
    const st = b.interactionState as {
      committed?: boolean;
      cardCount?: number;
      deckId?: string;
      canvasId?: string;
    };
    if (b.block.block_type === 'artifact_commit' && st.committed) {
      const deckId = st.deckId;
      items.push({
        id: b.id,
        kind: 'flashcards',
        label: `${st.cardCount ?? 0} flashcard${(st.cardCount ?? 0) === 1 ? '' : 's'}`,
        href: deckId ? `/library?deck=${deckId}` : '/library',
        preview: b.block.cards[0]?.front_md?.slice(0, 80),
      });
    }
    if (b.block.block_type === 'canvas_embed') {
      const canvasId = st.canvasId ?? b.block.canvas_id;
      items.push({
        id: b.id,
        kind: 'canvas',
        label: b.block.caption ?? 'Diagram',
        href: `/lab/visual/${canvasId}`,
        canvasId,
      });
    }
  }
  return items;
}

function RailList({ items }: { items: RailItem[] }) {
  if (!items.length) {
    return <p className="text-xs text-st-muted">What you make here shows up here.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            href={it.href ?? '/library'}
            className="block rounded-lg border border-st-bd2 bg-st-card p-3 text-xs transition hover:border-st-accentBd"
          >
            <div className="flex items-start gap-2">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-st-surface2 text-lg text-st-muted"
                aria-hidden
              >
                {it.kind === 'canvas' ? '▣' : '✦'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-st-ink">{it.label}</span>
                {it.preview && (
                  <span className="mt-0.5 block truncate text-st-muted">{it.preview}</span>
                )}
                {it.kind === 'canvas' && (
                  <span className="mt-0.5 block text-st-accent">Open in Lab →</span>
                )}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ArtifactRail({ session }: { session: LearnSessionV1Dto }) {
  const items = useMemo(() => collectItems(session), [session]);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-60 shrink-0 self-start lg:mt-16 lg:block">
        <p className="text-sm font-semibold text-st-ink">
          <span className="inline-block animate-st-pop-in motion-reduce:animate-none">{items.length}</span>{' '}
          {items.length === 1 ? 'artifact' : 'artifacts'}
        </p>
        <RailList items={items} />
      </aside>

      {items.length > 0 && (
        <div className="lg:hidden">
          <button
            type="button"
            className="fixed bottom-24 right-4 z-30 flex items-center gap-1 rounded-full border border-st-bd2 bg-st-card px-3 py-1.5 text-xs font-medium shadow-md"
            onClick={() => setSheetOpen(true)}
            aria-label={`${items.length} saved artifacts`}
          >
            <span className="animate-st-pop-in motion-reduce:animate-none">{items.length}</span> ✦
          </button>
          {sheetOpen && (
            <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40">
              <button
                type="button"
                className="min-h-[30vh] flex-1"
                aria-label="Close artifacts"
                onClick={() => setSheetOpen(false)}
              />
              <div className="max-h-[70vh] animate-st-sheet-in overflow-y-auto rounded-t-[15px] bg-st-card p-5 shadow-lg motion-reduce:animate-none">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-st-ink">Your artifacts</h2>
                  <button type="button" className="text-xs text-st-muted" onClick={() => setSheetOpen(false)}>
                    Close
                  </button>
                </div>
                <RailList items={items} />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
