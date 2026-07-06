'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useLearnSession } from '@/lib/hooks';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';

export default function PracticeBlockPage({
  params,
}: {
  params: { id: string; blockId: string };
}) {
  const { data: session, isLoading, answer } = useLearnSession(params.id);
  const [askOpen, setAskOpen] = useState(false);

  const block = session?.blocks.find((b) => b.id === params.blockId);

  if (isLoading || !session || !block) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href={`/learn/session/${params.id}`} className="text-sm text-st-muted hover:text-st-accent">
        ← Back to session
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-st-ink">Practice</h1>
        <button type="button" onClick={() => setAskOpen(true)} className="rounded-full border border-st-bd1 p-2.5">
          <MessageCircle size={20} />
        </button>
      </div>
      <SpineRail spine={session.spine} />
      <div className="mt-6">
        <BlockRenderer
          block={block}
          readOnly={session.readOnly}
          onCheckpointAnswer={(choice, explanation) =>
            answer.mutate({ blockId: block.id, body: { choice, explanation } })
          }
          onPracticeSubmit={(ans, hintsUsed) =>
            answer.mutate({ blockId: block.id, body: { answer: ans, hintsUsed } })
          }
        />
      </div>
      <AskPetrosDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        context={{
          kind: 'practice',
          id: params.id,
          blockId: params.blockId,
          contextLabel: session.topicTitle,
        }}
      />
    </div>
  );
}
