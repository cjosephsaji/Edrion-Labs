'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExamGenerationStream, useMockExam, useStartExam } from '@/lib/hooks';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { PillButton } from '@/components/ui/pill-button';

export default function MockExamStatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: exam } = useMockExam(id, { pollWhileGenerating: true });
  const stream = useExamGenerationStream(id);
  const start = useStartExam();

  useEffect(() => {
    if (exam?.status === 'generating' && stream.status === 'idle') stream.start();
  }, [exam?.status, stream]);

  useEffect(() => {
    if (exam?.status === 'ready') {
      // stay on page with Start CTA
    }
  }, [exam?.status]);

  const begin = async () => {
    await start.mutateAsync(id);
    router.push(`/lab/mock-exams/${id}/attempt`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab/mock-exams"
        backLabel="Mock exams"
        eyebrow={<Eyebrow color="amber">GENERATING</Eyebrow>}
        title={exam?.title ?? 'Mock exam'}
        subtitle={
          exam?.status === 'generating'
            ? 'Petros is filling sections…'
            : exam?.status === 'ready'
              ? 'Ready when you are.'
              : exam?.status ?? '…'
        }
      />

      {exam?.status === 'generating' && (
        <div className="mt-8 space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-st-surface2">
            <div className="h-full w-2/3 animate-st-shimmer rounded-full bg-st-accent/60" />
          </div>
          <ul className="space-y-1 font-mono text-xs text-st-muted">
            {stream.events.slice(-8).map((ev, i) => (
              <li key={i}>
                {ev.type}
                {ev.type === 'question' && ev.qtype ? ` · ${ev.qtype}` : ''}
                {ev.type === 'section' && 'name' in ev ? ` · ${ev.name}` : ''}
              </li>
            ))}
          </ul>
          {stream.degraded && <p className="text-sm text-st-amber">{stream.degraded}</p>}
          {stream.error && <p className="text-sm text-st-danger">{stream.error}</p>}
        </div>
      )}

      {exam?.generationNotice && (
        <p className="mt-4 text-sm text-st-amber">{exam.generationNotice}</p>
      )}

      {exam?.status === 'ready' && (
        <PillButton className="mt-8" onClick={() => void begin()} disabled={start.isPending}>
          Enter exam room
        </PillButton>
      )}

      {exam?.status === 'failed' && (
        <p className="mt-6 text-sm text-st-danger">Generation failed. Try another blueprint.</p>
      )}
    </div>
  );
}
