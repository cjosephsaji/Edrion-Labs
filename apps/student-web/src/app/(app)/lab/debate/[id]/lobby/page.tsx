'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDebateLobby } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

export default function DebateLobbyPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: lobby } = useDebateLobby(params.id);

  const record = lobby as {
    inviteUrl?: string;
    ready?: boolean;
    participants?: { displayName: string; side: string | null }[];
  } | undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/lab/debate" className="text-sm text-st-accent">← Debate setup</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Waiting for your friend</h1>
      <p className="mt-2 text-sm text-st-muted">Share the link below — debate starts when they join.</p>

      {record?.inviteUrl && (
        <Card className="mt-6">
          <p className="text-xs text-st-faint">INVITE LINK</p>
          <p className="mt-2 break-all text-sm text-st-accent">{record.inviteUrl}</p>
          <PillButton
            className="mt-4"
            variant="ghost"
            onClick={() => void navigator.clipboard.writeText(record.inviteUrl!)}
          >
            Copy link
          </PillButton>
        </Card>
      )}

      <div className="mt-6 space-y-2">
        {(record?.participants ?? []).map((p, i) => (
          <Card key={i}>
            <p className="font-medium text-st-ink">{p.displayName}</p>
            <p className="text-xs text-st-muted">{p.side ?? 'Choosing side…'}</p>
          </Card>
        ))}
      </div>

      {record?.ready && (
        <PillButton className="mt-8" onClick={() => router.push(`/lab/debate/${params.id}`)}>
          Enter debate room
        </PillButton>
      )}
    </div>
  );
}
