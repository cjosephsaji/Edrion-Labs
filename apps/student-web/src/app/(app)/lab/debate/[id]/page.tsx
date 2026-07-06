'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDebate, useFinishDebate, useSubmitDebateTurn } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

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
    return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;
  }

  if (debate.feedback) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
        <h1 className="font-display text-2xl font-semibold text-st-ink">Debate feedback</h1>
        <p className="mt-2 text-sm text-st-muted italic">&ldquo;{debate.motion}&rdquo;</p>
        <Card className="mt-6">
          <p className="text-xs font-semibold text-st-faint">STRONGEST</p>
          <p className="mt-1 text-st-ink">{debate.feedback.strongest}</p>
        </Card>
        <Card className="mt-3">
          <p className="text-xs font-semibold text-st-faint">TO WORK ON</p>
          <p className="mt-1 text-st-ink">{debate.feedback.weakest}</p>
        </Card>
        <Card className="mt-3">
          <p className="text-xs font-semibold text-st-faint">TECHNIQUE</p>
          <p className="mt-1 text-st-ink">{debate.feedback.technique}</p>
        </Card>
        <PillButton className="mt-8" onClick={() => router.push('/lab/debate')}>
          Debate again
        </PillButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/lab/debate" className="text-sm text-st-accent">← Debate setup</Link>
      <p className="mt-4 text-[10px] font-semibold text-st-faint">{debate.stage.toUpperCase()}</p>
      <h1 className="font-display text-xl font-semibold text-st-ink">{debate.motion}</h1>
      <p className="mt-1 text-xs text-st-muted">
        You: {debate.side} · {debate.format.replace('_', ' ')}
      </p>

      <div className="mt-6 space-y-3 max-h-80 overflow-y-auto">
        {debate.turns.map((turn) => (
          <Card
            key={turn.id}
            className={turn.speakerRole === 'student' ? 'border-st-accent/30' : ''}
          >
            <p className="text-[10px] font-semibold text-st-faint">{turn.speakerRole.toUpperCase()}</p>
            <p className="mt-1 text-sm text-st-ink">{turn.text}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Your argument…"
          className="flex-1 rounded-xl border border-st-bd1 bg-st-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-st-accent/30"
        />
        <div className="flex flex-col gap-2">
          <PillButton onClick={() => void handleSend()} disabled={submitTurn.isPending}>
            Send
          </PillButton>
          <PillButton variant="ghost" onClick={() => void handleFinish()}>
            End
          </PillButton>
        </div>
      </div>
    </div>
  );
}
