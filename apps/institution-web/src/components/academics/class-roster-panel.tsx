'use client';
import { Skeleton } from '@edrion/ui';
import { useClassRoster } from '@/lib/people';

/** Read-only class roster shown in the class detail popup. */
export function ClassRosterPanel({ classId, className }: { classId: string; className: string }) {
  const { data, isLoading, isError } = useClassRoster(classId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-text-muted">Couldn’t load the roster for {className}.</p>;
  }

  const roster = data ?? [];

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Roster ({roster.length})
      </h3>
      {roster.length === 0 ? (
        <p className="text-sm text-text-muted">No students enrolled in this class.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {roster.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-text-primary">{s.firstName} {s.lastName}</span>
                <span className="ml-1.5 font-mono text-xs text-text-muted">{s.admissionNo}</span>
              </span>
              <span className="text-text-secondary tabular-nums">{s.rollNo ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
