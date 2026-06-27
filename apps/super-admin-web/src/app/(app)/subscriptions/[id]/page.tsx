'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { StatusBadge, Skeleton, ErrorState } from '@edrion/ui';
import { useSubscription } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { SubscriptionDetailView } from '@/components/subscriptions/subscription-detail-view';

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: sub, isLoading, isError, refetch } = useSubscription(id);

  return (
    <>
      <Topbar title="Subscription" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/subscriptions" className="hover:text-text-primary">Subscriptions</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{sub?.institutionName ?? '…'}</span>
        </nav>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !sub ? (
          <ErrorState description="Could not load this subscription." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-text-primary">{sub.institutionName ?? 'Subscription'}</h2>
                <StatusBadge status={sub.status} />
              </div>
              {sub.institutionId && (
                <Link href={`/institutions/${sub.institutionId}?tab=subscription`} className="text-sm text-primary hover:underline">
                  View institution →
                </Link>
              )}
            </div>
            <SubscriptionDetailView sub={sub} onChanged={() => void refetch()} />
          </>
        )}
      </div>
    </>
  );
}
