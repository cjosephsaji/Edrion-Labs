'use client';
import { useState } from 'react';
import { useGet, usePost, useMe } from '@/lib/guardian/hooks';
import { Card, Skeleton, EmptyState, Section, Pill } from '@/components/guardian/ui';

type Events = { items: Array<{ id: string; title: string; description: string | null }> };
type Slots = { items: Array<{ id: string; startsAt: string; teacherFirst: string | null; teacherLast: string | null; available: boolean }> };

export default function PtmPage() {
  const events = useGet<Events>('/ptm/events');
  const me = useMe();
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  if (events.isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Parent-teacher meetings</h1>
      {events.data?.items.length ? events.data.items.map((e) => (
        <Section key={e.id} title={e.title}>
          {e.description && <p className="text-xs text-muted px-1">{e.description}</p>}
          <button className="text-brand text-sm font-semibold px-1" onClick={() => setOpenEvent(openEvent === e.id ? null : e.id)}>
            {openEvent === e.id ? 'Hide slots' : 'View slots'}
          </button>
          {openEvent === e.id && <SlotList eventId={e.id} studentId={me.data?.children[0]?.studentId} />}
        </Section>
      )) : <EmptyState title="No meetings scheduled" />}
    </div>
  );
}

function SlotList({ eventId, studentId }: { eventId: string; studentId?: string }) {
  const slots = useGet<Slots>(`/ptm/events/${eventId}/slots`);
  const book = usePost<{ id: string; studentId: string }, unknown>((b) => `/ptm/slots/${b.id}/book`, [`/ptm/events/${eventId}/slots`]);
  if (slots.isLoading) return <Skeleton className="h-24" />;
  return (
    <div className="space-y-2 mt-2">
      {slots.data?.items.map((s) => (
        <Card key={s.id} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium">{new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-xs text-muted">{s.teacherFirst} {s.teacherLast}</p>
          </div>
          {s.available && studentId
            ? <button className="text-brand text-sm font-semibold" disabled={book.isPending} onClick={() => book.mutate({ id: s.id, studentId })}>Book</button>
            : <Pill tone="neutral">Full</Pill>}
        </Card>
      ))}
    </div>
  );
}
