import type { NoteCardBlock } from '@edrion/schemas';

export function NoteCard({ content }: { content: NoteCardBlock }) {
  return (
    <article className="rounded-xl border border-st-amber/30 bg-st-amberSoft/30 p-4 animate-st-block-in">
      <p className="text-[10px] font-semibold tracking-wide text-st-amber">Pinned note</p>
      <p className="mt-2 text-sm font-semibold text-st-ink">{content.question}</p>
      <p className="mt-2 text-sm text-st-muted">{content.answer}</p>
    </article>
  );
}
