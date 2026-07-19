'use client';
import { useEffect, useState } from 'react';
import { Button, Skeleton, cn, useToast } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import { useAttendanceMarkMutations, useAttendanceRecords, type AttendanceStatus } from '@/lib/attendance';
import { formatPortalError } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

const ROSTER_PARAMS = (classId: string) => ({
  page: 1,
  pageSize: 200,
  sortDir: 'asc' as const,
  sortBy: 'lastName',
  filters: { classId },
});

/** Inline attendance register — shown in the session detail popup. */
export function AttendanceRecordsPanel({
  sessionId,
  classId,
  className,
  date,
  period,
}: {
  sessionId: string;
  classId: string;
  className?: string | null;
  date: string;
  period: string;
}) {
  const { can } = usePermissions();
  const canManage = can('attendance.manage');
  const { say } = useToast();
  const { data: records, isLoading: recordsLoading } = useAttendanceRecords(sessionId);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>(
    'students',
    ROSTER_PARAMS(classId),
  );
  const { mark } = useAttendanceMarkMutations(sessionId);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [dirty, setDirty] = useState(false);

  const roster = students?.items ?? [];

  useEffect(() => {
    const byStudent = new Map((records ?? []).map((r) => [r.studentId, r.status]));
    const next: Record<string, AttendanceStatus> = {};
    for (const s of roster) next[s.id] = byStudent.get(s.id) ?? 'present';
    setMarks(next);
    setDirty(false);
  }, [records, roster, sessionId]);

  async function save() {
    if (roster.length === 0) return;
    try {
      await mark.mutateAsync(roster.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'present' })));
      setDirty(false);
      say('Attendance saved');
    } catch (err) {
      say(formatPortalError(err));
    }
  }

  const loading = recordsLoading || studentsLoading;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Register</h3>
          <p className="text-xs text-text-muted">
            {className ?? 'Class'} · {date} · {period}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => void save()} loading={mark.isPending} disabled={roster.length === 0 || !dirty}>
            Save register
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : roster.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">
          No students are placed in this class yet. Assign students to the class to mark attendance.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {roster.map((s) => {
            const status = marks[s.id] ?? 'present';
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {formatPersonName(s)}
                  </p>
                  <p className="truncate font-mono text-xs text-text-muted">{s.admissionNo}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={!canManage}
                      aria-label={`${st} for ${formatPersonName(s)}`}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs capitalize transition-colors disabled:opacity-50',
                        status === st
                          ? st === 'present'
                            ? 'bg-[var(--success)] text-white'
                            : st === 'absent'
                              ? 'bg-[var(--danger)] text-white'
                              : 'bg-primary text-white'
                          : 'bg-[var(--surface-2)] text-text-muted hover:text-text-primary',
                      )}
                      onClick={() => {
                        setMarks((m) => ({ ...m, [s.id]: st }));
                        setDirty(true);
                      }}
                    >
                      {st === 'present' ? 'P' : st === 'absent' ? 'A' : st === 'late' ? 'L' : 'E'}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
