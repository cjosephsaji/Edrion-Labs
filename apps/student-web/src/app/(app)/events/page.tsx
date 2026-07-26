'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStudentClient } from '@/lib/student-client';
import { PageHeader, Eyebrow } from '@/components/ui/primitives';

export default function CampusEventsPage() {
  const client = useStudentClient();
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ['campus', 'events'],
    queryFn: () => client.get<{ items: Array<{ id: string; title: string; startsAt: string }> }>('/student/campus/events'),
  });
  const register = useMutation({
    mutationFn: (id: string) => client.post(`/student/campus/events/${id}/register`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campus', 'events'] }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader eyebrow={<Eyebrow>CAMPUS</Eyebrow>} title="Events" />
      <ul className="mt-6 space-y-2">
        {(events.data?.items ?? []).map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-st-ink">{e.title}</p>
              <p className="text-xs text-st-muted">{new Date(e.startsAt).toLocaleString()}</p>
            </div>
            <button
              type="button"
              className="rounded-full bg-st-accent px-3 py-1 text-xs text-white"
              onClick={() => register.mutate(e.id)}
            >
              Register
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
