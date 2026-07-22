'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock3, FileCheck2, Inbox, Paperclip, UserCheck } from 'lucide-react';
import { Badge, Button, PermissionDenied, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { usePortalMe } from '@/lib/hooks';
import { useScope } from '@/lib/scope';
import {
  type IssuanceItem,
  type PortalRequest,
  useIssuance,
  useIssuanceAction,
  usePortalRequest,
  usePortalRequests,
  useRequestAction,
  useRetryIssuanceRender,
} from '@/lib/requests';

type Composer = 'reject' | 'request-info' | 'note' | 'reassign' | null;

export default function ApprovalsPage() {
  const { can } = usePermissions();
  const search = useSearchParams();
  const [tab, setTab] = useState<'inbox' | 'issuance' | 'batches'>('inbox');

  if (!can('requests.review')) {
    return <><Topbar title="Approvals" /><div className="p-6"><PermissionDenied description="You don’t have permission to review requests." /></div></>;
  }

  return (
    <>
      <Topbar title="Approvals" />
      <div className="page-enter flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Tab active={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox</Tab>
          {can('documents.issue') && <Tab active={tab === 'issuance'} onClick={() => setTab('issuance')}>Issuance</Tab>}
          {can('documents.issue') && <Tab active={tab === 'batches'} onClick={() => setTab('batches')}>Batches</Tab>}
        </div>
        {tab === 'inbox' ? <InboxView initialRequestId={search.get('request')} /> : null}
        {tab === 'issuance' ? <IssuanceView /> : null}
        {tab === 'batches' ? <BatchesView /> : null}
      </div>
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-secondary hover:bg-primary-soft'}`}>{children}</button>;
}

function InboxView({ initialRequestId }: { initialRequestId: string | null }) {
  const [filters, setFilters] = useState({ status: '', type: '', sla: false, mine: false });
  const list = usePortalRequests(filters);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId);
  const items = list.data?.items ?? [];

  useEffect(() => {
    if (list.isLoading) return;
    if (!selectedId && items[0]) setSelectedId(items[0].id);
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
      const index = Math.max(0, items.findIndex((item) => item.id === selectedId));
      if (event.key === 'j') setSelectedId(items[Math.min(items.length - 1, index + 1)]?.id ?? null);
      if (event.key === 'k') setSelectedId(items[Math.max(0, index - 1)]?.id ?? null);
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [items, selectedId]);

  return (
    <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-sm lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="flex min-h-[520px] flex-col border-b border-border lg:border-b-0 lg:border-r">
        <header className="space-y-3 border-b border-border bg-surface p-4">
          <div className="flex items-center justify-between"><h1 className="font-semibold text-text-primary">Requests inbox</h1><Badge tone="primary">{items.length} pending</Badge></div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm">
              <option value="">Pending</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="needs_info">Needs info</option>
            </select>
            <select aria-label="Type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm">
              <option value="">All types</option><option value="leave_request">Leave request</option><option value="document_request">Document request</option>
            </select>
          </div>
          <div className="flex gap-4 text-xs text-text-secondary">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.sla} onChange={(e) => setFilters((f) => ({ ...f, sla: e.target.checked }))} /> SLA breached</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} /> Mine</label>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {list.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="m-3 h-24" />)}
          {list.isError && <p role="alert" className="m-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">Couldn’t load approvals. Retry in a moment.</p>}
          {!list.isLoading && !list.isError && items.length === 0 && <div className="grid h-64 place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto h-8 w-8 text-success" /><p className="mt-3 font-semibold">Inbox zero ✓</p><p className="text-sm text-text-muted">Nothing waiting on you.</p></div></div>}
          {items.map((item) => <RequestRow key={item.id} item={item} active={selectedId === item.id} onClick={() => setSelectedId(item.id)} />)}
        </div>
      </section>
      <RequestDetail id={selectedId} />
    </div>
  );
}

