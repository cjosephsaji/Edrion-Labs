'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useJoinDebate } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

export default function DebateJoinPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const join = useJoinDebate();

  useEffect(() => {
    if (!params.token || join.isPending || join.isSuccess) return;
    void join.mutateAsync(params.token).then((result) => {
      router.replace(`/lab/debate/${result.debateId}`);
    });
  }, [params.token, join, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center animate-st-block-in">
      <p className="text-4xl">🗣️</p>
      <h1 className="mt-4 font-display text-xl font-semibold text-st-ink">Joining debate…</h1>
      <p className="mt-2 text-sm text-st-muted">
        {join.isPending ? 'Connecting you to the room.' : join.isError ? 'Could not join this invite.' : 'Almost there.'}
      </p>
      {join.isError && (
        <div className="mt-6 space-y-3">
          <PillButton onClick={() => void join.mutateAsync(params.token)}>Try again</PillButton>
          <Link href="/lab/debate" className="block text-sm text-st-accent">← Back to debate setup</Link>
        </div>
      )}
    </div>
  );
}
