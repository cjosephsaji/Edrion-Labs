'use client';
import Link from 'next/link';
import { Skeleton, ErrorState, EmptyState } from '@edrion/ui';
import { useSubscriptionByInstitution } from '@edrion/api-client';
import { SubscriptionDetailView } from './subscription-detail-view';

/** Subscription tab inside the institution detail — the institution's current subscription. */
export function SubscriptionTab({ institutionId }: { institutionId: string }) {
  const { data: sub, isLoading, isError, refetch } = useSubscriptionByInstitution(institutionId);

  if (isLoading) return <Skeleton className="h-32" />;
  if (isError) return <ErrorState description="Could not load the subscription." />;
  if (!sub) {
    return (
      <EmptyState
        title="No subscription"
        description="This institution is not on a plan yet."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href={`/subscriptions/${sub.id}`} className="text-sm text-primary hover:underline">
          Open full subscription →
        </Link>
      </div>
      <SubscriptionDetailView sub={sub} onChanged={() => void refetch()} />
    </div>
  );
}
