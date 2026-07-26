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
import { RequestContextPanel } from '@/components/approvals/request-context';
import { ReleaseConfirmDrawer } from '@/components/gradebook/release-confirm-drawer';
import {
  type MarkReleaseBatch,
  useMarkReleaseMutations,
  usePendingReleaseApprovals,
} from '@/lib/mark-release';
import {
  type TermRecomputeRow,
  useTermRecomputeMutations,
  useTermRecomputeRequests,
} from '@/lib/grading';
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
  const canReview = can('requests.review');
  const canApproveReleases = can('gradebook.approve_release');
  const canRecomputeApproval = can('results.recompute_approval');
  const [tab, setTab] = useState<'inbox' | 'issuance' | 'releases' | 'recompute'>(
    canReview ? 'inbox' : canApproveReleases ? 'releases' : 'recompute',
  );

  if (!canReview && !canApproveReleases && !canRecomputeApproval) {
    return <><Topbar title="Approvals" /><div className="p-6"><PermissionDenied description="You don’t have permission to review approvals." /></div></>;
  }

  return (
    <>
      <Topbar title="Approvals" />
      <div className="page-enter flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        <div className="mb-4 flex items-center gap-2">
          {canReview ? <Tab active={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox</Tab> : null}
          {canReview && can('documents.issue') ? <Tab active={tab === 'issuance'} onClick={() => setTab('issuance')}>Issuance</Tab> : null}
          {canApproveReleases ? <Tab active={tab === 'releases'} onClick={() => setTab('releases')}>Mark releases</Tab> : null}
          {canRecomputeApproval ? <Tab active={tab === 'recompute'} onClick={() => setTab('recompute')}>Term recompute</Tab> : null}
        </div>
        {tab === 'inbox' && canReview ? <InboxView initialRequestId={search.get('request')} /> : null}
        {tab === 'issuance' && canReview ? <IssuanceView /> : null}
        {tab === 'releases' && canApproveReleases ? <ReleaseApprovalsView /> : null}
        {tab === 'recompute' && canRecomputeApproval ? <TermRecomputeApprovalsView /> : null}
      </div>
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-secondary hover:bg-primary-soft'}`}>{children}</button>;
}

export function RequestsInboxView({
  lockType,
  heading = 'Requests inbox',
  initialRequestId,
}: {
  lockType?: string;
  heading?: string;
  initialRequestId: string | null;
}) {
  return <InboxView initialRequestId={initialRequestId} lockType={lockType} heading={heading} />;
}

function InboxView({
  initialRequestId,
  lockType,
  heading = 'Requests inbox',
}: {
  initialRequestId: string | null;
  lockType?: string;
  heading?: string;
}) {
  const search = useSearchParams();
  const urlType = lockType ?? search.get('type') ?? '';
  const [filters, setFilters] = useState({ status: '', type: urlType, sla: false, mine: false });

  useEffect(() => {
    const nextType = lockType ?? search.get('type') ?? '';
    setFilters((f) => (f.type === nextType ? f : { ...f, type: nextType }));
  }, [lockType, search]);

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
          <div className="flex items-center justify-between"><h1 className="font-semibold text-text-primary">{heading}</h1><Badge tone="primary">{items.length} pending</Badge></div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm">
              <option value="">Pending</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="needs_info">Needs info</option>
            </select>
            {!lockType ? (
            <select aria-label="Type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm">
              <option value="">All types</option><option value="leave_request">Leave request</option><option value="od_request">On-duty request</option><option value="attendance_correction">Attendance correction</option><option value="document_request">Document request</option><option value="grievance">Formal grievance</option>
            </select>
            ) : (
              <p className="flex h-9 items-center rounded-lg border border-border bg-background-secondary px-2 text-xs text-text-secondary">Type: formal grievance</p>
            )}
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
  const [acceptedIds, setAcceptedIds] = useState<string[]>([]);
  const request = detail.data;
  const canDecide = request?.status === 'submitted' || request?.status === 'in_review';

  useEffect(() => {
    if (!request || request.type !== 'attendance_correction') {
      setAcceptedIds([]);
      return;
    }
    const sessions = Array.isArray(request.context?.sessions) ? request.context.sessions : [];
    setAcceptedIds(sessions.map((session) => String((session as Record<string, unknown>).session_id)));
  }, [request?.id, request?.type, request?.context]);

  async function act(name: string, body: Record<string, unknown> = {}) {
    if (!request) return;
    try {
      const payload =
        name === 'approve' && request.type === 'attendance_correction'
          ? { version: request.version, accepted_session_ids: acceptedIds, ...body }
          : { version: request.version, ...body };
      await action.mutateAsync({ id: request.id, action: name, body: payload });
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

  const payload = Object.entries(request.payload).filter(([key]) => key !== 'notify_sessions' && key !== 'info_replies' && key !== 'sessions_snapshot' && key !== 'record_refs');
  const error = action.error ? formatPortalError(action.error) : null;

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col bg-surface-elevated">
      <div className="flex-1 space-y-6 overflow-y-auto p-5 pb-32 lg:p-6">
        <header><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-text-primary">{request.typeLabel}</h2><Status status={request.status} />{request.slaBreached && <Badge tone="danger">Past expected time</Badge>}<button type="button" onClick={() => setShortcuts(true)} className="ml-auto grid h-8 w-8 place-items-center rounded-full border border-border text-sm font-bold text-text-muted" aria-label="Keyboard shortcuts">?</button></div><p className="mt-1 font-mono text-sm text-text-muted">{request.humanCode} · {request.context && studentName(request.context)}</p></header>
        {shortcuts && <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm"><div className="flex items-center justify-between"><p className="font-semibold">Keyboard shortcuts</p><button onClick={() => setShortcuts(false)} aria-label="Close shortcuts">×</button></div><p className="mt-2 text-text-secondary"><kbd>j/k</kbd> navigate · <kbd>c</kbd> claim · <kbd>a</kbd> approve · <kbd>r</kbd> reject · <kbd>i</kbd> request info</p><p className="mt-1 text-xs text-text-muted">Bulk selection is unavailable for the request types in this release.</p></div>}
        {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error} The request was refreshed.</p>}
        <Block title="Request"><dl className="grid gap-3 sm:grid-cols-2">{payload.map(([key, value]) => <div key={key}><dt className="text-xs capitalize text-text-muted">{pretty(key)}</dt><dd className="mt-1 text-sm text-text-primary">{renderValue(value)}</dd></div>)}</dl>{request.attachments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{request.attachments.map((file) => <button type="button" key={file.storage_object_id} onClick={() => void openAttachment(file.storage_object_id)}><Badge tone="neutral"><Paperclip className="h-3 w-3" />{file.filename}</Badge></button>)}</div>}</Block>
        <Block title="Context snapshot">
          <RequestContextPanel
            request={request}
            canDecide={canDecide}
            acceptedIds={acceptedIds}
            onToggleSession={(sessionId, checked) =>
              setAcceptedIds((ids) => (checked ? [...new Set([...ids, sessionId])] : ids.filter((id) => id !== sessionId)))
            }
          />
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
    {selected ? <section className="flex min-w-0 flex-col">{selected.render?.status === 'failed' ? <div className="m-5 rounded-xl border border-danger/30 bg-danger-soft p-5"><h2 className="font-semibold text-danger">Generation failed</h2><p className="mt-2 text-sm text-text-secondary">{selected.render.errorDetail ?? 'The document could not be generated.'}</p><Button className="mt-4" loading={retry.isPending} onClick={() => selected.render && retry.mutate(selected.render.id)}>Retry</Button><a href="/settings/documents" className="ml-3 text-sm font-semibold text-primary underline">Edit template</a></div> : selected.vault ? <><div className="flex-1 p-5">{previewUrl ? <iframe title={selected.vault.title} src={previewUrl} className="h-[520px] w-full rounded-xl border border-border" /> : <Skeleton className="h-[520px] w-full" />}</div><div className="border-t border-border p-4">{selected.request.status === 'fulfilled' ? <>{selected.vault.revokedAt ? <p className="rounded-lg bg-background-secondary p-3 text-sm text-text-secondary">This document is revoked.</p> : <><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for revocation" className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm" /><Button variant="outline" disabled={note.trim().length < 3} loading={action.isPending} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'revoke', body: { reason: note } }, { onSuccess: () => setSelected(null) })}>Revoke document</Button></>}</> : <><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required only when sending back" className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm" /><div className="flex gap-2"><Button loading={action.isPending} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'deliver' })}><FileCheck2 className="h-4 w-4" />Sign & deliver</Button><Button variant="outline" disabled={!note.trim()} onClick={() => action.mutate({ vaultId: selected.vault!.id, action: 'send-back', body: { note } })}>Send back</Button></div></>}</div></> : <div className="grid flex-1 place-items-center text-sm text-text-muted">Document generation in progress.</div>}</section> : <div className="grid place-items-center text-sm text-text-muted">Select a document to inspect</div>}
  </div>;
}

