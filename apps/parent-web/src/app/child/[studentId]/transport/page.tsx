'use client';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/hooks';
import { Card, Pill, Skeleton, EmptyState, Section } from '@/components/ui';

type T = { assigned: boolean; route?: { name: string; code: string | null } | null; stopName?: string | null; pickupTime?: string | null; dropTime?: string | null; incidents?: Array<{ id: string; type: string; description: string | null; status: string }> };

export default function TransportPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<T>(`/students/${studentId}/transport`);
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.assigned) return <><h1 className="text-lg font-bold mb-3">Transport</h1><EmptyState title="Not using school transport" /></>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Transport</h1>
      <Card className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted">Route</span><span className="font-medium">{data.route?.name}</span></div>
        <div className="flex justify-between"><span className="text-muted">Stop</span><span className="font-medium">{data.stopName ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted">Pickup</span><span className="font-medium">{data.pickupTime ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted">Drop</span><span className="font-medium">{data.dropTime ?? '—'}</span></div>
      </Card>
      <Section title="Route updates">
        {data.incidents?.length ? data.incidents.map((i) => (
          <Card key={i.id} className="flex items-center justify-between border-warn/40 bg-warn/5">
            <span className="text-sm">{i.description ?? i.type}</span>
            <Pill tone={i.status === 'open' ? 'warn' : 'neutral'}>{i.type}</Pill>
          </Card>
        )) : <EmptyState title="No active incidents" />}
      </Section>
    </div>
  );
}
