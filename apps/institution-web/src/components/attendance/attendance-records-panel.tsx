'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import { useAttendanceMarkMutations, useAttendanceRecords, type AttendanceStatus } from '@/lib/attendance';
import { PortalClientError } from '@/lib/portal-client';

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
  { value: 'left_early', label: 'Left early' },
];

const ROSTER_PARAMS = { page: 1, pageSize: 100, sortDir: 'asc' as const, sortBy: 'lastName' };

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
  const { data: records, isLoading: recordsLoading } = useAttendanceRecords(sessionId);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const { mark } = useAttendanceMarkMutations(sessionId);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const roster = useMemo(
    () => (students?.items ?? []).filter((s) => s.classId === classId),
    [students, classId],
  );

  useEffect(() => {
    const byStudent = new Map((records ?? []).map((r) => [r.studentId, r.status]));
    const next: Record<string, AttendanceStatus> = {};
    for (const s of roster) next[s.id] = byStudent.get(s.id) ?? 'present';
    setMarks(next);
    setError(null);
    setSaved(false);
  }, [records, roster, sessionId]);

  async function save() {
    if (roster.length === 0) return;
    setError(null);
    setSaved(false);
    try {
      await mark.mutateAsync(roster.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'present' })));
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save the register.');
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
          <Button size="sm" onClick={save} loading={mark.isPending} disabled={roster.length === 0}>
            Save register
          </Button>
        )}
      </div>

      {saved && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Register saved.</div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

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
          {roster.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {s.firstName} {s.lastName}
                </p>
                <p className="truncate font-mono text-xs text-text-muted">{s.admissionNo}</p>
              </div>
              <div className="w-36 shrink-0">
                <Select
                  aria-label={`Status for ${s.firstName} ${s.lastName}`}
                  value={marks[s.id] ?? 'present'}
                  onChange={(e) => {
                    setMarks((m) => ({ ...m, [s.id]: e.target.value as AttendanceStatus }));
                    setSaved(false);
                  }}
                  options={STATUS_OPTIONS}
                  disabled={!canManage}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
