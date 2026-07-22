'use client';

import { useParams, useRouter } from 'next/navigation';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { SubjectDetailDrawer } from '@/components/institutional/attendance/subject-detail-drawer';
import { useAttendanceSummary } from '@/lib/attendance';

export default function SubjectAttendancePage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const router = useRouter();
  const summary = useAttendanceSummary();
  const policy = summary.data?.value.policy;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>YOU</Eyebrow>}
        title="Subject attendance"
        backHref="/attendance"
        backLabel="Attendance"
      />

      {summary.isLoading || !policy ? (
        <div className="mt-6 space-y-3">
          <div className="h-12 shimmer rounded-xl" />
          <div className="h-64 shimmer rounded-xl" />
        </div>
      ) : (
        <SubjectDetailDrawer
          subjectId={subjectId}
          policy={policy}
          open
          onClose={() => router.push('/attendance')}
        />
      )}
    </div>
  );
}
