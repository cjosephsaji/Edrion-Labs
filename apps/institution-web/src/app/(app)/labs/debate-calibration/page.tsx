'use client';

import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from '@/lib/portal-client';
import { Topbar } from '@/components/app-shell/topbar';
import { Skeleton } from '@edrion/ui';

const INSTITUTION_SCOPE = { mode: 'institution' } as const;

export default function DebateCalibrationPage() {
  const client = usePortalClient();
  const reviews = useQuery({
    queryKey: ['portal', 'debate', 'calibration'],
    queryFn: () => client.get<{ items: unknown[] }>('/portal/debate/calibration/reviews', INSTITUTION_SCOPE),
  });

  return (
    <>
      <Topbar title="Debate calibration" />
      <div className="p-5 lg:p-6">
        {reviews.isLoading && <Skeleton className="h-40 w-full" />}
        <pre className="rounded-xl border border-border bg-surface p-4 text-xs overflow-auto">
          {JSON.stringify(reviews.data, null, 2)}
        </pre>
      </div>
    </>
  );
}
