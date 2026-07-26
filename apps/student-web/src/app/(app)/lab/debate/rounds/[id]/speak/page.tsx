'use client';
import { useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDebateRound, useFinaliseDebateTurn } from '@/lib/hooks/debate-lab';
import { useDebateRecorder } from '@/lib/hooks/use-debate-recorder';
import { PillButton } from '@/components/ui/pill-button';
import { PageHeader } from '@/components/ui/primitives';

export default function DebateSpeakPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useDebateRound(params.id);
  const finalise = useFinaliseDebateTurn(params.id);

  const debate = data?.debate as { status?: string; currentTurnIndex?: number; motionText?: string; motion?: string } | undefined;
  const turns = (data?.turns ?? []) as Array<{ id: string; turnIndex: number; seatKey?: string; captureState?: string; sttState?: string }>;
  const participants = (data?.participants ?? []) as Array<{ seatKey?: string; participantKind?: string }>;

  const activeIndex = debate?.currentTurnIndex ?? 0;
  const activeTurn = turns.find((t) => t.turnIndex === activeIndex);
  const recorder = useDebateRecorder(params.id, activeTurn?.id);
  const activeSeat = activeTurn?.seatKey;
  const isAiTurn = participants.some((p) => p.seatKey === activeSeat && p.participantKind === 'ai');

  const motion = debate?.motionText ?? debate?.motion ?? '';

  const statusLine = useMemo(() => {
    if (debate?.status === 'capture_complete' || debate?.status === 'adjudicating') return 'Deliberating…';
    if (debate?.status === 'report_ready') return 'Report ready';
    if (isAiTurn) return 'Opponent is speaking…';
    if (activeTurn?.captureState === 'stored' && activeTurn.sttState !== 'done') return 'Transcribing your speech…';
    return 'Your turn — deliver your speech, then end when finished.';
  }, [debate?.status, isAiTurn, activeTurn]);

  useEffect(() => {
    if (debate?.status === 'report_ready') {
      router.replace(`/lab/debate/rounds/${params.id}/report`);
    }
  }, [debate?.status, params.id, router]);

  const endSpeech = async () => {
    if (!activeTurn || isAiTurn) return;
    if (recorder.recording) await recorder.stop();
    else await finalise.mutateAsync(activeTurn.id);
    if (debate?.status === 'capture_complete') {
      router.push(`/lab/debate/rounds/${params.id}/deliberating`);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col px-4 py-6">
      <PageHeader title="Speaking" subtitle={motion} backHref={`/lab/debate/rounds/${params.id}/prep`} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="h-40 w-40 rounded-full border-4 border-emerald-500/60 p-6 flex items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums">{activeIndex + 1}</span>
        </div>
        <p className="mt-8 text-sm text-st-muted">{statusLine}</p>
      </div>
      {!isAiTurn && (
        <div className="flex flex-col gap-3">
          {!recorder.recording ? (
            <PillButton className="w-full" onClick={() => void recorder.start()}>
              Start recording
            </PillButton>
          ) : (
            <PillButton className="w-full" variant="soft" onClick={() => void recorder.stop()}>
              End speech
            </PillButton>
          )}
          <PillButton className="w-full" disabled={finalise.isPending} onClick={() => void endSpeech()}>
            Finalise turn
          </PillButton>
        </div>
      )}
      {(debate?.status === 'adjudicating' || debate?.status === 'capture_complete') && (
        <PillButton className="mt-3 w-full" onClick={() => router.push(`/lab/debate/rounds/${params.id}/deliberating`)}>
          View deliberation
        </PillButton>
      )}
    </div>
  );
}
