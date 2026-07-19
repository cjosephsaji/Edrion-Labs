'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, cn, useToast } from '@edrion/ui';
import {
  useAttendanceMarkMutations,
  type AttendanceStatus,
} from '@/lib/attendance';
import { formatPortalError } from '@/lib/portal-client';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];
const KEY_MAP: Record<string, AttendanceStatus> = {
  p: 'present',
  a: 'absent',
  l: 'late',
  e: 'excused',
};

type RosterStudent = { id: string; studentName: string | null; admissionNo: string | null };

export function AttendanceRegisterDrawer({
  open,
  onClose,
  sessionId,
  className,
  date,
  period,
  initialRoster,
  initialRecords,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  classId: string;
  className: string | null;
  date: string;
  period: string;
  initialRoster: RosterStudent[];
  initialRecords: Array<{ studentId: string; status: AttendanceStatus }>;
}) {
  const { say } = useToast();
  const { mark } = useAttendanceMarkMutations(sessionId);
  const [focusIdx, setFocusIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const initialMarks = useMemo(() => {
    const map: Record<string, AttendanceStatus> = {};
    for (const s of initialRoster) map[s.id] = 'present';
    for (const r of initialRecords) map[r.studentId] = r.status;
    return map;
  }, [initialRoster, initialRecords]);

  const [marks, setMarks] = useState(initialMarks);
  useEffect(() => {
    setMarks(initialMarks);
    setDirty(false);
  }, [initialMarks]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, left_early: 0 };
    for (const id of Object.keys(marks)) {
      const s = marks[id] ?? 'present';
      c[s] += 1;
    }
    return c;
  }, [marks]);

  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
    setDirty(true);
  }, []);

  const markAll = useCallback((status: AttendanceStatus) => {
    setMarks((prev) => {
      const next = { ...prev };
      for (const s of initialRoster) next[s.id] = status;
      return next;
    });
    setDirty(true);
  }, [initialRoster]);

  const save = useCallback(async () => {
    try {
      await mark.mutateAsync(
        initialRoster.map((s) => ({
          studentId: s.id,
          status: marks[s.id] ?? 'present',
        })),
      );
      setDirty(false);
      say('Attendance saved');
    } catch (err) {
      say(formatPortalError(err));
    }
  }, [initialRoster, mark, marks, say]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(initialRoster.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (KEY_MAP[e.key.toLowerCase()] && !e.metaKey && !e.ctrlKey) {
        const student = initialRoster[focusIdx];
        if (student) {
          e.preventDefault();
          setStatus(student.id, KEY_MAP[e.key.toLowerCase()]!);
        }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, focusIdx, initialRoster, save, setStatus]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${focusIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusIdx]);

  return (
    <Drawer
      open={open}
      onClose={requestClose}
      title={`${className ?? 'Class'} · ${period}`}
      description={`${date} · ${counts.present} present · ${counts.absent} absent · ${counts.late} late · ${counts.excused} excused`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => markAll('present')}>
              All present
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => markAll('absent')}>
              All absent
            </Button>
          </div>
          <Button type="button" onClick={() => void save()} disabled={mark.isPending || !dirty}>
            {mark.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div ref={listRef} className="flex flex-col gap-1 pb-4">
        <p className="mb-2 text-xs text-text-muted">
          Keys: ↑↓ move · p present · a absent · l late · e excused · ⌘↵ save
        </p>
        {initialRoster.map((s, idx) => {
          const status = marks[s.id] ?? 'present';
          return (
            <div
              key={s.id}
              data-idx={idx}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-transparent px-2 py-2',
                idx === focusIdx && 'border-border bg-[var(--surface-2)]',
              )}
              onClick={() => setFocusIdx(idx)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">{s.studentName ?? 'Student'}</p>
                {s.admissionNo ? (
                  <p className="text-xs tabular-nums text-text-muted">{s.admissionNo}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={cn(
                      'rounded-md px-2 py-1 text-xs capitalize transition-colors',
                      status === st
                        ? st === 'present'
                          ? 'bg-[var(--success)] text-white'
                          : st === 'absent'
                            ? 'bg-[var(--danger)] text-white'
                            : 'bg-primary text-white'
                        : 'bg-[var(--surface-2)] text-text-muted hover:text-text-primary',
                    )}
                    onClick={() => setStatus(s.id, st)}
                  >
                    {st === 'present' ? 'P' : st === 'absent' ? 'A' : st === 'late' ? 'L' : 'E'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {initialRoster.length === 0 ? (
          <p className="text-sm text-text-muted">No students in this class.</p>
        ) : null}
      </div>
    </Drawer>
  );
}
