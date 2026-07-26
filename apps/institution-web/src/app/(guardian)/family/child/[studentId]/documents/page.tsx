'use client';
import { useParams } from 'next/navigation';
import { useGet, usePost } from '@/lib/guardian/hooks';
import { Card, Pill, Skeleton, EmptyState, Section, Button } from '@/components/guardian/ui';
import { FileText } from 'lucide-react';

type Docs = { items: Array<{ id: string; type: string; title: string; issuedAt: string | null; downloadPath: string }> };
type Reqs = { items: Array<{ id: string; type: string; status: string }> };

export default function DocumentsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const docs = useGet<Docs>(`/students/${studentId}/documents`);
  const reqs = useGet<Reqs>(`/document-requests?studentId=${studentId}`);
  const request = usePost<{ studentId: string; type: string }>('/document-requests', [`/document-requests?studentId=${studentId}`]);

  if (docs.isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Documents</h1>
      <Section title="Published documents">
        {docs.data?.items.length ? docs.data.items.map((d) => (
          <Card key={d.id} className="flex items-center gap-3">
            <FileText className="text-brand shrink-0" size={20} />
            <div className="flex-1"><p className="text-sm font-medium">{d.title}</p><p className="text-xs text-muted">{d.type} · {d.issuedAt?.slice(0, 10)}</p></div>
            <a href={d.downloadPath} className="text-brand text-sm font-semibold">Open</a>
          </Card>
        )) : <EmptyState title="No documents yet" />}
      </Section>

      <Section title="Request a certificate">
        <Card className="space-y-2">
          {reqs.data?.items.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm"><span>{r.type}</span><Pill tone={r.status === 'ready' ? 'good' : 'warn'}>{r.status}</Pill></div>
          ))}
          <Button disabled={request.isPending} onClick={() => request.mutate({ studentId, type: 'bonafide' })}>
            {request.isPending ? 'Requesting…' : request.isSuccess ? 'Requested ✓' : 'Request bonafide certificate'}
          </Button>
        </Card>
      </Section>
    </div>
  );
}
