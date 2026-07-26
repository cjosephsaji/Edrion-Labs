'use client';
import { useRouter } from 'next/navigation';
import { useRevisionQueue, useRevisionRefresh } from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { PillButton } from '@/components/ui/pill-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, StatSlot } from '@/components/ui/primitives';

export default function RevisionPage() {
  const router = useRouter();
  const { data, isLoading } = useRevisionQueue();
  const refresh = useRevisionRefresh();

  const handleRefresh = async (topicId: string) => {
    const session = await refresh.mutateAsync(topicId);
    router.push(`/learn/session/${session.id}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/learn"
        eyebrow={<Eyebrow color="gold">REVISION</Eyebrow>}
        title="Revision queue"
        subtitle="Topics ready for spaced repetition — gold means due."
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatSlot label="Due" value={data?.counts.due ?? 0} from="Needs review now" />
        <StatSlot label="Fading" value={data?.counts.fading ?? 0} from="Review soon" />
        <StatSlot label="Fresh" value={data?.counts.fresh ?? 0} from="Recently learned" />
      </div>

      <div className="mt-8 space-y-3">
        {(data?.queue ?? []).map((item) => (
          <div
            key={item.topicId}
            className="rounded-[15px] border border-st-goldBd bg-st-goldSoftBg p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-st-goldInk">{item.title}</p>
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
          </div>
        ))}
        {(data?.queue ?? []).length === 0 && (
          <EmptyState
            eyebrow="ALL CAUGHT UP"
            title="No topics need revision"
            description="Complete learn sessions and they'll appear here when it's time to revisit."
          />
        )}
      </div>
    </div>
  );
}