function RequestRow({ item, active, onClick }: { item: PortalRequest; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full border-b border-border px-4 py-3 text-left transition-colors ${item.slaBreached ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-transparent'} ${active ? 'bg-primary-soft/60' : 'hover:bg-background-secondary'}`}>
      <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-text-primary">{item.studentName ?? 'Student'}</p><Status status={item.status} /></div>
      <p className="mt-1 text-xs font-medium text-primary">{item.typeLabel} · <span className="font-mono">{item.humanCode}</span></p>
      <p className="mt-1 truncate text-xs text-text-muted">{item.summary}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted"><Clock3 className="h-3 w-3" />{age(item.submittedAt)}{item.assignedUserId && <><UserCheck className="ml-auto h-3 w-3" /> Claimed</>}</div>
    </button>
  );
}

function RequestDetail({ id }: { id: string | null }) {
  const { can } = usePermissions();
  const { data: me } = usePortalMe();
  const client = usePortalClient();
  const { scope } = useScope();
  const detail = usePortalRequest(id);
  const action = useRequestAction();
  const [composer, setComposer] = useState<Composer>(null);
  const [text, setText] = useState('');
  const [shortcuts, setShortcuts] = useState(false);
  const request = detail.data;
  const canDecide = request?.status === 'submitted' || request?.status === 'in_review';

  async function act(name: string, body: Record<string, unknown> = {}) {
    if (!request) return;
    try {
      await action.mutateAsync({ id: request.id, action: name, body: { version: request.version, ...body } });
      setComposer(null); setText('');
    } catch {
      await detail.refetch();
    }
  }

  async function openAttachment(storageObjectId: string) {
    if (!request) return;
    const blob = await client.fetchFile(
      `/portal/requests/${request.id}/attachments/${storageObjectId}/file`,
      scope,
    );
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) || !request || action.isPending) return;
      if (event.key === '?') setShortcuts((value) => !value);
      if (event.key === 'c' && canDecide && !request.assignedUserId) void act('claim');
      if (event.key === 'a' && canDecide) void act('approve');
      if (event.key === 'r' && canDecide) setComposer('reject');
      if (event.key === 'i' && canDecide) setComposer('request-info');
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  if (!id) return <div className="hidden place-items-center text-sm text-text-muted lg:grid"><Inbox className="mb-2 h-8 w-8" />Choose a request to review</div>;
  if (detail.isLoading || !request) return <div className="space-y-4 p-6"><Skeleton className="h-16" /><Skeleton className="h-44" /><Skeleton className="h-32" /></div>;

  const payload = Object.entries(request.payload).filter(([key]) => key !== 'notify_sessions' && key !== 'info_replies');
  const sessions = Array.isArray(request.context?.sessions) ? request.context.sessions : [];
  const attendance = Array.isArray(request.context?.attendance) ? request.context.attendance : [];
  const error = action.error ? formatPortalError(action.error) : null;

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col bg-surface-elevated">
      <div className="flex-1 space-y-6 overflow-y-auto p-5 pb-32 lg:p-6">
        <header><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-text-primary">{request.typeLabel}</h2><Status status={request.status} />{request.slaBreached && <Badge tone="danger">Past expected time</Badge>}<button type="button" onClick={() => setShortcuts(true)} className="ml-auto grid h-8 w-8 place-items-center rounded-full border border-border text-sm font-bold text-text-muted" aria-label="Keyboard shortcuts">?</button></div><p className="mt-1 font-mono text-sm text-text-muted">{request.humanCode} · {request.context && studentName(request.context)}</p></header>
        {shortcuts && <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm"><div className="flex items-center justify-between"><p className="font-semibold">Keyboard shortcuts</p><button onClick={() => setShortcuts(false)} aria-label="Close shortcuts">×</button></div><p className="mt-2 text-text-secondary"><kbd>j/k</kbd> navigate · <kbd>c</kbd> claim · <kbd>a</kbd> approve · <kbd>r</kbd> reject · <kbd>i</kbd> request info</p><p className="mt-1 text-xs text-text-muted">Bulk selection is unavailable for the request types in this release.</p></div>}
        {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error} The request was refreshed.</p>}
        <Block title="Request"><dl className="grid gap-3 sm:grid-cols-2">{payload.map(([key, value]) => <div key={key}><dt className="text-xs capitalize text-text-muted">{pretty(key)}</dt><dd className="mt-1 text-sm text-text-primary">{renderValue(value)}</dd></div>)}</dl>{request.attachments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{request.attachments.map((file) => <button type="button" key={file.storage_object_id} onClick={() => void openAttachment(file.storage_object_id)}><Badge tone="neutral"><Paperclip className="h-3 w-3" />{file.filename}</Badge></button>)}</div>}</Block>
        <Block title="Context snapshot">
          {request.type === 'leave_request' ? <><p className="text-sm font-semibold">Covers {sessions.length} session{sessions.length === 1 ? '' : 's'}</p>{attendance.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{attendance.map((item, i) => { const value = item as Record<string, unknown>; return <Badge key={String(value.subjectId ?? i)} tone="neutral">{String(value.subjectName ?? 'Subject')} · {value.percentage == null ? '—' : `${String(value.percentage)}%`}</Badge>; })}</div>}<ul className="mt-3 space-y-1 text-sm text-text-secondary">{sessions.map((session, i) => <li key={String((session as Record<string, unknown>).session_id ?? i)}>{String((session as Record<string, unknown>).date)} · {String((session as Record<string, unknown>).period)}</li>)}</ul></> : <p className="text-sm text-text-secondary">{Number((request.context?.priorDocuments as unknown[])?.length ?? 0)} prior document(s) of this type · Fee dues unavailable</p>}
        </Block>
        <Block title="Activity"><ol className="space-y-3">{[...(request.events ?? [])].reverse().map((event) => <li key={event.id} className="border-l-2 border-border pl-3"><p className="text-sm font-medium text-text-primary">{pretty(event.eventType)}</p>{event.note && <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{event.note}</p>}<p className="mt-1 text-xs text-text-muted">{new Date(event.createdAt).toLocaleString()}</p></li>)}</ol></Block>
        <Block title="Internal staff note"><button type="button" onClick={() => setComposer('note')} className="text-sm font-semibold text-primary hover:underline">Add a note visible only to staff</button></Block>
      </div>
      <div className="sticky bottom-0 border-t border-border bg-surface/95 p-4 backdrop-blur">
        {composer && <ComposerBox kind={composer} value={text} onChange={setText} onCancel={() => { setComposer(null); setText(''); }} onSubmit={() => composer === 'reassign' ? act('reassign', { to_role: text }) : act(composer, composer === 'reject' ? { note: text } : composer === 'request-info' ? { question: text } : { note: text })} loading={action.isPending} />}
        {!composer && <div className="flex flex-wrap items-center gap-2">
          {canDecide && !request.assignedUserId && <Button variant="secondary" onClick={() => act('claim')}>Claim</Button>}
          {canDecide && <Button onClick={() => act('approve')} loading={action.isPending}>Approve</Button>}
          {canDecide && <Button variant="outline" onClick={() => setComposer('reject')}>Reject</Button>}
          {canDecide && <Button variant="secondary" onClick={() => setComposer('request-info')}>Request info</Button>}
          {request.status === 'needs_info' && <p className="text-sm font-medium text-text-secondary">Waiting for the student’s reply</p>}
          {(can('requests.reassign') || request.assignedUserId === me?.institutionUserId) && <button className="ml-auto text-xs font-semibold text-text-secondary hover:text-primary" onClick={() => setComposer('reassign')}>Reassign</button>}
          {request.assignedUserId && <button className="text-xs font-semibold text-text-secondary hover:text-primary" onClick={() => act('unclaim')}>Unclaim</button>}
        </div>}
        {request.type === 'leave_request' && sessions.length > 0 && !composer && <p className="mt-2 text-xs text-text-muted">Approving marks {sessions.length} session{sessions.length === 1 ? '' : 's'} as Excused.</p>}
      </div>
    </section>
  );
}

