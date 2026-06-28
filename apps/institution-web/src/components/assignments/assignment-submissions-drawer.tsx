'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Input, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import {
  useAssignmentGradeMutations,
  useAssignmentSubmissions,
  type SubmissionInput,
  type SubmissionStatus,
} from '@/lib/assignments';
import type { AssignmentRow } from '@/lib/assignments-types';
import { PortalClientError } from '@/lib/portal-client';

const STATUS_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'late', label: 'Late' },
  { value: 'graded', label: 'Graded' },
  { value: 'missing', label: 'Missing' },
];

const ROSTER_PARAMS = { page: 1, pageSize: 100, sortDir: 'asc' as const, sortBy: 'lastName' };

interface Mark {
  status: SubmissionStatus;
  points: string;
}

/**
 * Grade an assignment: lists the assignment's class roster with a per-student status + points,
 * prefilled from any existing submissions. Saving bulk-upserts. Viewers see it read-only;
 * `assignments.manage` is required to save (the API re-checks and caps points at the maximum).
 */
export function AssignmentSubmissionsDrawer({
  assignment,
  open,
  onClose,
}: {
  assignment: AssignmentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('assignments.manage');
  const { data: submissions, isLoading: subsLoading } = useAssignmentSubmissions(open ? assignment?.id ?? null : null);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const { grade } = useAssignmentGradeMutations(assignment?.id ?? '');
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(
    () => (students?.items ?? []).filter((s) => assignment && s.classId === assignment.classId),
    [students, assignment],
  );

  // Seed each roster student from its existing submission, defaulting to "assigned" / no points.
  useEffect(() => {
    if (!open) return;
    const byStudent = new Map((submissions ?? []).map((s) => [s.studentId, s]));
    const next: Record<string, Mark> = {};
    for (const s of roster) {
      const existing = byStudent.get(s.id);
      next[s.id] = {
        status: existing?.status ?? 'assigned',
        points: existing?.pointsAwarded != null ? String(existing.pointsAwarded) : '',
      };
    }
    setMarks(next);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submissions, students, assignment?.id]);

  async function save() {
    if (!assignment || roster.length === 0) return;
    setError(null);
    try {
      const payload: SubmissionInput[] = roster.map((s) => {
        const m = marks[s.id] ?? { status: 'assigned' as SubmissionStatus, points: '' };
        return {
          studentId: s.id,
          status: m.status,
          pointsAwarded: m.points === '' ? null : Number(m.points),
        };
      });
      await grade.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save submissions.');
    }
  }

  const loading = subsLoading || studentsLoading;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Submissions"
      description={assignment ? `${assignment.title} · ${assignment.className ?? 'Class'} · max ${assignment.maxPoints}` : ''}
      footer={
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={grade.isPending}>
              Cancel
            </Button>
            <Button onClick={save} loading={grade.isPending} disabled={roster.length === 0}>
              Save submissions
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
            No students are placed in this class yet. Assign students to the class to record submissions.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {roster.map((s) => {
              const m = marks[s.id] ?? { status: 'assigned' as SubmissionStatus, points: '' };
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{s.firstName} {s.lastName}</p>
                    <p className="truncate font-mono text-xs text-text-muted">{s.admissionNo}</p>
                  </div>
                  <div className="w-32 shrink-0">
                    <Select
                      aria-label={`Status for ${s.firstName} ${s.lastName}`}
                      value={m.status}
                      onChange={(e) =>
                        setMarks((prev) => ({ ...prev, [s.id]: { ...m, status: e.target.value as SubmissionStatus } }))
                      }
                      options={STATUS_OPTIONS}
                      disabled={!canManage}
                    />
                  </div>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={assignment?.maxPoints}
                      aria-label={`Points for ${s.firstName} ${s.lastName}`}
                      placeholder="—"
                      value={m.points}
                      onChange={(e) => setMarks((prev) => ({ ...prev, [s.id]: { ...m, points: e.target.value } }))}
                      disabled={!canManage}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
