'use client';
import Link from 'next/link';
import { useStudentLearnAggregate, useStudentLearnSessions } from '@/lib/learn-visibility';

export function StudentLearnPanel({ studentId }: { studentId: string }) {
  const { data: aggregate, error: aggErr, isLoading } = useStudentLearnAggregate(studentId);
  const { data: sessionIds } = useStudentLearnSessions(studentId);

  if (isLoading) return <p className="text-sm text-text-muted">Loading learn activity…</p>;
  if (aggErr) {
    return (
      <p className="text-sm text-text-muted">
        Edrion Learn visibility is not enabled for this institution, or not enough sessions yet.
      </p>
    );
  }
  if (!aggregate) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">Edrion Learn</h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-text-muted">Completed</dt>
          <dd className="font-medium">{aggregate.sessionsCompleted}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Topics</dt>
          <dd className="font-medium">{aggregate.topicsStudied}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Avg minutes</dt>
          <dd className="font-medium">{aggregate.avgSessionMinutes ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Visibility</dt>
          <dd className="font-medium">{aggregate.visibility}</dd>
        </div>
      </dl>
      {aggregate.visibility === 'transcript' && sessionIds && sessionIds.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-text-muted">Recent sessions</p>
          <ul className="space-y-1 text-sm">
            {sessionIds.slice(0, 5).map((id) => (
              <li key={id}>
                <Link href={`/students/${studentId}/learn/${id}`} className="text-primary hover:underline">
                  {id.slice(0, 8)}…
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
