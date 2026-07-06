'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCourses, useStudentMe } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function CoursesPage() {
  const router = useRouter();
  const { data: me } = useStudentMe();
  const { data, isLoading } = useCourses();

  useEffect(() => {
    if (me?.persona === 'school') router.replace('/classes');
  }, [me?.persona, router]);

  if (me?.persona === 'school') return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[10px] font-semibold tracking-wide text-st-faint">YOUR COLLEGE</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">Courses</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <div className="mt-6 space-y-3">
          {(data?.items ?? []).map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="transition hover:border-st-accent/40">
                <p className="text-xs font-semibold text-st-accent">{course.code}</p>
                <p className="font-semibold text-st-ink">{course.name}</p>
                <p className="text-xs text-st-muted">
                  {course.professorName}
                  {course.credits != null && ` · ${course.credits} credits`}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
