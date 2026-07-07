import type { NoteCardBlock } from '@edrion/schemas';
import { Pin } from 'lucide-react';
import { BlockCard } from '../BlockCard';
import { PetrosMark } from '@/components/ui/primitives';

export function NoteCard({ content }: { content: NoteCardBlock }) {
  return (
    <BlockCard eyebrow="PINNED NOTE" tone="amber" icon={Pin}>
      <div className="flex items-center gap-1 text-st-amberInk">
        <PetrosMark />
        <p className="text-sm font-semibold text-st-ink">{content.question}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-st-muted">{content.answer}</p>
    </BlockCard>
  );
}
