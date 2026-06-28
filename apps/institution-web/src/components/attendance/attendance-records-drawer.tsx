'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import { useAttendanceMarkMutations, useAttendanceRecords, type AttendanceStatus } from '@/lib/attendance';
import type { AttendanceSessionRow } from '@/lib/attendance-types';
import { PortalClientError } from '@/lib/portal-client';

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
  { value: 'left_early', label: 'Left early' },
];

const ROSTER_PARAMS = { page: 1, pageSize: 100, sortDir: 'asc' as const, sortBy: 'lastName' };

/**
 * Mark a class register: lists the session's class roster (students placed into that class) with a
 * per-student status, prefilled from any existing records. Saving bulk-upserts the marks. Viewers
 * see the marks read-only; `attendance.manage` is required to save (the API re-checks).
 */
export function AttendanceRecordsDrawer({
  session,
  open,
  onClose,
}: {
  session: AttendanceSessionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('attendance.manage');
  const { data: records, isLoading: recordsLoading } = useAttendanceRecords(open ? session?.id ?? null : null);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const { mark } = useAttendanceMarkMutations(session?.id ?? '');
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(
    () => (students?.items ?? []).filter((s) => session && s.classId === session.classId),
    [students, session],
  );

  // Seed each roster student's status from its existing record, defaulting to "present".
  useEffect(() => {
    if (!open) return;
    const byStudent = new Map((records ?? []).map((r) => [r.studentId, r.status]));
    const next: Record<string, AttendanceStatus> = {};
    for (const s of roster) next[s.id] = byStudent.get(s.id) ?? 'present';
    setMarks(next);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, records, students, session?.id]);

  async function save() {
    if (!session || roster.length === 0) return;
    setError(null);
    try {
      await mark.mutateAsync(roster.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'present' })));
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save the register.');
    }
  }

  const loading = recordsLoading || studentsLoading;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Register"
      description={session ? `${session.className ?? 'Class'} · ${session.date} · ${session.period}` : ''}
      footer={
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={mark.isPending}>
              Cancel
            </Button>
            <Button onClick={save} loading={mark.isPending} disabled={roster.length === 0}>
              Save register
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
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
          <p className="py-8 text-center text-sm text-text-muted">
            No students are placed in this class yet. Assign students to the class to mark attendance.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {roster.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{s.firstName} {s.lastName}</p>
                  <p className="truncate font-mono text-xs text-text-muted">{s.admissionNo}</p>
                </div>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={`Status for ${s.firstName} ${s.lastName}`}
                    value={marks[s.id] ?? 'present'}
                    onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value as AttendanceStatus }))}
                    options={STATUS_OPTIONS}
                    disabled={!canManage}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
