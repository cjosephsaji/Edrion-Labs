'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CalendarDays, X } from 'lucide-react';
import { ActionButton, Card, PageHeader, StatusPill } from '@/components/design-system';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';
import styles from './calendar.module.css';

type CalendarEvent = { kind: string; label: string; sourceLine: string };
type Payload = {
  days: Array<{ date: string; events: CalendarEvent[] }>;
  nextExam: { id: string; date: string; name: string } | null;
  semesterBar: { name: string; startDate: string | null; endDate: string | null } | null;
};
type View = 'month' | 'agenda';
const pageDescription = 'Published classes, due work, exams, events, and holidays in one place.';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function eventTone(kind: string) {
  const value = kind.toLowerCase();
  if (value.includes('exam')) return { dot: 'bg-[var(--s-danger)]', text: 'text-[var(--s-danger)]', background: 'bg-[var(--s-dangerSoft)]' };
  if (value.includes('due') || value.includes('assignment') || value.includes('task')) return { dot: 'bg-[var(--s-amber)]', text: 'text-[var(--s-amber)]', background: 'bg-[var(--s-amberSoft)]' };
  if (value.includes('holiday')) return { dot: 'bg-[var(--st-violet)]', text: 'text-[var(--st-violet)]', background: 'bg-[var(--st-violetSoft)]' };
  if (value.includes('learn')) return { dot: 'bg-[var(--s-accent)]', text: 'text-[var(--s-success)]', background: 'bg-[var(--s-accentSoft)]' };
  return { dot: 'bg-[var(--st-blue)]', text: 'text-[var(--st-blue)]', background: 'bg-[var(--st-blueSoft)]' };
}

function makeGrid(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { key, day: day.getDate(), inMonth: day.getMonth() === month, isToday: key === new Date().toLocaleDateString('en-CA') };
  });
}

