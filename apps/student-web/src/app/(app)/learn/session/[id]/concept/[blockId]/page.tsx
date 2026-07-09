'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useLearnSession } from '@/lib/hooks';
import { nextBlockRoute, isReadThroughBlock } from '@/lib/learn-navigation';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { StreamingIndicator } from '@/components/learn/StreamingIndicator';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { Eyebrow, PageHeader, PetrosMark } from '@/components/ui/primitives';

export default function ConceptBlockPage({
  params,
}: {
  params: { id: string; blockId: string };
}) {
  const router = useRouter();
  const { data: session, isLoading, streaming, startStream, answer, hint, continueBlock, finish, invalidate } =
    useLearnSession(params.id);
  const [askOpen, setAskOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();

  const block = session?.blocks.find((b) => b.id === params.blockId);

  useEffect(() => {
    if (session && session.status === 'active' && !session.readOnly) {
      startStream();
    }
  }, [session, startStream]);

  const handleFinishSession = async () => {
    try {
      await finish.mutateAsync();
    } catch {
      // Session may already be completed — still return to Learn home.
    }
    router.push('/learn');
  };

  const handleContinue = async () => {
    if (!session || !block) return;
    if (isReadThroughBlock(block.blockType)) {
      const { session: updated } = await continueBlock.mutateAsync(block.id);
      router.push(nextBlockRoute(params.id, updated));
      return;
    }
    router.push(nextBlockRoute(params.id, session));
  };

  const fetchHint = async (blockId: string, rung: 2 | 3) => {
    const res = await hint.mutateAsync({ blockId, rung });
    return res.hint;
  };

  if (isLoading || !session || !block) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <PageHeader
        backHref={`/learn/session/${params.id}`}
        backLabel="Session"
        eyebrow={<Eyebrow>{session.subjectLabel}</Eyebrow>}
        title={session.topicTitle}
        subtitle={
          <span className="flex items-center gap-1">
            Concept workspace · guided by Petros <PetrosMark />
          </span>
        }
        right={
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-st-amberBd bg-st-amberSoft px-3 py-2 text-xs font-semibold text-st-amberInk"
          >
            <MessageCircle size={14} />
            Ask Petros
          </button>
        }
      />

      <div className="mt-6 flex flex-col gap-4 min-[920px]:flex-row min-[920px]:gap-8">
        <SpineRail spine={session.spine} />
        <div className="min-w-0 flex-1">
          {streaming && (
            <div className="mb-4">
              <StreamingIndicator />
            </div>
          )}
          <BlockRenderer
            block={block}
            readOnly={session.readOnly}
            sessionId={params.id}
            onAsk={(q) => {
              setPrefill(q);
              setAskOpen(true);
            }}
            onFetchHint={fetchHint}
            onCheckpointAnswer={(choice, explanation) =>
              answer.mutateAsync({ blockId: block.id, body: { choice, explanation } })
            }
            onPracticeSubmit={(ans, hintsUsed) =>
              answer.mutateAsync({ blockId: block.id, body: { answer: ans, hintsUsed } })
            }
            onContinue={() => void handleContinue()}
            onFinish={() => void handleFinishSession()}
            continueLoading={continueBlock.isPending}
          />
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
          kind: 'concept',
          id: params.id,
          blockId: params.blockId,
          contextLabel: session.topicTitle,
        }}
        initialQuestion={prefill}
      />
    </div>
  );
}
