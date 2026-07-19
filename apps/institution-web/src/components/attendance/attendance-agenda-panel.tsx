'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, AlertTriangle } from 'lucide-react';
import { Button, cn } from '@edrion/ui';
import {
  useAttendanceAgenda,
  useOpenAttendanceSession,
  type AttendanceAgendaSlot,
} from '@/lib/attendance';
import { DAY_LABEL } from '@/lib/timetable-grid';
import { AttendanceRegisterDrawer } from './attendance-register-drawer';

function minutesLeft(now: string, end: string): number {
  const [nh = 0, nm = 0] = now.split(':').map(Number);
  const [eh = 0, em = 0] = end.split(':').map(Number);
  return eh * 60 + em - (nh * 60 + nm);
}

function SlotCard({
  slot,
  now,
  onTake,
  busy,
}: {
  slot: AttendanceAgendaSlot;
  now: string;
  onTake: () => void;
  busy: boolean;
}) {
  const left = slot.timing === 'current' ? minutesLeft(now, slot.endTime) : null;
  const isCurrent = slot.timing === 'current';
  const needsMark = slot.timing === 'past' && slot.marking === 'unmarked';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border px-4 py-3 transition-colors',
        isCurrent && 'border-primary bg-[var(--primary-soft)] ring-2 ring-primary/30',
        slot.timing === 'upcoming' && 'opacity-70',
        needsMark && 'border-[var(--warning)]/40 bg-[var(--warning-soft,transparent)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">
            {slot.periodLabel}
            <span className="ml-2 text-sm font-normal tabular-nums text-text-muted">
              {slot.startTime}–{slot.endTime}
            </span>
          </p>
          <p className="mt-0.5 truncate text-sm text-text-muted">
            {[slot.className, slot.subjectName, slot.room].filter(Boolean).join(' · ') || 'Scheduled'}
          </p>
          {isCurrent && left != null && left > 0 ? (
            <p className="mt-1 text-xs font-medium text-primary">{left} min left</p>
          ) : null}
          {needsMark ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--warning)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Not marked
            </p>
          ) : null}
          {slot.marking === 'complete' ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--success)]">
              <Check className="h-3.5 w-3.5" />
              {slot.session
                ? `${slot.session.presentCount}/${slot.rosterSize} present`
                : 'Complete'}
            </p>
          ) : null}
        </div>
        <Button size="sm" onClick={onTake} disabled={busy}>
          {slot.session ? 'Edit register' : 'Take attendance'}
        </Button>
      </div>
    </div>
  );
}

export function AttendanceAgendaPanel() {
  const [agendaScope, setAgendaScope] = useState<'mine' | 'all' | undefined>(undefined);
  const { data, isLoading, isError } = useAttendanceAgenda({ scope: agendaScope });
  const openSession = useOpenAttendanceSession();
  const [register, setRegister] = useState<{
    sessionId: string;
    classId: string;
    className: string | null;
    date: string;
    period: string;
    roster: Array<{ id: string; studentName: string | null; admissionNo: string | null }>;
    records: Array<{
      studentId: string;
      status: import('@/lib/attendance-types').AttendanceStatus;
    }>;
  } | null>(null);

  const showScopeToggle = data?.reason !== 'staff_not_linked';

  const emptyHint = useMemo(() => {
    if (!data) return null;
    if (data.reason === 'staff_not_linked') {
      return "Your login isn't linked to a staff record — ask an admin to link it.";
    }
    if (data.slots.length === 0) {
      const dayLabel = DAY_LABEL[data.dayOfWeek] ?? 'this day';
      return (
        <>
          Nothing on the timetable for {dayLabel}.{' '}
          <Link href="/timetable" className="text-primary underline-offset-2 hover:underline">
            Set up the timetable
          </Link>
          .
        </>
      );
    }
    const current = data.slots.find((s) => s.timing === 'current');
    if (current) return null;
    const next = data.slots.find((s) => s.timing === 'upcoming');
    if (next) {
      return `Nothing scheduled right now — next is ${next.periodLabel} at ${next.startTime}.`;
    }
    return null;
  }, [data]);

  async function take(slot: AttendanceAgendaSlot) {
    if (!data) return;
    const result = await openSession.mutateAsync({
      slotId: slot.slotId,
      date: data.date,
    });
    setRegister({
      sessionId: result.session.id,
      classId: result.session.classId,
      className: result.session.className ?? slot.className,
      date: result.session.date,
      period: result.session.period,
      roster: result.roster,
      records: result.records.map((r) => ({ studentId: r.studentId, status: r.status })),
    });
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Today</h2>
          <p className="text-sm text-text-muted">
            {data
              ? `${data.date} · ${data.now} (${data.timezone})`
              : 'Periods to mark based on the clock'}
          </p>
        </div>
        {showScopeToggle && data ? (
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 transition-colors',
                  (agendaScope ?? data.scope) === s
                    ? 'bg-[var(--primary-soft)] font-medium text-text-primary'
                    : 'text-text-muted hover:text-text-primary',
                )}
                onClick={() => setAgendaScope(s)}
              >
                {s === 'mine' ? 'My periods' : 'All periods'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading periods…</p>
      ) : isError ? (
        <p className="text-sm text-[var(--danger)]">Could not load today&apos;s agenda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {emptyHint ? <p className="text-sm text-text-muted">{emptyHint}</p> : null}
          {(data?.slots ?? []).map((slot) => (
            <SlotCard
              key={slot.slotId}
              slot={slot}
              now={data!.now}
              onTake={() => void take(slot)}
              busy={openSession.isPending}
            />
          ))}
        </div>
      )}

      {register ? (
        <AttendanceRegisterDrawer
          open
          onClose={() => setRegister(null)}
          sessionId={register.sessionId}
          classId={register.classId}
          className={register.className}
          date={register.date}
          period={register.period}
          initialRoster={register.roster}
          initialRecords={register.records}
        />
      ) : null}
    </section>
  );
}
