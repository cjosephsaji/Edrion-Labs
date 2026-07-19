'use client';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/guardian/hooks';
import { Card, Skeleton, EmptyState } from '@/components/guardian/ui';

type H = { boarder: boolean; room?: { roomNo: string; floor: string | null } | null; bedNo?: string | null; block?: { name: string; warden: string | null } | null };

export default function HostelPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<H>(`/students/${studentId}/hostel`);
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.boarder) return <><h1 className="text-lg font-bold mb-3">Hostel</h1><EmptyState title="Not a boarder" /></>;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Hostel</h1>
      <Card className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted">Block</span><span className="font-medium">{data.block?.name}</span></div>
        <div className="flex justify-between"><span className="text-muted">Warden</span><span className="font-medium">{data.block?.warden ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted">Room</span><span className="font-medium">{data.room?.roomNo}{data.room?.floor ? ` · Floor ${data.room.floor}` : ''}</span></div>
        <div className="flex justify-between"><span className="text-muted">Bed</span><span className="font-medium">{data.bedNo ?? '—'}</span></div>
      </Card>
    </div>
  );
}
