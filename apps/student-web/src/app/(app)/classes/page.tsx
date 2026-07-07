'use client';
import Link from 'next/link';
import { useClasses } from '@/lib/hooks';
import { useStudentTerm } from '@/lib/persona';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function ClassesPage() {
  const terms = useStudentTerm();
  const { data, isLoading } = useClasses();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>{terms.instLabel}</Eyebrow>} title={terms.unitP} />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO CLASSES"
          title="No classes yet"
          description="Your timetable subjects will show up here once you're enrolled."
        />
      ) : (
        <div className="mt-6 space-y-2">
          {(data?.items ?? []).map((cls) => (
            <Link key={cls.subjectClassId} href={`/classes/${cls.subjectClassId}`}>
              <div className="flex items-center gap-4 rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 transition hover:border-st-accent/40">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-st-accentSoft font-display text-base font-bold text-st-accentDeep">
                  {cls.initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-st-ink">{cls.name}</p>
                  <p className="text-xs text-st-muted">
                    {cls.teacherName}
                    {cls.nextMeta && ` · ${cls.nextMeta}`}
                  </p>
                </div>
                <span className="text-xs font-semibold text-st-accent">Open →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
