'use client';
import Link from 'next/link';
import { useCourseAbout, useStudentMe } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function CourseDetailPage({ params }: { params: { id: string } }) {
  const { data: about, isLoading } = useCourseAbout(params.id);
  const { data: me } = useStudentMe();

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  const info = about as {
    officeHours?: string | null;
    gradingScheme?: { component: string; weightPct: number }[];
    attendance?: { present: number; total: number; warningLine?: string | null };
  } | undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/courses" className="text-sm text-st-muted hover:text-st-accent">← Courses</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Course details</h1>

      <Card className="mt-6">
        {info?.officeHours && (
          <p className="text-sm text-st-muted">Office hours: {info.officeHours}</p>
        )}
        {info?.attendance && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-st-muted">
            <p>Attendance: {info.attendance.present}/{info.attendance.total}</p>
            {me?.surfaces.requests && <Link href="/requests?new=leave_request" className="font-semibold text-st-accentDeep">Apply for leave</Link>}
          </div>
        )}
        {info?.attendance?.warningLine && (
          <p className="mt-1 text-xs text-st-amber">{info.attendance.warningLine}</p>
        )}
        {info?.gradingScheme && info.gradingScheme.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-st-muted">
            {info.gradingScheme.map((g) => (
              <li key={g.component}>
                {g.component}: {g.weightPct}%
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
