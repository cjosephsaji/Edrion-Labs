'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useGet, usePost } from '@/lib/hooks';
import { Card, Pill, Skeleton, EmptyState, Button, Section } from '@/components/ui';

type Att = { summaryPct: number | null; days: Array<{ date: string; status: string; explained: boolean }> };
const tone: Record<string, string> = { present: 'good', late: 'warn', absent: 'bad', holiday: 'neutral' };

export default function AttendancePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<Att>(`/students/${studentId}/attendance`);
  const [reason, setReason] = useState('illness');
  const submit = usePost<{ studentId: string; dateFrom: string; dateTo: string; reasonCategory: string }>('/absence-notes', [`/students/${studentId}/attendance`]);

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  if (!data) return <EmptyState title="No attendance yet" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Attendance</h1>
      <Card><p className="text-xs text-muted">Present rate</p><p className="text-3xl font-bold">{data.summaryPct ?? '—'}%</p></Card>

      <Section title="Recent days">
        <div className="space-y-2">
          {data.days.slice(0, 30).map((d, i) => (
            <Card key={i} className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">{d.date}</span>
              <span className="flex items-center gap-2">
                {d.status === 'absent' && !d.explained && <Pill tone="bad">Unexplained</Pill>}
                <Pill tone={tone[d.status] ?? 'neutral'}>{d.status}</Pill>
              </span>
            </Card>
          ))}
          {data.days.length === 0 && <EmptyState title="No records in range" />}
        </div>
      </Section>

      <Section title="Submit an absence note">
        <Card className="space-y-3">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-line px-3 py-3 text-sm">
            {['illness', 'family', 'travel', 'other'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button
            disabled={submit.isPending}
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              submit.mutate({ studentId, dateFrom: today, dateTo: today, reasonCategory: reason });
            }}
          >
            {submit.isPending ? 'Submitting…' : submit.isSuccess ? 'Submitted ✓' : 'Submit note for today'}
          </Button>
        </Card>
      </Section>
    </div>
  );
}
