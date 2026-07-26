'use client';
import { useTransportSurface } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function TransportPage() {
  const { data, isLoading } = useTransportSurface();
  const hasData = data?.routeName || data?.stopName;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>SCHOOL</Eyebrow>} title="Transport" />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : !hasData ? (
        <EmptyState
          className="mt-8"
          eyebrow="NOT ASSIGNED"
          title="No transport details"
          description="Your route and stop will show here when your school assigns them."
        />
      ) : (
        <div className="mt-6 rounded-[15px] border border-st-bd1 bg-st-card divide-y divide-st-divider">
          <Row label="Route" value={data?.routeName} />
          <Row label="Stop" value={data?.stopName} />
          <Row label="Vehicle" value={data?.vehicleRegistration} />
          <Row label="Driver" value={data?.driverName} />
          <Row label="Phone" value={data?.driverPhone} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="px-4 py-3.5">
      <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">{label}</p>
      <p className="mt-1 text-sm text-st-ink">{value ?? '—'}</p>
    </div>
  );
}
