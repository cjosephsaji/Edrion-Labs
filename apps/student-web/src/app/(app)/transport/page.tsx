'use client';
import { useTransportSurface } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function TransportPage() {
  const { data, isLoading } = useTransportSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Transport</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <Card className="mt-6 space-y-3">
          <Row label="Route" value={data?.routeName} />
          <Row label="Stop" value={data?.stopName} />
          <Row label="Vehicle" value={data?.vehicleRegistration} />
          <Row label="Driver" value={data?.driverName} />
          <Row label="Phone" value={data?.driverPhone} />
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-st-faint">{label}</p>
      <p className="text-sm text-st-ink">{value ?? '—'}</p>
    </div>
  );
}
