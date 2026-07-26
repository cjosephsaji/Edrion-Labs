'use client';
import { useHostelSurface } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function HostelPage() {
  const { data, isLoading } = useHostelSurface();
  const hasData = data?.blockName || data?.roomNo;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>SCHOOL</Eyebrow>} title="Hostel" />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : !hasData ? (
        <EmptyState
          className="mt-8"
          eyebrow="NOT ASSIGNED"
          title="No hostel assignment"
          description="Room and warden details appear here when you're allocated a hostel."
        />
      ) : (
        <div className="mt-6 rounded-[15px] border border-st-bd1 bg-st-card divide-y divide-st-divider">
          <Row label="Block" value={data?.blockName} />
          <Row label="Room" value={data?.roomNo} />
          <Row label="Warden" value={data?.warden} />
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
