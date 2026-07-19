'use client';
import { useState } from 'react';
import { useMe, useGet, usePost } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Button, Section } from '@/components/guardian/ui';

const tone: Record<string, string> = { submitted: 'warn', approved: 'good', rejected: 'bad' };

export default function ProfileChangesPage() {
  const me = useMe();
  const list = useGet<{ items: Array<{ id: string; fieldGroup: string; status: string }> }>('/profile-change-requests');
  const create = usePost<{ studentId: string; fieldGroup: string; proposedChanges: Record<string, string> }>('/profile-change-requests', ['/profile-change-requests']);
  const [value, setValue] = useState('');
  const sid = me.data?.children[0]?.studentId;

  if (list.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Profile changes</h1>
      <Section title="Request an address update">
        <Card className="space-y-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="New address" className="w-full rounded-xl border border-line px-3 py-3 text-sm" />
          <Button disabled={create.isPending || !sid || !value} onClick={() => sid && create.mutate({ studentId: sid, fieldGroup: 'address', proposedChanges: { address: value } }, { onSuccess: () => setValue('') })}>
            {create.isPending ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </Card>
      </Section>
      <Section title="Your requests">
        {list.data?.items.length ? list.data.items.map((r) => (
          <Card key={r.id} className="flex items-center justify-between"><span className="text-sm capitalize">{r.fieldGroup}</span><Pill tone={tone[r.status] ?? 'neutral'}>{r.status}</Pill></Card>
        )) : <EmptyState title="No requests" />}
      </Section>
    </div>
  );
}
