'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useGet, usePost } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Button, Section } from '@/components/guardian/ui';
import { Select } from '@edrion/ui';

type SubjectRow = {
  subjectId: string | null;
  subjectName: string | null;
  pct: number | null;
  zone: string;
  forecast: string;
};

type Att = {
  summaryPct: number | null;
  thresholdPct: number;
  zone: string;
  forecast: string | null;
  subjects: SubjectRow[];
  days: Array<{ date: string; status: string; explained: boolean }>;
};

const statusTone: Record<string, string> = {
  present: 'good',
  late: 'warn',
  absent: 'bad',
  holiday: 'neutral',
  od: 'good',
  excused: 'neutral',
};

const zoneTone: Record<string, string> = {
  safe: 'good',
  warning: 'warn',
  below: 'bad',
  unrecoverable: 'bad',
};

const zoneLabel: Record<string, string> = {
  safe: 'On track',
  warning: 'Near threshold',
  below: 'Below threshold',
  unrecoverable: 'Critical',
};

export default function AttendancePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<Att>(`/students/${studentId}/attendance`);
  const [reason, setReason] = useState('illness');
  const submit = usePost<{ studentId: string; dateFrom: string; dateTo: string; reasonCategory: string }>(
    '/absence-notes',
    [`/students/${studentId}/attendance`],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return <EmptyState title="No attendance yet" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Attendance</h1>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Present rate</p>
            <p className="text-3xl font-bold">{data.summaryPct ?? '—'}%</p>
            <p className="mt-1 text-xs text-muted">Minimum required: {data.thresholdPct}%</p>
          </div>
          <Pill tone={zoneTone[data.zone] ?? 'neutral'}>{zoneLabel[data.zone] ?? data.zone}</Pill>
        </div>
        {data.forecast ? <p className="text-sm text-muted">{data.forecast}</p> : null}
      </Card>

      {data.subjects.length > 0 ? (
        <Section title="By subject">
          <div className="space-y-2">
            {data.subjects.map((subject) => (
              <Card key={subject.subjectId ?? subject.subjectName} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{subject.subjectName ?? 'Subject'}</p>
                    <p className="text-xs text-muted">{subject.forecast}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-lg font-bold">{subject.pct ?? '—'}%</p>
                    <Pill tone={zoneTone[subject.zone] ?? 'neutral'}>{zoneLabel[subject.zone] ?? subject.zone}</Pill>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Recent days">
        <div className="space-y-2">
          {data.days.slice(0, 30).map((day) => (
            <Card key={day.date} className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">{day.date}</span>
              <span className="flex items-center gap-2">
                {day.status === 'absent' && !day.explained ? <Pill tone="bad">Unexplained</Pill> : null}
                <Pill tone={statusTone[day.status] ?? 'neutral'}>{day.status}</Pill>
              </span>
            </Card>
          ))}
          {data.days.length === 0 ? <EmptyState title="No records in range" /> : null}
        </div>
      </Section>

      <Section title="Submit an absence note">
        <Card className="space-y-3">
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl"
            options={['illness', 'family', 'travel', 'other'].map((r) => ({ value: r, label: r }))}
          />
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
