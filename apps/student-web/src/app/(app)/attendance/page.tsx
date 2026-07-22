'use client';

import { useMemo, useState } from 'react';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { HeatMap } from '@/components/institutional/HeatMap';
import { AttendanceRing } from '@/components/institutional/attendance/attendance-ring';
import { BranchActions } from '@/components/institutional/attendance/branch-actions';
import { PendingRequestsStrip } from '@/components/institutional/attendance/pending-requests-strip';
import { SubjectAttendanceRow } from '@/components/institutional/attendance/subject-attendance-row';
import { SubjectDetailDrawer } from '@/components/institutional/attendance/subject-detail-drawer';
import { isAttendanceStale, useAttendanceSummary } from '@/lib/attendance';

export default function AttendancePage() {
  const summary = useAttendanceSummary();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  const data = summary.data?.value;
  const stale = useMemo(
    () => isAttendanceStale(data?.updatedAt, summary.data?.cachedAt),
    [data?.updatedAt, summary.data?.cachedAt],
  );

  if (summary.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p role="alert" className="rounded-[12px] border border-st-danger/30 bg-st-dangerSoft p-4 text-sm text-st-danger">
          Couldn&apos;t load attendance. Try again when you&apos;re connected.
        </p>
      </div>
    );
  }

  if (summary.isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="h-8 w-48 shimmer rounded-lg" />
        <div className="mx-auto h-36 w-36 shimmer rounded-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 shimmer rounded-[15px]" />
        ))}
      </div>
    );
  }

  const heatDays =
    data.features.dayView && data.dayStrip
      ? data.dayStrip.map((day) => ({ date: day.date, count: day.conducted }))
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>YOU</Eyebrow>}
        title="Attendance"
        subtitle={`${data.overall.attended}/${data.overall.conducted} sessions · ${data.policy.computationBasis} basis`}
      />

      {stale ? (
        <p className="rounded-full bg-st-amberSoft px-3 py-1.5 text-xs text-st-amberInk">
          Showing cached attendance — figures may be outdated.
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-4 rounded-[15px] border border-st-bd1 bg-st-card p-6 shadow-sm">
        <AttendanceRing
          pct={data.overall.pct}
          zone={data.overall.zone}
          thresholdPct={data.policy.thresholdPct}
        />
        <p className="text-center text-sm text-st-muted">{data.overall.forecast.message}</p>
        <BranchActions branch={data.overall.forecast.branch} policy={data.policy} />
      </div>

      <PendingRequestsStrip requests={data.pendingRequests} />

      {data.features.dayView && heatDays.length > 0 ? (
        <div className="space-y-2 rounded-[15px] border border-st-bd1 bg-st-card p-4 shadow-sm">
          <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">TERM ACTIVITY</p>
          <HeatMap days={heatDays} />
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">BY SUBJECT</p>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-st-muted">Subject attendance will appear once your classes begin.</p>
        ) : (
          data.subjects.map((subject) =>
            subject.subjectId ? (
              <SubjectAttendanceRow
                key={subject.subjectId}
                subject={subject}
                onClick={() => setSelectedSubjectId(subject.subjectId)}
              />
            ) : null,
          )
        )}
      </div>

      {selectedSubjectId ? (
        <SubjectDetailDrawer
          subjectId={selectedSubjectId}
          policy={data.policy}
          open={Boolean(selectedSubjectId)}
          onClose={() => setSelectedSubjectId(null)}
        />
      ) : null}
    </div>
  );
}
