'use client';

import { BedDouble } from 'lucide-react';
import { Card, PageHeader, StatusPill } from '@/components/design-system';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  UnauthorizedState,
} from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';

type Hostel = {
  blockName?: string | null;
  roomNo?: string | null;
  warden?: string | null;
};

export default function Page() {
  const q = useStudentList<Hostel>('hostel', '/student/surfaces/hostel');
  if (q.isLoading) return <LoadingBlock />;
  if (q.error instanceof StudentApiError && q.error.status === 401) return <UnauthorizedState />;
  if (q.error instanceof StudentApiError && q.error.status === 403) {
    return <ErrorState title="Hostel isn’t available" description="Your institution has not enabled hostel services in the portal." retryable={false} />;
  }
  if (q.error) return <ErrorState description={formatApiError(q.error)} onRetry={() => void q.refetch()} />;
  const item = q.data;
  if (!item?.blockName && !item?.roomNo) {
    return (
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeader eyebrow="Campus services" title="Hostel" description="Your hostel allocation details." />
        <EmptyState icon={BedDouble} title="No hostel allocation" description="Your block, room, and warden details appear after allocation is published." actionHref="/requests/new" actionLabel="Request hostel help" />
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader eyebrow="Campus services" title="Hostel" description="Your hostel allocation details." />
      <Card variant="emphasis" density="roomy" className="min-h-[240px]">
        <div className="flex items-start justify-between gap-4"><BedDouble className="h-8 w-8 text-[#a9c4ba]" /><StatusPill label="Allocated" tone="positive" /></div>
        <p className="mt-8 text-xs uppercase tracking-[.1em] text-[#a9c4ba]">Your room</p>
        <h2 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] leading-none">{item.blockName ?? 'Hostel'}{item.roomNo ? ` · ${item.roomNo}` : ''}</h2>
        <p className="mt-4 text-base leading-7 text-[#cfddd8]">{item.warden ? `Warden · ${item.warden}` : 'Warden details to follow'}</p>
      </Card>
    </div>
  );
}
