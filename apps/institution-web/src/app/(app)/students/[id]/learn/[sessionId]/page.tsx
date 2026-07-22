'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/components/app-shell/topbar';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { LearnSessionTranscriptDto } from '@edrion/schemas';

export default function StudentLearnTranscriptPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const client = usePortalClient();
  const { scope } = useScope();

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'learn', 'transcript', params.id, params.sessionId],
    queryFn: () =>
      client.get<LearnSessionTranscriptDto>(
        `/portal/learn-policy/students/${params.id}/sessions/${params.sessionId}/transcript`,
        scope,
      ),
  });

  return (
    <>
      <Topbar title="Learn session transcript" />
      <div className="mx-auto max-w-3xl space-y-4 p-5">
        {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
        {error && <p className="text-sm text-danger">Transcript not available.</p>}
        {data && (
          <>
            <h1 className="text-lg font-semibold">{data.topicTitle}</h1>
            <p className="text-sm text-text-muted">
              {data.entryPoint} · {data.goal} · {new Date(data.startedAt).toLocaleString()}
            </p>
            <div className="space-y-3">
              {data.blocks.map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{b.moveType ?? b.blockType}</p>
                  {b.reasoning && <p className="mt-1 text-text-muted">{b.reasoning}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
