'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Pause } from 'lucide-react';
import { useLearnSession, usePath } from '@/lib/hooks';
import { nextBlockRoute, isReadThroughBlock } from '@/lib/learn-navigation';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { StreamingIndicator } from '@/components/learn/StreamingIndicator';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { CompletionOverlay } from '@/components/learn/CompletionOverlay';
import { Eyebrow, PetrosMark } from '@/components/ui/primitives';

export default function SessionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: session, isLoading, streaming, startStream, pause, finish, continueBlock, answer, hint, invalidate } =
    useLearnSession(params.id);
  const { data: path } = usePath();
  const [askOpen, setAskOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();
  const [showComplete, setShowComplete] = useState(false);

  const pathContext = useMemo(() => {
    if (!path || !session?.topicKey) return null;
    const idx = path.items.findIndex((item) => item.topicKey === session.topicKey);
    if (idx < 0) return null;
    return { title: path.title, index: idx + 1, total: path.items.length };
  }, [path, session?.topicKey]);

  const currentBlock = useMemo(() => {
    if (!session) return null;
    const incomplete = session.blocks.find((b) => !b.completedAt);
    return incomplete ?? session.blocks[session.blocks.length - 1] ?? null;
  }, [session]);

  useEffect(() => {
    if (session && session.status === 'active' && !session.readOnly) {
      startStream();
    }
  }, [session, startStream]);

  useEffect(() => {
    if (session?.status === 'completed') setShowComplete(true);
  }, [session?.status]);

  if (isLoading || !session) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  const isConcept =
    currentBlock &&
    ['concept_card', 'visual_explainer', 'worked_example', 'note_card'].includes(currentBlock.blockType);
  const handleFinishSession = async () => {
    try {
      await finish.mutateAsync();
    } catch {
      // Session may already be completed — still return to Learn home.
    }
    router.push('/learn');
  };

  const isPractice = currentBlock?.blockType === 'practice_item' || currentBlock?.blockType === 'checkpoint';

  const handleBlockContinue = async () => {
    if (!session || !currentBlock) return;
    if (isReadThroughBlock(currentBlock.blockType)) {
      const { session: updated } = await continueBlock.mutateAsync(currentBlock.id);
      router.push(nextBlockRoute(params.id, updated));
      return;
    }
    router.push(nextBlockRoute(params.id, session));
  };

  const fetchHint = async (blockId: string, rung: 2 | 3) => {
    const res = await hint.mutateAsync({ blockId, rung });
    return res.hint;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <div className="sticky top-0 z-20 -mx-4 border-b border-st-divider bg-st-page/95 px-4 py-3 backdrop-blur">
        {session.readOnly && (
          <p className="mb-2 rounded-lg border border-st-bd2 bg-st-surface2 px-3 py-2 text-xs text-st-muted">
            This session is complete — read-only. Reopen from History anytime.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{session.subjectLabel}</Eyebrow>
            <h1 className="truncate font-display text-xl font-semibold text-st-ink">{session.topicTitle}</h1>
            {pathContext && (
              <Link href="/learn/path" className="mt-1 inline-block text-xs text-st-muted hover:text-st-accent">
                Part of: {pathContext.title} ({pathContext.index} of {pathContext.total})
              </Link>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-st-muted">
              guided by Petros <PetrosMark />
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session.status === 'active' && (
              <button
                type="button"
                onClick={() => pause.mutate()}
                className="inline-flex items-center gap-1.5 rounded-full border border-st-bd2 bg-st-card px-3 py-2 text-xs font-semibold text-st-inkSoft hover:border-st-accent"
              >
                <Pause size={14} />
                Save and pause session
              </button>
            )}
            <button
              type="button"
              onClick={() => setAskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-st-amberBd bg-st-amberSoft px-3 py-2 text-xs font-semibold text-st-amberInk"
            >
              <MessageCircle size={14} />
              Ask Petros
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 min-[920px]:flex-row min-[920px]:gap-8">
        <SpineRail spine={session.spine} />

        <div className="min-w-0 flex-1">
          {streaming && (
            <div className="mb-4">
              <StreamingIndicator />
            </div>
          )}

          {currentBlock && (
            <div className="animate-st-block-in">
              {isConcept && (
                <Link
                  href={`/learn/session/${params.id}/concept/${currentBlock.id}`}
                  className="mb-3 inline-block text-sm font-semibold text-st-accent"
                >
                  Open concept view →
                </Link>
              )}
              {isPractice && (
                <Link
                  href={`/learn/session/${params.id}/practice/${currentBlock.id}`}
                  className="mb-3 inline-block text-sm font-semibold text-st-accent"
                >
                  Open practice →
                </Link>
              )}
              <BlockRenderer
                block={currentBlock}
                readOnly={session.readOnly}
                sessionId={params.id}
                onAsk={(q) => {
                  setPrefill(q);
                  setAskOpen(true);
                }}
                onFetchHint={fetchHint}
                onCheckpointAnswer={(choice, explanation) =>
                  answer.mutateAsync({ blockId: currentBlock.id, body: { choice, explanation } })
                }
                onPracticeSubmit={(ans, hintsUsed) =>
                  answer.mutateAsync({ blockId: currentBlock.id, body: { answer: ans, hintsUsed } })
                }
                onFinish={() => void handleFinishSession()}
                onContinue={() => void handleBlockContinue()}
                continueLoading={continueBlock.isPending}
              />
            </div>
          )}

          {!streaming && !currentBlock && (
            <div className="rounded-[15px] border border-dashed border-st-bd2 p-8 text-center text-sm text-st-muted">
              Session blocks will appear here as Petros builds them.
            </div>
          )}
        </div>
      </div>

      <AskPetrosDrawer
        open={askOpen}
        onClose={() => {
          setAskOpen(false);
          setPrefill(undefined);
        }}
        onPinned={invalidate}
        context={{
          kind: 'session',
          id: params.id,
          blockId: currentBlock?.id,
          contextLabel: session.topicTitle,
        }}
        initialQuestion={prefill}
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
