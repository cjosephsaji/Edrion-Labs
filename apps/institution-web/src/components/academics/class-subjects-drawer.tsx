'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useClassSubjectMutations, useClassSubjects, useSubjectOptions } from '@/lib/academics';
import { useTeacherOptions } from '@/lib/people';
import { PortalClientError } from '@/lib/portal-client';

/**
 * Manage which subjects are taught in a class, and by which teacher (the class↔subject↔teacher
 * join). The teacher picker — deferred in P2 until the teacher domain existed — is now wired to the
 * People directory. Viewers see the list; `academics.manage` is required to add/remove/reassign.
 */
export function ClassSubjectsDrawer({
  classId,
  className,
  open,
  onClose,
}: {
  classId: string | null;
  className: string;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('academics.manage');
  const { data: assigned, isLoading } = useClassSubjects(open ? classId : null);
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeacherOptions();
  const { assign, remove } = useClassSubjectMutations(classId ?? '');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const assignedIds = new Set((assigned ?? []).map((a) => a.subjectId));
  const available = (subjects?.items ?? []).filter((s) => !assignedIds.has(s.id));
  const teacherOptions = (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }));

  async function add() {
    if (!subjectId) return;
    setError(null);
    try {
      await assign.mutateAsync({ subjectId, teacherId: teacherId || null });
      setSubjectId('');
      setTeacherId('');
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add subject.');
    }
  }

  async function reassign(subject: string, nextTeacher: string) {
    setError(null);
    try {
      await assign.mutateAsync({ subjectId: subject, teacherId: nextTeacher || null });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not change teacher.');
    }
  }

  async function drop(assignmentId: string) {
    setError(null);
    try {
      await remove.mutateAsync(assignmentId);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove subject.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Subjects" description={className}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder={available.length ? 'Add a subject…' : 'All subjects assigned'}
              options={available.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
              disabled={available.length === 0}
            />
            <div className="flex items-center gap-2">
              <Select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                placeholder="Teacher (optional)…"
                options={teacherOptions}
                disabled={available.length === 0}
              />
              <Button onClick={add} loading={assign.isPending} disabled={!subjectId}>
                Add
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (assigned ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No subjects attached to this class yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(assigned ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{a.subjectName ?? 'Subject'}</p>
                  {canManage ? (
                    <Select
                      className="mt-1 h-8 text-xs"
                      value={a.teacherId ?? ''}
                      onChange={(e) => reassign(a.subjectId, e.target.value)}
                      placeholder="Unassigned"
                      options={teacherOptions}
                    />
                  ) : (
                    <p className="truncate text-xs text-text-muted">{a.teacherName ?? 'Unassigned'}</p>
                  )}
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove subject"
                    onClick={() => drop(a.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
