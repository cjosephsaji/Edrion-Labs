'use client';
import { useParams } from 'next/navigation';
import { useGet, usePost } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Section, Button } from '@/components/guardian/ui';
import { Trophy } from 'lucide-react';

type Incidents = { items: Array<{ id: string; title: string; category: string; severity: string; description: string | null; parentAckRequired: boolean; parentAcknowledgedAt: string | null }> };
type Recognitions = { items: Array<{ id: string; title: string; type: string; description: string | null }> };

export default function BehaviorPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const incidents = useGet<Incidents>(`/students/${studentId}/behavior`);
  const recognitions = useGet<Recognitions>(`/students/${studentId}/recognitions`);
  const ack = usePost<{ id: string }, unknown>((b) => `/behavior/${b.id}/acknowledge`, [`/students/${studentId}/behavior`]);

  if (incidents.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Behaviour & Achievements</h1>

      <Section title="Achievements 🎉">
        {recognitions.data?.items.length ? recognitions.data.items.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 bg-brand/5 border-brand/30">
            <Trophy className="text-brand shrink-0" size={20} />
            <div><p className="font-semibold text-sm">{r.title}</p>{r.description && <p className="text-xs text-muted">{r.description}</p>}</div>
          </Card>
        )) : <EmptyState title="No awards yet" hint="Recognitions from the school appear here." />}
      </Section>

      <Section title="Behaviour notes">
        {incidents.data?.items.length ? incidents.data.items.map((i) => (
          <Card key={i.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{i.title}</span>
              <Pill tone={i.severity === 'high' ? 'bad' : 'warn'}>{i.category}</Pill>
            </div>
            {i.description && <p className="text-sm text-muted">{i.description}</p>}
            {i.parentAckRequired && !i.parentAcknowledgedAt && (
              <Button variant="ghost" disabled={ack.isPending} onClick={() => ack.mutate({ id: i.id })}>Acknowledge</Button>
            )}
            {i.parentAcknowledgedAt && <Pill tone="good">Acknowledged</Pill>}
          </Card>
        )) : <EmptyState title="No behaviour notes" hint="Good news — nothing to report." />}
      </Section>
    </div>
  );
}
