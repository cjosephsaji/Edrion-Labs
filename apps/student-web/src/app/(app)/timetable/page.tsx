'use client';

import { CalendarDays, Clock3, MapPin, UserRound } from 'lucide-react';
import { ModuleListPage } from '@/components/module-page';
import { SurfaceCard } from '@/components/ui/states';

type Row = {
  id: string;
  date: string;
  start: string;
  end: string;
  subject: { id: string | null; name: string; colorIndex: number };
  teacher: { id: string | null; name: string };
  room: { name: string | null };
  state: 'normal' | 'cancelled' | 'room_changed' | 'substituted';
};

const stateLabels: Record<Row['state'], string | null> = {
  normal: null,
  cancelled: 'Cancelled',
  room_changed: 'Room changed',
  substituted: 'Substitute teacher',
};
const title = 'Timetable';
const description = 'Your class schedule for this week.';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function weekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}

export default function Page() {
  const { from, to } = weekRange();
  return (
    <ModuleListPage<Row>
      title={title}
      description={description}
      path={`/student/timetable?from=${from}&to=${to}`}
      queryKey={`timetable-${from}`}
      emptyTitle="No timetable slots yet"
      petros={(item) => ({
        entityType: 'timetable_slot',
        entityId: item.id,
        title: item.subject.name || 'Class',
        summary: [formatDate(item.date), `${item.start} - ${item.end}`, item.teacher.name, stateLabels[item.state]]
          .filter(Boolean)
          .join(' · '),
        href: '/timetable',
      })}
      emptyDescription="Your institution hasn’t published a timetable for your class."
      renderItem={(item) => (
        <SurfaceCard className="grid gap-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
          <div className="flex items-center gap-3 border-b border-[var(--s-divider)] pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--s-accentSoft)] text-[var(--s-accentDeep)]">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-[var(--s-ink)]">{formatDate(item.date)}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--s-muted)]">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {item.start} - {item.end}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-[var(--s-ink)]">{item.subject.name}</p>
              {stateLabels[item.state] ? (
                <span className="rounded-full bg-[var(--s-amberSoft)] px-2 py-0.5 text-xs font-medium text-[var(--s-amberInk)]">
                  {stateLabels[item.state]}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--s-muted)]">
              <span className="flex items-center gap-1.5">
                <UserRound aria-hidden="true" className="size-4" />
                {item.teacher.name}
              </span>
              {item.room.name ? (
                <span className="flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="size-4" />
                  {item.room.name}
                </span>
              ) : null}
            </div>
          </div>
        </SurfaceCard>
      )}
    />
  );
}
