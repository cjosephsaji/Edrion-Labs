'use client';
import { useHostelSurface } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function HostelPage() {
  const { data, isLoading } = useHostelSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Hostel</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <Card className="mt-6 space-y-3">
          <div>
            <p className="text-xs font-semibold text-st-faint">Block</p>
            <p className="text-sm text-st-ink">{data?.blockName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-st-faint">Room</p>
            <p className="text-sm text-st-ink">{data?.roomNo ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-st-faint">Warden</p>
            <p className="text-sm text-st-ink">{data?.warden ?? '—'}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