function ComposerBox({ kind, value, onChange, onCancel, onSubmit, loading }: { kind: Exclude<Composer, null>; value: string; onChange: (value: string) => void; onCancel: () => void; onSubmit: () => void; loading: boolean }) {
  const min = kind === 'reject' ? 10 : 1;
  return <div className="space-y-2"><label className="text-xs font-semibold text-text-primary">{kind === 'reassign' ? 'Route to role key' : kind === 'request-info' ? 'Question for the student' : kind === 'reject' ? 'Reason for declining' : 'Internal note'}</label><textarea autoFocus value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-surface-elevated p-3 text-sm" />{kind === 'reject' && <p className="text-xs text-text-muted">The student sees this exactly as written. Use at least 10 characters.</p>}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={onSubmit} disabled={value.trim().length < min} loading={loading}>Save</Button></div></div>;
}

function IssuanceView() {
  const { scope } = useScope();
  const client = usePortalClient();
  const data = useIssuance();
  const action = useIssuanceAction();
  const retry = useRetryIssuanceRender();
  const [selected, setSelected] = useState<IssuanceItem | null>(null);
  const [note, setNote] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const items = data.data?.items ?? [];
  const issued = data.data?.issued ?? [];
  useEffect(() => {
    setPreviewUrl(null);
    if (!selected?.vault || selected.render?.status !== 'done') return;
    let live = true;
    let url: string | null = null;
    void client.fetchFile(`/portal/requests/issuance/${selected.vault.id}/file`, scope).then((blob) => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [client, scope, selected]);
  return <div className="grid min-h-[600px] overflow-hidden rounded-2xl border border-border bg-surface-elevated lg:grid-cols-[360px_1fr]">
    <section className="overflow-y-auto border-r border-border"><header className="border-b border-border p-4"><h1 className="font-semibold">Issuance desk</h1><p className="text-xs text-text-muted">Generated documents awaiting sign-off</p></header>{data.isLoading && <Skeleton className="m-4 h-28" />}{items.length === 0 && !data.isLoading && <p className="p-6 text-center text-sm text-text-muted">No documents awaiting sign-off.</p>}{items.map((item) => <button key={item.vault?.id ?? item.render?.id ?? item.request.id} onClick={() => { setSelected(item); setNote(''); }} className={`w-full border-b border-border p-4 text-left hover:bg-primary-soft ${item.render?.status === 'failed' ? 'border-l-4 border-l-danger' : ''}`}><p className="font-semibold">{item.studentName}</p><p className="text-sm text-primary">{item.vault?.title ?? item.request.summary}</p><p className="mt-1 font-mono text-xs text-text-muted">{item.request.humanCode}</p>{item.render?.status === 'failed' && <Badge tone="danger" className="mt-2">Generation failed</Badge>}</button>)}<header className="border-y border-border bg-background-secondary p-4"><h2 className="text-sm font-semibold">Issued documents</h2><p className="text-xs text-text-muted">Delivered and revoked records</p></header>{issued.length === 0 && !data.isLoading && <p className="p-6 text-center text-sm text-text-muted">No issued documents yet.</p>}{issued.map((item) => <button key={item.vault!.id} onClick={() => { setSelected(item); setNote(''); }} className="w-full border-b border-border p-4 text-left hover:bg-primary-soft"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{item.studentName}</p>{item.vault?.revokedAt && <Badge tone="neutral">Revoked</Badge>}</div><p className="text-sm text-primary">{item.vault?.title}</p><p className="mt-1 font-mono text-xs text-text-muted">{item.request.humanCode}</p></button>)}</section>
    {selected ? <section className="flex min-w-0 flex-col">{selected.render?.status === 'failed' ? <div className="m-5 rounded-xl border border-danger/30 bg-danger-soft p-5"><h2 className="font-semibold text-danger">Generation failed</h2><p className="mt-2 text-sm text-text-secondary">{selected.render.errorDetail ?? 'The document could not be generated.'}</p><Button className="mt-4" loading={retry.isPending} onClick={() => selected.render && retry.mutate(selected.render.id)}>Retry</Button><a href="/settings/documents" className="ml-3 text-sm font-semibold text-primary underline">Edit template</a></div> : selected.vault ? <><div className="flex-1 p-5">{previewUrl ? <iframe title={selected.vault.title} src={previewUrl} className="h-[520px] w-full rounded-xl border border-border" /> : <Skeleton className="h-[520px] w-full" />}</div><div className="border-t border-border p-4">{selected.request.status === 'fulfilled' ? <>{selected.vault.revokedAt ? <p className="rounded-lg bg-background-secondary p-3 text-sm text-text-secondary">This document is revoked.</p> : <><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for revocation" className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm" /><Button variant="outline" disabled={note.trim().length < 3} loading={action.isPending} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'revoke', body: { reason: note } }, { onSuccess: () => setSelected(null) })}>Revoke document</Button></>}</> : <><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required only when sending back (≥10 chars)" className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm" /><div className="flex gap-2"><Button loading={action.isPending} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'deliver' })}><FileCheck2 className="h-4 w-4" />Sign & deliver</Button><Button variant="outline" disabled={note.trim().length < 10} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'send-back', body: { note } })}>Send back</Button></div></>}</div></> : <div className="grid flex-1 place-items-center text-sm text-text-muted">Document generation in progress.</div>}</section> : <div className="grid place-items-center text-sm text-text-muted">Select a document to inspect</div>}
  </div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3><div className="rounded-xl border border-border bg-surface p-4">{children}</div></section>; }
