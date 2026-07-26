'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';

type PtmEvent = { id: string; title: string; status: string; startsOn: string | null; endsOn: string | null };
type SlotRow = { slot: { id: string; startsAt: string; endsAt: string; bookedCount: number; capacity: number }; teacherFirst: string | null; teacherLast: string | null };
type BookingRow = { booking: { id: string; status: string }; student: { firstName: string; lastName: string }; slot: { startsAt: string } };

export default function PtmStaffPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const { data: teachers } = useTeachingStaffOptions();
  const teacherOptions = teachingStaffSelectOptions(teachers);
  const [title, setTitle] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ['portal', 'ptm', 'events'],
    queryFn: () => client.get<PtmEvent[]>('/portal/ptm/events', scope),
  });
  const eventId = selectedId ?? events.data?.[0]?.id ?? null;

  const slots = useQuery({
    queryKey: ['portal', 'ptm', 'slots', eventId],
    enabled: !!eventId,
    queryFn: () => client.get<SlotRow[]>(`/portal/ptm/events/${eventId}/slots`, scope),
  });
  const bookings = useQuery({
    queryKey: ['portal', 'ptm', 'bookings', eventId],
    enabled: !!eventId,
    queryFn: () => client.get<BookingRow[]>(`/portal/ptm/events/${eventId}/bookings`, scope),
  });

  const createEvent = useMutation({
    mutationFn: () => client.post<PtmEvent>('/portal/ptm/events', scope, { title }),
    onSuccess: (row) => {
      setTitle('');
      setFormError(null);
      setSelectedId(row.id);
      qc.invalidateQueries({ queryKey: ['portal', 'ptm', 'events'] });
    },
    onError: (err) => setFormError(formatPortalError(err)),
  });
  const publish = useMutation({
    mutationFn: () => client.post(`/portal/ptm/events/${eventId}/publish`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'ptm', 'events'] }),
    onError: (err) => setFormError(formatPortalError(err)),
  });
  const addSlot = useMutation({
    mutationFn: () =>
      client.post(`/portal/ptm/events/${eventId}/slots`, scope, {
        teacherId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    onSuccess: () => {
      setTeacherId('');
      setStartsAt('');
      setEndsAt('');
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['portal', 'ptm', 'slots', eventId] });
    },
    onError: (err) => setFormError(formatPortalError(err)),
  });

  return (
    <>
      <Topbar title="Parent-teacher meetings" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
        <p className="max-w-3xl text-sm text-text-secondary">
          Create a PTM <strong>event</strong>, add teacher <strong>slots</strong>, then <strong>publish</strong> so parents can book in the family portal.
        </p>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Schedule event</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              type="button"
              disabled={!title.trim() || createEvent.isPending}
              onClick={() => createEvent.mutate()}
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Create draft
            </button>
            {eventId && (
              <button
                type="button"
                disabled={publish.isPending}
                onClick={() => publish.mutate()}
                className="rounded-md border border-border px-3 py-2 text-xs font-medium"
              >
                Publish
              </button>
            )}
          </div>
          {(events.data ?? []).length > 0 ? (
            <select
              className="mt-3 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={eventId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              {(events.data ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({ev.status})
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {events.isLoading && <Skeleton className="h-20 w-full" />}
        {events.isError && <ErrorState title="Could not load PTM events — you need parent_comm.ptm.manage (try admin@uis.edu.in)." />}

        {eventId && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-medium text-text-primary">Add teacher slot</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  <option value="">Teacher…</option>
                  {teacherOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <input
                  type="datetime-local"
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!teacherId || !startsAt || !endsAt || addSlot.isPending}
                  onClick={() => addSlot.mutate()}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Add slot
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-text-primary">Slots</p>
                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                  {(slots.data ?? []).map((row) => (
                    <li key={row.slot.id}>
                      {row.teacherFirst} {row.teacherLast} · {new Date(row.slot.startsAt).toLocaleString()} (
                      {row.slot.bookedCount}/{row.slot.capacity})
                    </li>
                  ))}
                  {(slots.data ?? []).length === 0 && !slots.isLoading ? <li className="text-text-muted">No slots yet.</li> : null}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-text-primary">Bookings</p>
                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                  {(bookings.data ?? []).map((row) => (
                    <li key={row.booking.id}>
                      {row.student.firstName} {row.student.lastName} · {new Date(row.slot.startsAt).toLocaleString()} ·{' '}
                      {row.booking.status}
                    </li>
                  ))}
                  {(bookings.data ?? []).length === 0 && !bookings.isLoading ? <li className="text-text-muted">No bookings yet.</li> : null}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
