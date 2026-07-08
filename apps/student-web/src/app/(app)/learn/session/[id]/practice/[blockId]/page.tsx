'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useLearnSession } from '@/lib/hooks';
import { nextBlockRoute } from '@/lib/learn-navigation';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { StreamingIndicator } from '@/components/learn/StreamingIndicator';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { Eyebrow, PageHeader, PetrosMark } from '@/components/ui/primitives';

export default function PracticeBlockPage({
  params,
}: {
  params: { id: string; blockId: string };
}) {
  const router = useRouter();
  const { data: session, isLoading, streaming, startStream, answer, hint, invalidate } =
    useLearnSession(params.id);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    if (session && session.status === 'active' && !session.readOnly) {
      startStream();
    }
  }, [session, startStream]);

  const block = session?.blocks.find((b) => b.id === params.blockId);
  const activeBlock = session?.blocks.find((b) => !b.completedAt) ?? block;

  useEffect(() => {
    if (!session || !block) return;
    if (block.completedAt) {
      const route = nextBlockRoute(params.id, session);
      if (route !== `/learn/session/${params.id}/practice/${params.blockId}`) {
        router.replace(route);
      }
    }
  }, [session, block, params.id, params.blockId, router]);

  useEffect(() => {
    if (!session || block) return;
    const next = session.blocks.find((b) => !b.completedAt);
    if (next && next.id !== params.blockId) {
      router.replace(nextBlockRoute(params.id, session));
    }
  }, [session, block, params.id, params.blockId, router]);

  const fetchHint = async (blockId: string, rung: 2 | 3) => {
    const res = await hint.mutateAsync({ blockId, rung });
    return res.hint;
  };

  const handleFinishSession = async () => {
    try {
      await finish.mutateAsync();
    } catch {
      // Session may already be completed — still return to Learn home.
    }
    router.push('/learn');
  };

  const handleContinue = () => {
    if (!session) return;
    router.push(nextBlockRoute(params.id, session));
  };

  const renderBlock = block ?? activeBlock;

  if (isLoading || !session) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (!renderBlock) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        {streaming ? <StreamingIndicator /> : null}
        <p className="mt-4 text-center text-sm text-st-muted">
          Petros is preparing your next step…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <PageHeader
        backHref={`/learn/session/${params.id}`}
        backLabel="Session"
        eyebrow={<Eyebrow color="violet">PRACTICE</Eyebrow>}
        title={session.topicTitle}
        subtitle={
          <span className="flex items-center gap-1">
            Practice workspace · Petros <PetrosMark />
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
            block={renderBlock}
            readOnly={session.readOnly}
            sessionId={params.id}
            onFetchHint={fetchHint}
            onCheckpointAnswer={(choice, explanation) =>
              answer.mutateAsync({ blockId: renderBlock.id, body: { choice, explanation } })
            }
            onPracticeSubmit={(ans, hintsUsed) =>
              answer.mutateAsync({ blockId: renderBlock.id, body: { answer: ans, hintsUsed } })
            }
            onContinue={handleContinue}
            onFinish={() => void handleFinishSession()}
          />
        </div>
      </div>

      <AskPetrosDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        onPinned={invalidate}
        context={{
          kind: 'practice',
          id: params.id,
          blockId: renderBlock.id,
          contextLabel: session.topicTitle,
        }}
      />
    </div>
  );
}
