'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRevisionQueue, useRevisionRefresh } from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { StatCard } from '@/components/learn/StatCard';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

export default function RevisionPage() {
  const router = useRouter();
  const { data, isLoading } = useRevisionQueue();
  const refresh = useRevisionRefresh();

  const handleRefresh = async (topicId: string) => {
    const session = await refresh.mutateAsync(topicId);
    router.push(`/learn/session/${session.id}`);
  };

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/learn" className="text-sm text-st-muted hover:text-st-accent">← Learn</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Revision queue</h1>
      <p className="mt-1 text-sm text-st-muted">Topics ready for spaced repetition.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Due" value={data?.counts.due ?? 0} from="Needs review now" />
        <StatCard label="Fading" value={data?.counts.fading ?? 0} from="Review soon" />
        <StatCard label="Fresh" value={data?.counts.fresh ?? 0} from="Recently learned" />
      </div>

      <div className="mt-8 space-y-3">
        {(data?.queue ?? []).map((item) => (
          <Card key={item.topicId}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-st-ink">{item.title}</p>
                <p className="text-xs text-st-muted">
                  Last touched {new Date(item.lastTouched).toLocaleDateString()}
                </p>
              </div>
              <FreshnessChip freshness={item.freshness} />
            </div>
            {(item.freshness === 'due' || item.freshness === 'fading') && (
              <PillButton
                variant="soft"
                className="mt-3"
                onClick={() => void handleRefresh(item.topicId)}
                disabled={refresh.isPending}
              >
                Quick refresh
              </PillButton>
            )}
          </Card>
        ))}
        {(data?.queue ?? []).length === 0 && (
          <p className="text-sm text-st-muted">No topics in your revision queue yet.</p>
        )}
      </div>
    </div>
  );
}
