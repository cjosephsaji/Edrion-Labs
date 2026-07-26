'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useGet, usePost } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Section, Button } from '@/components/guardian/ui';

type Pickups = { items: Array<{ id: string; personName: string; relationship: string | null; phone: string | null; status: string }> };
type Gate = { items: Array<{ id: string; type: string; occurredAt: string; pickupPerson: string | null }> };
const statusTone: Record<string, string> = { active: 'good', revoked: 'neutral', pending_school_verification: 'warn' };

export default function PickupPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const pickups = useGet<Pickups>(`/students/${studentId}/pickup-authorizations`);
  const gate = useGet<Gate>(`/students/${studentId}/gate-events`);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const add = usePost<{ studentId: string; personName: string; phone: string; relationship: string }>(`/students/${studentId}/pickup-authorizations`, [`/students/${studentId}/pickup-authorizations`]);

  if (pickups.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Pickup & Gate</h1>

      <Section title="Authorized to collect">
        {pickups.data?.items.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div><p className="text-sm font-medium">{p.personName}</p><p className="text-xs text-muted">{p.relationship} {p.phone && `· ${p.phone}`}</p></div>
            <Pill tone={statusTone[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Pill>
          </Card>
        ))}
        <Card className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Person name" className="w-full rounded-xl border border-line px-3 py-3 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full rounded-xl border border-line px-3 py-3 text-sm" />
          <Button
            disabled={add.isPending || !name}
            onClick={() => add.mutate({ studentId, personName: name, phone, relationship: 'relative' }, { onSuccess: () => { setName(''); setPhone(''); } })}
          >
            {add.isPending ? 'Adding…' : 'Add person (needs school verification)'}
          </Button>
        </Card>
      </Section>

      <Section title="Gate activity">
        {gate.data?.items.length ? gate.data.items.map((g) => (
          <Card key={g.id} className="flex items-center justify-between py-3">
            <span className="text-sm capitalize">{g.type.replace(/_/g, ' ')}{g.pickupPerson ? ` · ${g.pickupPerson}` : ''}</span>
            <span className="text-xs text-muted">{new Date(g.occurredAt).toLocaleString()}</span>
          </Card>
        )) : <EmptyState title="No gate activity" />}
      </Section>
    </div>
  );
}
