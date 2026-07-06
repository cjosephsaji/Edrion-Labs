'use client';
import Link from 'next/link';
import { useExams } from '@/lib/hooks';
import { CountdownCard } from '@/components/institutional/CountdownCard';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';

function mockExamHref(exam: { examName: string; subject: string | null; syllabusNote: string | null }) {
  const subject = exam.subject ?? exam.examName;
  const topics = exam.syllabusNote?.trim() || exam.examName;
  const sp = new URLSearchParams({ subject, topics });
  return `/lab/mock-exams/new?${sp}`;
}

export default function ExamsPage() {
  const { data, isLoading } = useExams();
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Exams</h1>
      <p className="mt-1 text-sm text-st-muted">Upcoming institutional exams.</p>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No exams published yet"
          description="When your school posts exam dates, they'll show up here with a prep plan."
        />
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((exam, i) => (
            <div key={`${exam.examName}-${i}`}>
              {i === 0 ? (
                <CountdownCard
                  days={exam.daysUntil}
                  dateLabel={exam.date}
                  title={exam.examName}
                  sub={[exam.subject, exam.hall, exam.seatInfo].filter(Boolean).join(' · ')}
                />
              ) : (
                <Card>
                  <p className="font-semibold text-st-ink">{exam.examName}</p>
                  <p className="text-xs text-st-muted">
                    {exam.date}
                    {exam.time && ` · ${exam.time}`}
                    {exam.subject && ` · ${exam.subject}`}
                  </p>
                  {exam.syllabusNote && (
                    <p className="mt-2 text-xs text-st-muted">{exam.syllabusNote}</p>
                  )}
                </Card>
              )}
              <Link href={mockExamHref(exam)} className="mt-2 inline-block">
                <PillButton variant="soft" className="text-xs">
                  Build a mock exam →
                </PillButton>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
