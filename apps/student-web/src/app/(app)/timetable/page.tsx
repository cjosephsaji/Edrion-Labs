'use client';

import { useEffect, useMemo, useState } from 'react';
import { get, set } from 'idb-keyval';
import Link from 'next/link';
import { useStudentClient } from '@/lib/student-client';
import { Eyebrow, PageTitle } from '@/components/ui/primitives';

type Occurrence = {
  id: string;
  date: string;
  start: string;
  end: string;
  kind: string;
  subject: { name: string; colorIndex: number };
  teacher: { name: string };
  room: { name: string | null };
  state: string;
  clash: boolean;
  note: string | null;
};

type TimetablePayload = {
  occurrences: Occurrence[];
  dayBounds: { earliestStart: string; latestEnd: string };
  published: boolean;
};

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function shiftDate(base: string, days: number) {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function TimetablePage() {
  const client = useStudentClient();
  const [date, setDate] = useState(isoDate());
  const [data, setData] = useState<TimetablePayload>();
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const cacheKey = `student:timetable:${date}`;

  const dayOccurrences = useMemo(
    () => (data?.occurrences ?? []).filter((row) => row.date === date),
    [data?.occurrences, date],
  );

  useEffect(() => {
    let active = true;
    void get<{ value: TimetablePayload; cachedAt: number }>(cacheKey).then((cached) => {
      if (!active || !cached) return;
      setData(cached.value);
      setOffline(true);
      setLoading(false);
    });
    const from = shiftDate(date, -7);
    const to = shiftDate(date, 7);
    void client
      .get<TimetablePayload>(`/timetable?from=${from}&to=${to}`)
      .then(async (payload) => {
        if (!active) return;
        setData(payload);
        setOffline(false);
        await set(cacheKey, { value: payload, cachedAt: Date.now() });
      })
      .catch(() => setOffline(true))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cacheKey, client, date]);

  if (loading && !data) {
    return <div className="mx-auto max-w-[900px] px-5 py-8"><div className="h-8 w-48 shimmer rounded-lg" /></div>;
  }

  if (!data?.published) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 text-center">
        <PageTitle>Your institution hasn&apos;t published this term&apos;s timetable yet.</PageTitle>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Eyebrow>TIMETABLE</Eyebrow>
          <PageTitle className="mt-2">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}</PageTitle>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="rounded-lg border px-3 py-2">‹</button>
          {date !== isoDate() && <button type="button" onClick={() => setDate(isoDate())} className="rounded-full bg-st-soft px-3 py-1 text-xs">Today</button>}
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="rounded-lg border px-3 py-2">›</button>
        </div>
      </div>
      {offline && <p className="mt-3 rounded-full bg-st-soft px-3 py-1 text-xs text-st-muted">Offline — showing last synced</p>}
      <div className="relative mt-8 space-y-3">
        {dayOccurrences.length === 0 ? (
          <p className="text-sm text-st-muted">No classes scheduled for this day.</p>
        ) : (
          dayOccurrences.map((occ) => (
            <article
              key={occ.id}
              className={`rounded-xl border border-st-bd1 bg-st-card p-4 ${occ.state === 'cancelled' ? 'opacity-60' : ''} ${occ.clash ? 'w-[45%] inline-block align-top mr-2' : ''}`}
              style={{ borderLeft: `3px solid hsl(${(occ.subject.colorIndex * 30) % 360} 45% 40%)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold ${occ.state === 'cancelled' ? 'line-through' : ''}`}>{occ.subject.name}</p>
                  <p className="mt-1 text-xs text-st-muted">{occ.start}–{occ.end} · {occ.teacher.name}{occ.room.name ? ` · ${occ.room.name}` : ''}</p>
                </div>
                {occ.state !== 'normal' && <span className="rounded-full bg-st-soft px-2 py-0.5 text-[10px] uppercase">{occ.state.replaceAll('_', ' ')}</span>}
              </div>
              {occ.note && <p className="mt-2 text-xs text-st-muted">{occ.note}</p>}
              <Link href={`/timetable?period=${encodeURIComponent(occ.id)}`} className="mt-3 inline-block text-xs font-semibold text-st-accentDeep">Details</Link>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
