'use client';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Section } from '@/components/guardian/ui';
import { ShieldCheck } from 'lucide-react';

type Profile = { bloodGroup: string | null; allergies: string[]; dietaryRestrictions: string | null; doctorName: string | null; lastVerifiedAt: string | null; emergencyContacts: Array<{ name: string; phone: string }> } | null;
type List<T> = { items: T[] };

export default function HealthPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const profile = useGet<Profile>(`/students/${studentId}/health/profile`);
  const visits = useGet<List<{ id: string; title: string; recordedAt: string | null }>>(`/students/${studentId}/health/visits`);
  const incidents = useGet<List<{ id: string; title: string; severity: string; actionTaken: string | null; occurredAt: string | null }>>(`/students/${studentId}/health/incidents`);
  const meds = useGet<List<{ id: string; medication: string; dosage: string | null; administeredAt: string | null }>>(`/students/${studentId}/health/medications`);

  if (profile.isLoading) return <Skeleton className="h-64" />;
  const p = profile.data;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Health</h1>

      <Section title="Health profile" action={p?.lastVerifiedAt ? <Pill tone="good"><ShieldCheck size={12} className="mr-1" />Nurse-verified</Pill> : undefined}>
        <Card className="space-y-1.5 text-sm">
          <Row k="Blood group" v={p?.bloodGroup ?? '—'} />
          <Row k="Allergies" v={p?.allergies?.length ? p.allergies.join(', ') : 'None recorded'} />
          <Row k="Dietary" v={p?.dietaryRestrictions ?? '—'} />
          <Row k="Doctor" v={p?.doctorName ?? '—'} />
          <Row k="Emergency" v={p?.emergencyContacts?.[0] ? `${p.emergencyContacts[0].name} · ${p.emergencyContacts[0].phone}` : '—'} />
        </Card>
      </Section>

      <Section title="Health-room visits">
        {visits.data?.items.length ? visits.data.items.map((v) => (
          <Card key={v.id} className="flex items-center justify-between py-3"><span className="text-sm">{v.title}</span><span className="text-xs text-muted">{v.recordedAt}</span></Card>
        )) : <EmptyState title="No visits" />}
      </Section>

      <Section title="Incidents">
        {incidents.data?.items.length ? incidents.data.items.map((i) => (
          <Card key={i.id} className="space-y-1">
            <div className="flex items-center justify-between"><span className="text-sm font-medium">{i.title}</span><Pill tone={i.severity === 'high' || i.severity === 'critical' ? 'bad' : 'warn'}>{i.severity}</Pill></div>
            {i.actionTaken && <p className="text-sm text-muted">Action: {i.actionTaken}</p>}
          </Card>
        )) : <EmptyState title="No incidents" />}
      </Section>

      <Section title="Medication log">
        {meds.data?.items.length ? meds.data.items.map((m) => (
          <Card key={m.id} className="flex items-center justify-between py-3"><span className="text-sm">{m.medication}{m.dosage ? ` · ${m.dosage}` : ''}</span><span className="text-xs text-muted">{m.administeredAt?.slice(0, 10)}</span></Card>
        )) : <EmptyState title="No medication logged" />}
      </Section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted">{k}</span><span className="font-medium text-right">{v}</span></div>;
}
