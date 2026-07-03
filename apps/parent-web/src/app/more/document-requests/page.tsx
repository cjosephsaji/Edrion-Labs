'use client';
import { useState } from 'react';
import { useMe, useGet, usePost } from '@/lib/hooks';
import { Card, Pill, Skeleton, EmptyState, Button, Section } from '@/components/ui';

const TYPES = ['bonafide', 'transfer_certificate', 'fee_receipt_duplicate', 'character_certificate'];
const tone: Record<string, string> = { requested: 'warn', in_progress: 'brand', ready: 'good', rejected: 'bad' };

export default function DocumentRequestsPage() {
  const me = useMe();
  const list = useGet<{ items: Array<{ id: string; type: string; status: string }> }>('/document-requests');
  const create = usePost<{ studentId: string; type: string }>('/document-requests', ['/document-requests']);
  const [type, setType] = useState('bonafide');
  const sid = me.data?.children[0]?.studentId;

  if (list.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Document requests</h1>
      <Section title="New request">
        <Card className="space-y-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-line px-3 py-3 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <Button disabled={create.isPending || !sid} onClick={() => sid && create.mutate({ studentId: sid, type })}>
            {create.isPending ? 'Requesting…' : create.isSuccess ? 'Requested ✓' : 'Request'}
          </Button>
        </Card>
      </Section>
      <Section title="Your requests">
        {list.data?.items.length ? list.data.items.map((r) => (
          <Card key={r.id} className="flex items-center justify-between"><span className="text-sm">{r.type.replace(/_/g, ' ')}</span><Pill tone={tone[r.status] ?? 'neutral'}>{r.status}</Pill></Card>
        )) : <EmptyState title="No requests yet" />}
      </Section>
    </div>
  );
}
