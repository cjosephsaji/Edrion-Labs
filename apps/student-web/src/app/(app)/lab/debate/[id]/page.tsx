'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDebate, useFinishDebate, useSubmitDebateTurn } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader, PetrosMark } from '@/components/ui/primitives';

export default function DebateRoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: debate, refetch } = useDebate(params.id);
  const submitTurn = useSubmitDebateTurn();
  const finish = useFinishDebate();
  const [text, setText] = useState('');

  const handleSend = async () => {
    if (!text.trim()) return;
    await submitTurn.mutateAsync({ id: params.id, text: text.trim() });
    setText('');
    void refetch();
  };

  const handleFinish = async () => {
    await finish.mutateAsync(params.id);
    void refetch();
  };

  if (!debate) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="h-64 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (debate.feedback) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref="/lab/debate"
          eyebrow={<Eyebrow color="blue">DEBATE FEEDBACK</Eyebrow>}
          title="No winner — just evidence"
          subtitle={`"${debate.motion}"`}
        />
        <div className="mt-6 space-y-3">
          <Card eyebrow="STRONGEST" noPadding>
            <p className="p-4 text-sm text-st-ink">{debate.feedback.strongest}</p>
          </Card>
          <Card eyebrow="TO WORK ON" noPadding>
            <p className="p-4 text-sm text-st-ink">{debate.feedback.weakest}</p>
          </Card>
          <Card eyebrow="TECHNIQUE" noPadding>
            <p className="p-4 text-sm text-st-ink">{debate.feedback.technique}</p>
          </Card>
        </div>
        <PillButton className="mt-8" onClick={() => router.push('/lab/debate')}>
          Debate again
        </PillButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab/debate"
        eyebrow={<Eyebrow color="blue">{debate.stage.toUpperCase()}</Eyebrow>}
        title={debate.motion}
        subtitle={
          <span className="flex items-center gap-1">
            vs Petros <PetrosMark />
          </span>
        }
      />

      <div className="mt-6 space-y-3">
        {(debate.turns ?? []).map((turn) => (
          <div
            key={turn.id}
            className={`rounded-[15px] border px-4 py-3 text-sm ${
              turn.speakerRole === 'creator'
                ? 'border-st-blue/30 bg-st-blueSoft/40 text-st-ink'
                : 'border-st-bd1 bg-st-card text-st-muted'
            }`}
          >
            <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">
              {turn.speakerRole === 'creator' ? 'YOU' : 'PETROS'}
            </p>
            <p className="mt-1">{turn.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[15px] border border-st-bd2 bg-st-card p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Make your argument…"
          className="w-full resize-none bg-transparent text-sm outline-none"
          rows={3}
        />
        <div className="mt-3 flex gap-2">
          <PillButton onClick={() => void handleSend()} disabled={submitTurn.isPending || !text.trim()}>
            Send
          </PillButton>
          <PillButton variant="soft" onClick={() => void handleFinish()} disabled={finish.isPending}>
            End debate
          </PillButton>
        </div>
      </div>
    </div>
  );
}
