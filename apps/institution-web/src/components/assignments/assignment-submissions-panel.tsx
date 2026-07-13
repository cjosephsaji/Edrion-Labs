'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import {
  useAssignmentGradeMutations,
  useAssignmentSubmissions,
  type SubmissionInput,
  type SubmissionStatus,
} from '@/lib/assignments';
import { PortalClientError } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';

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

/** Inline assignment submissions — shown in the assignment detail popup. */
export function AssignmentSubmissionsPanel({
  assignmentId,
  classId,
  title,
  className,
  maxPoints,
}: {
  assignmentId: string;
  classId: string;
  title: string;
  className?: string | null;
  maxPoints: number;
}) {
  const { can } = usePermissions();
  const canManage = can('assignments.manage');
  const { data: submissions, isLoading: subsLoading } = useAssignmentSubmissions(assignmentId);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const { grade } = useAssignmentGradeMutations(assignmentId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const roster = useMemo(
    () => (students?.items ?? []).filter((s) => s.classId === classId),
    [students, classId],
  );

  useEffect(() => {
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
    setSaved(false);
  }, [submissions, roster, assignmentId]);

  async function save() {
    if (roster.length === 0) return;
    setError(null);
    setSaved(false);
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
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save submissions.');
    }
  }

  const loading = subsLoading || studentsLoading;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Submissions</h3>
          <p className="text-xs text-text-muted">
            {title} · {className ?? 'Class'} · max {maxPoints} pts
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={save} loading={grade.isPending} disabled={roster.length === 0}>
            Save submissions
          </Button>
        )}
      </div>

      {saved && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Submissions saved.</div>
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
          No students are placed in this class yet. Assign students to the class to record submissions.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {roster.map((s) => {
            const m = marks[s.id] ?? { status: 'assigned' as SubmissionStatus, points: '' };
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {formatPersonName(s)}
                  </p>
                  <p className="truncate font-mono text-xs text-text-muted">{s.admissionNo}</p>
                </div>
                <div className="w-32 shrink-0">
                  <Select
                    aria-label={`Status for ${formatPersonName(s)}`}
                    value={m.status}
                    onChange={(e) => {
                      setMarks((prev) => ({ ...prev, [s.id]: { ...m, status: e.target.value as SubmissionStatus } }));
                      setSaved(false);
                    }}
                    options={STATUS_OPTIONS}
                    disabled={!canManage}
                  />
                </div>
                <div className="w-20 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={maxPoints}
                    aria-label={`Points for ${formatPersonName(s)}`}
                    placeholder="—"
                    value={m.points}
                    onChange={(e) => {
                      setMarks((prev) => ({ ...prev, [s.id]: { ...m, points: e.target.value } }));
                      setSaved(false);
                    }}
                    disabled={!canManage}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