export default function CalendarPage() {
  const api = useStudentApi();
  const { data: me } = useStudentMe();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const month = monthKey(cursor);
  const query = useQuery({ queryKey: ['student', 'calendar', month], queryFn: () => api.get<Payload>(`/student/calendar?month=${month}`) });
  const grid = useMemo(() => makeGrid(cursor), [cursor]);
  const monthTitle = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(cursor);
  const eventMap = useMemo(() => new Map((query.data?.days ?? []).map((day) => [day.date, day.events])), [query.data]);
  const selectedEvents = selected ? eventMap.get(selected) ?? [] : [];
  const daysToExam = query.data?.nextExam ? Math.max(0, Math.ceil((new Date(query.data.nextExam.date).getTime() - Date.now()) / 86_400_000)) : null;

  const closeDay = useCallback(() => {
    setSelected(null);
    window.requestAnimationFrame(() => selectedTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDay();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [closeDay, selected]);

  function openDay(event: MouseEvent<HTMLButtonElement>, date: string) {
    selectedTriggerRef.current = event.currentTarget;
    setSelected(date);
  }

  function moveMonth(amount: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setSelected(null);
  }

  if (query.isLoading) return <LoadingBlock label="Building your calendar…" />;
  if (query.error) return <ErrorState description={formatApiError(query.error)} onRetry={() => void query.refetch()} />;
  const data = query.data!;

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader
        eyebrow={`Calendar · ${me?.className || me?.programmeName || 'Your institution'}`}
        title={monthTitle}
        description={pageDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={() => moveMonth(-1)} aria-label="Previous month"><ArrowLeft className="h-4 w-4" /></ActionButton>
            <ActionButton variant="secondary" onClick={() => moveMonth(1)} aria-label="Next month"><ArrowRight className="h-4 w-4" /></ActionButton>
            {(['month', 'agenda'] as View[]).map((item) => <ActionButton key={item} onClick={() => setView(item)} variant={view === item ? 'primary' : 'secondary'} aria-pressed={view === item} className="capitalize">{item}</ActionButton>)}
          </div>
        }
      />

      {data.semesterBar ? (
        <Card density="compact">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[.08em] text-[var(--s-muted)]">{data.semesterBar.name} · Term map</p><span className="text-sm text-[var(--s-muted)]">{[data.semesterBar.startDate, data.semesterBar.endDate].filter(Boolean).join(' → ')}</span></div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--s-surface2)]"><span className="w-[42%] bg-[var(--s-accent)]" /><span className="w-[18%] bg-[var(--s-amber)]" /><span className="w-[40%] bg-[var(--s-bd2)]" /></div>
        </Card>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ['exam', 'Exams'],
          ['task', 'Due work'],
          ['event', 'Events'],
          ['holiday', 'Holidays'],
          ['learn', 'My plan'],
        ] as Array<[string, string]>).map(([kind, label]) => <StatusPill key={kind} label={label} tone={kind === 'exam' ? 'critical' : kind === 'task' ? 'warning' : kind === 'learn' ? 'positive' : 'neutral'} />)}
      </div>

      {data.nextExam ? (
        <Card
          variant="urgent"
          className="mt-4 flex flex-wrap items-center gap-5"
          data-petros-target="primary"
          data-petros-title={data.nextExam.name}
          data-petros-message={`${daysToExam} day${daysToExam === 1 ? '' : 's'} until this examination.`}
          data-petros-source-id={data.nextExam.id}
          data-petros-href="/calendar"
        >
          <div className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[var(--s-danger)] text-[var(--s-dangerSoft)]"><span className="font-display text-[22px] font-bold leading-none">{daysToExam}</span><span className="mt-0.5 font-mono-ui text-[7.5px] font-semibold tracking-[.08em]">DAYS</span></div>
          <div className="min-w-[200px] flex-1"><p className="font-mono-ui text-[9.5px] font-semibold tracking-[.08em] text-[var(--s-danger)]">NEXT EXAM · {new Date(data.nextExam.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }).toUpperCase()}</p><h2 className="mt-1 font-display text-base font-semibold text-[var(--s-ink)]">{data.nextExam.name}</h2><p className="mt-0.5 text-xs text-[var(--s-muted)]">Published by your institution</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/exams" className="inline-flex min-h-11 items-center bg-[var(--s-accentDeep)] px-4 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">View exam details →</Link>
            <PetrosDoorButton door="upcoming_exam" sourceId={data.nextExam.id} label="Start focused revision" />
          </div>
        </Card>
      ) : null}

      {view === 'month' ? (
        <section className="mt-[18px]">
          <div className="grid grid-cols-7 gap-px border border-[var(--s-bd1)] bg-[var(--s-bd1)]">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => <div key={day} className="bg-[var(--s-page)] p-1.5 text-center font-mono-ui text-[8px] font-medium tracking-[.08em] text-[var(--s-faint2)]">{day}</div>)}
            {grid.map((cell) => {
              const events = eventMap.get(cell.key) ?? [];
              return (
                <button key={cell.key} type="button" disabled={!cell.inMonth} aria-haspopup="dialog" aria-pressed={selected === cell.key} aria-label={`Open ${new Date(`${cell.key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${events.length ? `, ${events.length} scheduled ${events.length === 1 ? 'item' : 'items'}` : ', no scheduled items'}`} onClick={(event) => openDay(event, cell.key)} className={`min-h-[82px] border-0 p-2 text-left transition-colors sm:min-h-[110px] sm:p-3 ${selected === cell.key ? 'bg-[var(--s-accentSoft)]' : cell.isToday ? 'bg-[var(--s-card)]' : cell.inMonth ? 'bg-[var(--s-card)] hover:bg-[var(--s-accentSoft)]' : 'bg-[var(--s-page)] opacity-25'}`}>
                  <span className={`font-mono-ui text-[11px] font-semibold ${cell.isToday ? 'text-[var(--s-accentDeep)]' : 'text-[var(--s-muted)]'}`}>{cell.day}</span>
                  <span className="mt-1 block space-y-0.5">
                    {events.slice(0, 2).map((event, index) => <span key={`${event.label}-${index}`} className="flex min-w-0 items-center gap-1"><span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${eventTone(event.kind).dot}`} /><span className="hidden truncate text-[8.5px] font-medium text-[var(--s-muted)] sm:block">{event.label}</span></span>)}
                    {events.length > 2 ? <span className="block pl-2.5 font-mono-ui text-[8px] text-[var(--s-faint)]">+{events.length - 2}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-[18px] space-y-3.5">
          {data.days.length === 0 ? <EmptyState title="A quiet month" description="Quiet days aren’t empty — they’re good days to get ahead." /> : data.days.map((day) => (
            <div key={day.date} className="flex gap-3.5">
              <div className="w-11 shrink-0 pt-1 text-center"><p className="font-mono-ui text-[9px] font-semibold text-[var(--s-faint2)]">{new Date(`${day.date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}</p><p className="font-display text-xl font-bold text-[var(--s-ink)]">{Number(day.date.slice(-2))}</p></div>
              <div className="min-w-0 flex-1 space-y-2">
                {day.events.map((event, index) => { const tone = eventTone(event.kind); return <article key={`${event.label}-${index}`} className={`rounded-xl border border-[var(--s-bd1)] p-3.5 ${tone.background}`}><p className={`font-mono-ui text-[8.5px] font-semibold tracking-[.06em] ${tone.text}`}>{event.kind.toUpperCase()}</p><h2 className="mt-1 text-[13.5px] font-semibold text-[var(--s-ink)]">{event.label}</h2><p className="mt-0.5 text-[10.5px] text-[var(--s-faint)]">{event.sourceLine}</p></article>; })}
              </div>
            </div>
          ))}
          <p className="rounded-xl border border-dashed border-[var(--s-bd2)] bg-[var(--s-sidebar)] p-4 text-center text-xs text-[var(--s-faint)]">Quiet days aren&apos;t empty — they&apos;re good days to get ahead or revisit something.</p>
        </section>
      )}

      {selected ? createPortal(
        <div className={styles.modalLayer}>
          <button type="button" className={styles.backdrop} onClick={closeDay} aria-label="Close day details" />
          <section ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="calendar-day-title">
            <header className={styles.dialogHeader}>
              <span className={styles.dateIcon}><CalendarDays aria-hidden="true" size={20} /></span>
              <div>
                <p className={styles.dialogKicker}>{selectedEvents.length ? `${selectedEvents.length} scheduled ${selectedEvents.length === 1 ? 'item' : 'items'}` : 'No scheduled items'}</p>
                <h2 id="calendar-day-title" className={styles.dialogTitle}>{new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              </div>
              <button type="button" onClick={closeDay} className={styles.closeButton} aria-label="Close day details"><X aria-hidden="true" size={19} /></button>
            </header>
            <div className={styles.dialogBody}>
              {selectedEvents.length ? selectedEvents.map((event, index) => {
                const tone = eventTone(event.kind);
                return (
                  <article key={`${event.label}-${index}`} className={styles.eventRow}>
                    <span className={`${styles.eventMarker} ${tone.dot}`} />
                    <div>
                      <p className={`${styles.eventKind} ${tone.text}`}>{event.kind.toUpperCase()}</p>
                      <h3 className={styles.eventTitle}>{event.label}</h3>
                      <p className={styles.eventSource}>{event.sourceLine}</p>
                    </div>
                  </article>
                );
              }) : (
                <div className={styles.quietDay}>
                  <CalendarDays aria-hidden="true" size={25} />
                  <h3>Nothing scheduled</h3>
                  <p>A quiet day is a good opportunity to get ahead or revisit something.</p>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
