'use client';
import Link from 'next/link';
import { useClasses } from '@/lib/hooks';
import { useStudentTerm } from '@/lib/persona';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export default function ClassesPage() {
  const terms = useStudentTerm();
  const { data, isLoading } = useClasses();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[10px] font-semibold tracking-wide text-st-faint">{terms.instLabel}</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{terms.unitP}</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          icon="🏫"
          title="No classes yet"
          description="Your timetable subjects will show up here once you're enrolled."
        />
      ) : (
        <div className="mt-6 space-y-3">
          {(data?.items ?? []).map((cls) => (
            <Link key={cls.subjectClassId} href={`/classes/${cls.subjectClassId}`}>
              <Card className="flex items-center gap-4 transition hover:border-st-accent/40">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-st-accentSoft font-display text-lg font-bold text-st-accentDeep">
                  {cls.initial}
                </span>
                <div>
                  <p className="font-semibold text-st-ink">{cls.name}</p>
                  <p className="text-xs text-st-muted">
                    {cls.teacherName}
                    {cls.nextMeta && ` · ${cls.nextMeta}`}
                  </p>
                  {cls.liveToday && (
                    <span className="mt-1 inline-block text-[10px] font-semibold text-st-green">Live today</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