function Status({ status }: { status: string }) { const tone = status === 'fulfilled' || status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'needs_info' ? 'warning' : 'primary'; return <Badge tone={tone}>{pretty(status)}</Badge>; }
function pretty(value: string) { return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function renderValue(value: unknown) { return Array.isArray(value) ? `${value.length} item(s)` : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'); }
function age(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); return days < 1 ? 'Today' : `${days}d`; }
function studentName(context: Record<string, unknown>) { const student = context.student as { name?: string } | undefined; return student?.name ?? 'Student'; }

function BatchesView() {
  const client = usePortalClient();
  const { scope } = useScope();
  const [kind, setKind] = useState<'hall_ticket' | 'id_card' | 'manual_upload'>('hall_ticket');
  const [batch, setBatch] = useState<{ id: string; status: string; version: number; counts?: { total: number; failed: number; delivered: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBatch() {
    setBusy(true);
    setError(null);
    try {
      const created = await client.post<{ id: string; status: string; version: number; counts: { total: number; failed: number; delivered: number } }>(
        '/portal/document-batches',
        scope,
        { kind, scope: {} },
      );
      setBatch(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create batch');
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!batch) return;
    setBusy(true);
    try {
      await client.post(`/portal/document-batches/${batch.id}/preview`, scope, { version: batch.version });
      const fresh = await client.get<typeof batch>(`/portal/document-batches/${batch.id}`, scope);
      setBatch(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!batch) return;
    setBusy(true);
    try {
      const updated = await client.post<typeof batch>(`/portal/document-batches/${batch.id}/generate`, scope, {
        version: batch.version,
        acknowledgePreview: true,
      });
      setBatch(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <h1 className="font-semibold">Document batches</h1>
      <p className="mt-1 text-sm text-text-muted">Hall tickets, ID cards, and manual uploads fan out through the shared render queue.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="hall_ticket">Hall tickets</option>
          <option value="id_card">ID cards</option>
          <option value="manual_upload">Manual upload</option>
        </select>
        <Button loading={busy} onClick={() => void createBatch()}>New draft batch</Button>
        {batch && (
          <>
            <Button variant="outline" loading={busy} onClick={() => void preview()}>Preview 3 samples</Button>
            <Button loading={busy} onClick={() => void generate()}>Generate</Button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {batch && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm">
          <p><span className="text-text-muted">Batch</span> <span className="font-mono">{batch.id}</span></p>
          <p className="mt-1">Status: <Badge tone="primary">{batch.status}</Badge></p>
          {batch.counts && (
            <p className="mt-1 text-text-secondary">
              {batch.counts.total} total · {batch.counts.delivered} delivered · {batch.counts.failed} failed
            </p>
          )}
          <p className="mt-3 text-xs text-text-muted">
            Revoked PDF watermark applies to future downloads only — already-saved copies cannot be recalled.
          </p>
        </div>
      )}
    </section>
  );
}
