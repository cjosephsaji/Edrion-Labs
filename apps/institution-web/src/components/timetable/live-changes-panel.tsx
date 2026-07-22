'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from '@/lib/portal-client';
import { useActiveScope } from '@/lib/scope';
import { useClasses } from '@/lib/academics';

export function LiveChangesPanel() {
  const client = usePortalClient();
  const scope = useActiveScope();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const selectedClass = useMemo(
    () => classes?.items.find((row) => row.id === classId),
    [classes?.items, classId],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['timetable-day', classId, date, scope],
    enabled: Boolean(classId),
    queryFn: () => client.get<{ occurrences: Array<{ id: string; start: string; end: string; subject: { name: string }; teacher: { name: string }; room: { name: string | null }; state: string }> }>(
      `/portal/timetable/day?classId=${classId}&date=${date}`,
      scope,
    ),
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm md:col-span-2">
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
            <option value="">Select class</option>
            {classes?.items.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
        </label>
      </div>
      {!classId ? (
        <p className="mt-6 text-sm text-muted-foreground">Select a class to compose live changes.</p>
      ) : isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading resolved day…</p>
      ) : (
        <div className="mt-6 space-y-2">
          <p className="text-xs text-muted-foreground">{selectedClass?.name} · {date}</p>
          {(data?.occurrences ?? []).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{row.start}–{row.end} · {row.subject.name}</p>
                <p className="text-xs text-muted-foreground">{row.teacher.name}{row.room.name ? ` · ${row.room.name}` : ''}</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">{row.state}</span>
            </div>
          ))}
          <button type="button" onClick={() => void refetch()} className="mt-3 text-sm font-semibold text-primary">Refresh</button>
        </div>
      )}
    </div>
  );
}
