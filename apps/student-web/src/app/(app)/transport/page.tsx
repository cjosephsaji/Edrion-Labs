'use client';

import { BusFront } from 'lucide-react';
import { ActionLink, Card, PageHeader, StatusPill } from '@/components/design-system';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  UnauthorizedState,
} from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';

type Transport = {
  assignmentId?: string | null;
  routeId?: string | null;
  routeName?: string | null;
  stopName?: string | null;
  vehicleRegistration?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  status?: string | null;
};

export default function Page() {
  const q = useStudentList<Transport>('transport', '/student/surfaces/transport');
  if (q.isLoading) return <LoadingBlock />;
  if (q.error instanceof StudentApiError && q.error.status === 401) return <UnauthorizedState />;
  if (q.error instanceof StudentApiError && q.error.status === 403) {
    return <ErrorState title="Transport isn’t available" description="Your institution has not enabled transport services in the portal." retryable={false} />;
  }
  if (q.error) {
    return <ErrorState description={formatApiError(q.error)} onRetry={() => void q.refetch()} />;
  }
  const item = q.data;
  if (!item?.routeName) {
    return (
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeader eyebrow="Campus services" title="Transport" description="Your transport assignment and route." />
        <EmptyState icon={BusFront} title="No transport assignment" description="A route, stop, and vehicle will appear after your institution assigns them." actionHref="/requests/new" actionLabel="Request transport help" />
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader
        eyebrow="Campus services"
        title="Transport"
        description="Your transport assignment and route."
        actions={<ActionLink href="/requests/new" variant="secondary">Request change</ActionLink>}
      />
      <Card variant="emphasis" density="roomy" className="min-h-[240px]">
        <div className="flex flex-wrap items-start justify-between gap-4"><BusFront className="h-8 w-8 text-[#a9c4ba]" /><StatusPill label={item.status ?? 'Assigned'} tone="positive" /></div>
        <p className="mt-8 text-xs uppercase tracking-[.1em] text-[#a9c4ba]">Your route</p>
        <h2 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] leading-none">{item.routeName}</h2>
        <p className="mt-4 text-base leading-7 text-[#cfddd8]">{[item.stopName, item.vehicleRegistration, item.driverName, item.driverPhone].filter(Boolean).join(' · ') || 'Details to follow'}</p>
      </Card>
    </div>
  );
}
