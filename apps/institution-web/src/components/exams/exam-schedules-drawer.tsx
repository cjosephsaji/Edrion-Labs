'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useExamScheduleMutations, useExamSchedules } from '@/lib/exams';
import type { ExamRow } from '@/lib/exams-types';
import { PortalClientError } from '@/lib/portal-client';

/**
 * Manage the scheduled papers within an exam (the per-class/subject sittings). Viewers see the list;
 * `exams.manage` is required to add or remove — the API re-checks. One paper per (class, subject); a
 * duplicate is rejected with a friendly message.
 */
export function ExamSchedulesDrawer({
  exam,
  open,
  onClose,
}: {
  exam: ExamRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('exams.manage');
  const { data: schedules, isLoading } = useExamSchedules(open ? exam?.id ?? null : null);
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { create, remove } = useExamScheduleMutations(exam?.id ?? '');

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [room, setRoom] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setClassId('');
    setSubjectId('');
    setExamDate('');
    setStartTime('');
    setEndTime('');
    setMaxMarks('100');
    setRoom('');
  }

  async function add() {
    if (!classId || !subjectId) return;
    setError(null);
    try {
      await create.mutateAsync({
        classId,
        subjectId,
        examDate: examDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        maxMarks: Number(maxMarks) || 100,
        room: room || null,
      });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the paper.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await remove.mutateAsync({ id, version });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the paper.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Exam papers" description={exam?.name ?? ''}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="es-class">Class</Label>
                <Select
                  id="es-class"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  placeholder="Class…"
                  options={(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <Label htmlFor="es-subject">Subject</Label>
                <Select
                  id="es-subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  placeholder="Subject…"
                  options={(subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
              <div>
                <Label htmlFor="es-date">Date</Label>
                <Input id="es-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="es-max">Max marks</Label>
                <Input id="es-max" type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="es-start">Start (HH:MM)</Label>
                <Input id="es-start" value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="09:00" />
              </div>
              <div>
                <Label htmlFor="es-end">End (HH:MM)</Label>
                <Input id="es-end" value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="11:00" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="es-room">Room</Label>
                <Input id="es-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <Button onClick={add} loading={create.isPending} disabled={!classId || !subjectId}>
              Add paper
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (schedules ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No papers scheduled in this exam yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(schedules ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {s.subjectName ?? 'Subject'} · {s.className ?? 'Class'}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {[s.examDate, s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : null, `${s.maxMarks} marks`, s.room]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove paper"
                    onClick={() => drop(s.id, s.version)}
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
