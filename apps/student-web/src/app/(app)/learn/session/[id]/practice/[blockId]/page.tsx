'use client';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLearnSession } from '@/lib/hooks';
import { SpineRail } from '@/components/learn/SpineRail';
import { BlockRenderer } from '@/components/learn/BlockRenderer';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { Eyebrow, PageHeader, PetrosMark } from '@/components/ui/primitives';

export default function PracticeBlockPage({
  params,
}: {
  params: { id: string; blockId: string };
}) {
  const { data: session, isLoading, answer } = useLearnSession(params.id);
  const [askOpen, setAskOpen] = useState(false);

  const block = session?.blocks.find((b) => b.id === params.blockId);

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
