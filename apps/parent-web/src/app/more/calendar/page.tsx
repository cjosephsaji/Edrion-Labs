'use client';
import { useGet } from '@/lib/hooks';
import { Card, Pill, Skeleton, EmptyState } from '@/components/ui';

type Cal = { items: Array<{ id: string; title: string; type: string; startsOn: string }> };
const tone: Record<string, string> = { holiday: 'good', exam_period: 'warn', ptm: 'brand', deadline: 'bad' };

export default function CalendarPage() {
  const { data, isLoading } = useGet<Cal>('/calendar');
  if (isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">School calendar</h1>
      {data?.items.length ? data.items.map((e) => (
        <Card key={e.id} className="flex items-center justify-between">
          <div><p className="text-sm font-medium">{e.title}</p><p className="text-xs text-muted">{new Date(e.startsOn).toDateString()}</p></div>
          <Pill tone={tone[e.type] ?? 'neutral'}>{e.type.replace(/_/g, ' ')}</Pill>
        </Card>
      )) : <EmptyState title="No events" />}
    </div>
  );
}
