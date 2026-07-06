'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useLearnSession } from '@/lib/hooks';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { StreamingIndicator } from '@/components/learn/StreamingIndicator';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { CompletionOverlay } from '@/components/learn/CompletionOverlay';

export default function SessionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: session, isLoading, streaming, startStream, finish } = useLearnSession(params.id);
  const [askOpen, setAskOpen] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const currentBlock = useMemo(() => {
    if (!session) return null;
    const incomplete = session.blocks.find((b) => !b.completedAt);
    return incomplete ?? session.blocks[session.blocks.length - 1] ?? null;
  }, [session]);

  useEffect(() => {
    if (session && session.status === 'active' && session.blocks.length === 0) {
      startStream();
    }
  }, [session, startStream]);

  useEffect(() => {
    if (session?.status === 'completed') setShowComplete(true);
  }, [session?.status]);

  if (isLoading || !session) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  const isConcept =
    currentBlock &&
    ['concept_card', 'visual_explainer', 'worked_example', 'note_card'].includes(currentBlock.blockType);
  const isPractice = currentBlock?.blockType === 'practice_item' || currentBlock?.blockType === 'checkpoint';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-st-faint">{session.subjectLabel}</p>
          <h1 className="font-display text-xl font-semibold text-st-ink">{session.topicTitle}</h1>
        </div>
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          className="rounded-full border border-st-bd1 p-2.5 text-st-muted hover:border-st-accent/40"
        >
          <MessageCircle size={20} />
        </button>
      </div>

      <SpineRail spine={session.spine} />

      {streaming && <div className="mt-4"><StreamingIndicator /></div>}

      {currentBlock && (
        <div className="mt-6">
          {isConcept && (
            <Link
              href={`/learn/session/${params.id}/concept/${currentBlock.id}`}
              className="text-sm font-semibold text-st-accent"
            >
              Open concept view →
            </Link>
          )}
          {isPractice && (
            <Link
              href={`/learn/session/${params.id}/practice/${currentBlock.id}`}
              className="text-sm font-semibold text-st-accent"
            >
              Open practice →
            </Link>
          )}
          <BlockRenderer
            block={currentBlock}
            readOnly={session.readOnly}
            onFinish={() => finish.mutate()}
          />
        </div>
      )}

      <AskPetrosDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        context={{
          kind: 'session',
          id: params.id,
          contextLabel: session.topicTitle,
        }}
      />

      {showComplete && (
        <CompletionOverlay
          title="Great work!"
          subtitle={`You completed ${session.topicTitle}`}
          onContinue={() => router.push('/learn')}
        />
      )}
    </div>
  );
}
