'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';

type Goal = { id: string; title: string; subjectName: string | null; dueAt: string | null };

export function PetrosTeacherGoals() {
  const api = useStudentApi();
  const { data: me } = useStudentMe();
  const query = useQuery({ queryKey: ['student', 'assignments', 'learning-goals'],
    queryFn: () => api.get<{ items: Goal[] }>('/student/assignments/learning-goals'),
    enabled: me?.kind === 'institutional' && (me.permissions.includes('student.learn.use') || me.permissions.includes('*')) });
  if (query.isError) return <p role="alert" className="text-sm text-[var(--s-danger)]">Your teacher’s learning goals could not be loaded. {formatApiError(query.error)} <button className="underline" onClick={() => void query.refetch()}>Try again</button></p>;
  if (!query.data?.items.length) return null;
  return <section className="my-5 rounded-2xl border border-[var(--s-accentBd)] bg-[var(--s-card)] p-5" aria-labelledby="teacher-goals-title">
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--s-accentDeep)]">From your teacher</p>
    <h2 id="teacher-goals-title" className="mt-1 font-display text-xl font-semibold">Your learning goals</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{query.data.items.map((goal) => <Link key={goal.id} href={`/learn/goals/${goal.id}`} className="rounded-xl border border-[var(--s-bd1)] p-4 hover:bg-[var(--s-accentSoft)]">
      <h3 className="font-semibold">{goal.title}</h3>
      <p className="mt-2 text-xs text-[var(--s-faint)]">{goal.subjectName}{goal.dueAt ? ` · complete by ${new Date(`${goal.dueAt}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</p>
      <p className="mt-3 text-sm font-semibold text-[var(--s-accentDeep)]">View goal and learn with Petros →</p>
    </Link>)}</div>
  </section>;
}
