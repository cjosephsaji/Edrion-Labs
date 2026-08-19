'use client';

import { CalendarDays, MapPin, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';
import styles from './timetable.module.css';

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
/** The timetable endpoint returns expanded occurrences, not a generic item list. */
type Response = { occurrences: Row[] };

const stateLabels: Record<Row['state'], string | null> = {
  normal: null,
  cancelled: 'Cancelled',
  room_changed: 'Room changed',
  substituted: 'Substitute teacher',
};

const pageTitle = 'Timetable';
const pageDescription = 'Your class schedule for this week.';

function weekRange(today: Date) {
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + mondayOffset),
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}

function dayHeading(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function Page() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const { from, to } = weekRange(today);
  const query = useStudentList<Response>(
    `timetable-${from}`,
    `/student/timetable?from=${from}&to=${to}`,
  );

  usePetrosPage(
    query.data
      ? {
          title: pageTitle,
          summary: pageDescription,
          candidates: (query.data.occurrences ?? []).map((row) => ({
            ref: row.id,
            entityType: 'timetable_slot' as const,
            entityId: row.id,
            title: row.subject.name || 'Class',
            summary: [dayHeading(row.date), `${row.start}–${row.end}`, row.teacher.name, stateLabels[row.state]]
              .filter(Boolean)
              .join(' · '),
            href: '/timetable',
          })),
        }
      : null,
  );

  return (
    <QueryPage query={query} loadingLabel="Loading timetable…">
      {(data) => {
        const items = [...(data.occurrences ?? [])].sort(
          (left, right) => left.date.localeCompare(right.date) || left.start.localeCompare(right.start),
        );
        // One heading per day instead of repeating the date on every single row.
        const days = items.reduce<Array<{ date: string; slots: Row[] }>>((groups, row) => {
          const last = groups[groups.length - 1];
          if (last && last.date === row.date) last.slots.push(row);
          else groups.push({ date: row.date, slots: [row] });
          return groups;
        }, []);

        return (
          <div className="mx-auto w-full max-w-[1120px]">
            <PageHeader eyebrow="This week" title={pageTitle} description={pageDescription} />

            {days.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No timetable published"
                description="Your institution has not published a schedule for this week."
              />
            ) : (
              <div className={styles.week}>
                {days.map((day) => {
                  const isToday = day.date === todayKey;
                  return (
                    <section className={styles.day} key={day.date} data-today={isToday || undefined}>
                      <h2 className={styles.dayHead}>
                        <span>{dayHeading(day.date)}</span>
                        {isToday ? <em className={styles.todayTag}>Today</em> : null}
                        <small>{day.slots.length} {day.slots.length === 1 ? 'class' : 'classes'}</small>
                      </h2>

                      <ul className={styles.slots}>
                        {day.slots.map((slot) => {
                          const note = stateLabels[slot.state];
                          return (
                            <li className={styles.slot} key={slot.id} data-state={slot.state}>
                              <span className={styles.time}>
                                <strong>{slot.start}</strong>
                                <small>{slot.end}</small>
                              </span>
                              <div className={styles.slotBody}>
                                <h3 className={styles.subject}>{slot.subject.name || 'Class'}</h3>
                                <p className={styles.meta}>
                                  {slot.teacher.name ? (
                                    <span><UserRound aria-hidden="true" />{slot.teacher.name}</span>
                                  ) : null}
                                  {slot.room.name ? (
                                    <span><MapPin aria-hidden="true" />{slot.room.name}</span>
                                  ) : null}
                                </p>
                                {note ? <p className={styles.note}>{note}</p> : null}
                              </div>
                              <PetrosAskButton
                                candidateRef={slot.id}
                                label={`${slot.subject.name} on ${dayHeading(slot.date)}`}
                                variant="icon"
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