function TermRecomputeApprovalsView() {
  const list = useTermRecomputeRequests('pending_approval');
  const { approve, reject } = useTermRecomputeMutations();
  const [selected, setSelected] = useState<TermRecomputeRow | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = list.data ?? [];

  return (
    <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-border bg-surface-elevated lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="overflow-y-auto border-r border-border">
        <header className="border-b border-border p-4">
          <h1 className="font-semibold">Term recompute requests</h1>
          <Badge tone="warning" className="mt-2">{items.length} pending</Badge>
        </header>
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full border-b border-border p-4 text-left hover:bg-primary-soft ${selected?.id === item.id ? 'bg-primary-soft' : ''}`}>
            <p className="font-semibold">Term {item.termId.slice(0, 8)}…</p>
            <p className="text-sm text-text-muted">Scheme v{item.schemeVersion}</p>
          </button>
        ))}
        {!list.isLoading && items.length === 0 ? <p className="p-6 text-center text-sm text-text-muted">No pending recompute requests.</p> : null}
      </section>
      <section className="p-5">
        {!selected ? <p className="text-sm text-text-muted">Select a request.</p> : (
          <div className="space-y-4">
            <p className="text-sm">{selected.reason}</p>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reject note (optional)" className="w-full rounded-lg border p-3 text-sm" />
            <div className="flex gap-2">
              <Button type="button" onClick={async () => {
                setError(null);
                try {
                  await approve.mutateAsync({ id: selected.id, body: { version: selected.version } });
                  setSelected(null);
                  await list.refetch();
                } catch (err) { setError(formatPortalError(err)); }
              }}>Approve & recompute</Button>
              <Button type="button" variant="outline" onClick={async () => {
                setError(null);
                try {
                  await reject.mutateAsync({ id: selected.id, body: { version: selected.version, note } });
                  setSelected(null);
                  await list.refetch();
                } catch (err) { setError(formatPortalError(err)); }
              }}>Reject</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3><div className="rounded-xl border border-border bg-surface p-4">{children}</div></section>; }

function ReleaseApprovalsView() {
  const list = usePendingReleaseApprovals();
  const { approve, sendBack } = useMarkReleaseMutations();
  const [selected, setSelected] = useState<MarkReleaseBatch | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<MarkReleaseBatch | null>(null);
  const [sendBackNote, setSendBackNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = list.data ?? [];

  return (
    <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-border bg-surface-elevated lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="overflow-y-auto border-r border-border">
        <header className="border-b border-border p-4">
          <h1 className="font-semibold">Pending mark releases</h1>
          <Badge tone="warning" className="mt-2">{items.length} waiting</Badge>
        </header>
        {list.isLoading ? <Skeleton className="m-4 h-24" /> : null}
        {!list.isLoading && items.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-muted">No releases awaiting approval.</p>
        ) : null}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className={`w-full border-b border-border p-4 text-left hover:bg-primary-soft ${selected?.id === item.id ? 'bg-primary-soft' : ''}`}
          >
            <p className="font-semibold">{item.scope.assessment_name ?? 'Exam release'}</p>
            <p className="text-sm text-text-muted">{item.preview.entered} marks · mean {item.preview.mean}</p>
          </button>
        ))}
      </section>
      <section className="p-5">
        {!selected ? (
          <p className="text-sm text-text-muted">Select a batch to review.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p>Entered: <strong>{selected.preview.entered}</strong></p>
              <p>Missing: <strong>{selected.preview.missing}</strong></p>
              <p>Mean: <strong>{selected.preview.mean}</strong></p>
              <p>Range: <strong>{selected.preview.low}–{selected.preview.high}</strong></p>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" onClick={() => setConfirmBatch(selected)}>Review & approve</Button>
            </div>
            <textarea
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              placeholder="Send-back note (min 10 chars)"
              className="w-full rounded-lg border border-border bg-surface p-3 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              disabled={sendBackNote.trim().length < 10}
              onClick={async () => {
                setError(null);
                try {
                  await sendBack.mutateAsync({
                    id: selected.id,
                    body: { version: selected.version, note: sendBackNote.trim() },
                  });
                  setSelected(null);
                  setSendBackNote('');
                  await list.refetch();
                } catch (err) {
                  setError(formatPortalError(err));
                }
              }}
            >
              Send back
            </Button>
          </div>
        )}
        <ReleaseConfirmDrawer
          batch={confirmBatch}
          open={Boolean(confirmBatch)}
          onClose={() => setConfirmBatch(null)}
          mode="approve"
          onConfirm={async (confirmMissing) => {
            if (!confirmBatch) return;
            await approve.mutateAsync({
              id: confirmBatch.id,
              body: { version: confirmBatch.version, confirm_missing: confirmMissing },
            });
            setConfirmBatch(null);
            setSelected(null);
            await list.refetch();
          }}
        />
      </section>
    </div>
  );
}

function Status({ status }: { status: string }) { const tone = status === 'fulfilled' || status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'needs_info' ? 'warning' : 'primary'; return <Badge tone={tone}>{pretty(status)}</Badge>; }
function pretty(value: string) { return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function renderValue(value: unknown) { return Array.isArray(value) ? `${value.length} item(s)` : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'); }
function age(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); return days < 1 ? 'Today' : `${days}d`; }
function studentName(context: Record<string, unknown>) { const student = context.student as { name?: string } | undefined; return student?.name ?? 'Student'; }
