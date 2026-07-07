'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCourses, useStudentMe } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function CoursesPage() {
  const router = useRouter();
  const { data: me } = useStudentMe();
  const { data, isLoading } = useCourses();

  useEffect(() => {
    if (me?.persona === 'school') router.replace('/classes');
  }, [me?.persona, router]);

  if (me?.persona === 'school') return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>YOUR COLLEGE</Eyebrow>} title="Courses" />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO COURSES"
          title="No courses enrolled"
          description="Your semester courses will appear here when registered."
        />
      ) : (
        <div className="mt-6 space-y-2">
          {(data?.items ?? []).map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <div className="flex items-center gap-4 rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 transition hover:border-st-accent/40">
                <span className="font-mono-ui text-xs font-semibold text-st-accent">{course.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-st-ink">{course.name}</p>
                  <p className="text-xs text-st-muted">
                    {course.professorName}
                    {course.credits != null && ` · ${course.credits} credits`}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
