'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDebateRound } from '@/lib/hooks/debate-lab';
import { PageHeader } from '@/components/ui/primitives';

export default function DebateDeliberatingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useDebateRound(params.id);
  const status = (data?.debate as { status?: string } | undefined)?.status;

  useEffect(() => {
    if (status === 'report_ready') {
      router.replace(`/lab/debate/rounds/${params.id}/report`);
    }
  }, [status, params.id, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <PageHeader title="The judge is deliberating" subtitle="This usually takes under a minute." />
      <div className="mt-12 animate-pulse text-sm text-st-muted">Weighing clashes and checking quotes…</div>
    </div>
  );
}
