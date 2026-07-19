'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/guardian/hooks';
import { money } from '@/lib/guardian/api';
import { Card, Pill, Skeleton, EmptyState } from '@/components/guardian/ui';

type L = { loans: Array<{ id: string; title: string; author: string | null; status: string; dueDate: string | null; overdue: boolean; fineMinor: number }> };

export default function LibraryPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<L>(`/students/${studentId}/library`);
  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Library</h1>
      {data?.loans.length ? data.loans.map((l) => (
        <Card key={l.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{l.title}</span>
            {l.overdue ? <Pill tone="bad">Overdue</Pill> : <Pill tone={l.status === 'returned' ? 'neutral' : 'good'}>{l.status}</Pill>}
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Due {l.dueDate ?? '—'}</span>
            {l.fineMinor > 0 && <Link href="/family/fees" className="text-bad font-semibold">Fine {money(l.fineMinor)} ›</Link>}
          </div>
        </Card>
      )) : <EmptyState title="No library loans" />}
    </div>
  );
}
