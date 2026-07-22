'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Copy, LoaderCircle, Paperclip, X } from 'lucide-react';
import { documentRequestPayloadSchema, leaveRequestPayloadSchema } from '@edrion/schemas';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { StudentClientError, useStudentClient } from '@/lib/student-client';
import { usePersona } from '@/lib/persona';
import {
  type DocumentCatalogItem,
  type RequestAttachment,
  type StudentRequest,
  useLeavePreview,
  useRequestTypes,
  useRequestUpload,
  useStudentRequest,
  useStudentRequestAction,
  useStudentRequests,
  useSubmitRequest,
} from '@/lib/requests';

export default function RequestsPage() {
  const search = useSearchParams();
  const list = useStudentRequests();
  const types = useRequestTypes();
  const [category, setCategory] = useState('all');
  const [sheet, setSheet] = useState<{ typeKey: string; initialPayload?: Record<string, unknown> } | null>(null);
  const [selected, setSelected] = useState<string | null>(search.get('request'));
  const openedFromQuery = useRef(false);

  useEffect(() => {
    const next = search.get('new');
    if (!openedFromQuery.current && (next === 'leave_request' || next === 'document_request')) {
      openedFromQuery.current = true;
      setSheet({ typeKey: next });
    }
  }, [search]);

  const items = list.data?.value.items ?? [];
  const filtered = category === 'all' ? items : items.filter((item) => item.category === category);
  const categories = ['all', ...new Set(items.map((item) => item.category))];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>YOU</Eyebrow>} title="My Requests" />
      <div className="mt-5 flex flex-wrap gap-2">
        {(types.data?.types ?? []).filter((type) => type.enabled).map((type) => (
          <button key={type.key} type="button" onClick={() => setSheet({ typeKey: type.key })} className="rounded-full bg-st-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-st-accentDeep">
            {type.key === 'leave_request' ? 'Apply for leave' : 'Request a document'}
          </button>
        ))}
      </div>

      {list.data?.cachedAt && <div className="mt-5 rounded-[12px] border border-st-amber/30 bg-st-amberSoft px-4 py-3 text-sm text-st-ink">You’re offline. Last updated {relativeTime(list.data.cachedAt)}.</div>}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <PillChip key={item} variant={category === item ? 'primary' : 'default'} onClick={() => setCategory(item)}>{item === 'all' ? 'All' : title(item)}</PillChip>)}</div>
      {list.isLoading ? <div className="mt-5 space-y-3"><div className="h-28 shimmer rounded-[15px]" /><div className="h-28 shimmer rounded-[15px]" /></div> : list.isError ? <p role="alert" className="mt-6 rounded-[12px] border border-st-danger/30 bg-st-dangerSoft p-4 text-sm text-st-danger">Couldn’t load your requests. Try again when you’re connected.</p> : filtered.length === 0 ? <EmptyState className="mt-8" eyebrow="NO REQUESTS" title="Nothing here yet" description="Requests you make — leave, certificates, and more — will be tracked here." /> : <div className="mt-5 space-y-3">{filtered.map((item) => <RequestCard key={item.id} request={item} onClick={() => setSelected(item.id)} />)}</div>}

      {sheet && <RequestSheet typeKey={sheet.typeKey} initialPayload={sheet.initialPayload} catalog={types.data?.documentCatalog ?? []} onClose={() => setSheet(null)} onTrack={(id) => { setSheet(null); setSelected(id); }} />}
      {selected && <TrackerSheet id={selected} onClose={() => setSelected(null)} onResubmit={(typeKey, initialPayload) => { setSelected(null); setSheet({ typeKey, initialPayload }); }} />}
    </div>
  );
}

function RequestCard({ request, onClick }: { request: StudentRequest; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full rounded-[15px] border border-st-bd1 bg-st-card p-4 text-left shadow-sm transition hover:border-st-accent/40"><div className="flex items-start justify-between gap-3"><div><p className="font-display font-semibold text-st-ink">{request.typeLabel}</p><p className="mt-0.5 font-mono-ui text-xs text-st-faint">{request.humanCode}</p></div><StudentStatus status={request.displayStatus ?? request.status} /></div><p className="mt-3 truncate text-sm text-st-muted">{request.summary}</p><p className="mt-2 text-xs text-st-faint">Submitted {new Date(request.submittedAt).toLocaleDateString()}</p></button>;
}

function RequestSheet({ typeKey, initialPayload, catalog, onClose, onTrack }: { typeKey: string; initialPayload?: Record<string, unknown>; catalog: DocumentCatalogItem[]; onClose: () => void; onTrack: (id: string) => void }) {
  const submit = useSubmitRequest();
  const upload = useRequestUpload();
  const [payload, setPayload] = useState<Record<string, unknown>>(() => requestFormPayload(typeKey, initialPayload));
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState<StudentRequest | null>(null);
  const [offlinePending, setOfflinePending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const updatePayload: React.Dispatch<React.SetStateAction<Record<string, unknown>>> = (value) => {
    setDirty(true);
    setPayload(value);
  };
  const schema = typeKey === 'leave_request' ? leaveRequestPayloadSchema : documentRequestPayloadSchema;
  const parsed = schema.safeParse(payload);
  const valid = parsed.success && (typeKey !== 'document_request' || Boolean(payload.doc_type));
  const fieldErrors: Record<string, string[] | undefined> = parsed.success
    ? {}
    : parsed.error.flatten().fieldErrors;
  const errorFor = (field: string) => touched.has(field) ? fieldErrors[field]?.[0] : undefined;
  const touch = (field: string) => setTouched((current) => new Set(current).add(field));
  const preview = useLeavePreview(String(payload.start_date ?? ''), String(payload.end_date ?? ''));

  function close() { if (dirty && !submitted && !window.confirm('Discard this request?')) return; onClose(); }
  async function send() {
    try {
      const result = await submit.mutateAsync({ body: { type: typeKey, payload, attachments }, idempotencyKey });
      setSubmitted(result); setOfflinePending(false);
    } catch (error) {
      if (!navigator.onLine) setOfflinePending(true);
    }
  }
  useEffect(() => {
    if (!offlinePending) return;
    const retry = () => void send();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  async function files(files: FileList | null) {
    if (!files) return;
    const incoming = [...files];
    if (attachments.length + incoming.length > 5) {
      setFileError('Max 5 files, 10 MB each.');
      return;
    }
    if (incoming.some((file) => file.size > 10 * 1024 * 1024)) {
      setFileError('Each file must be 10 MB or smaller.');
      return;
    }
    if (incoming.some((file) => !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))) {
      setFileError('Use JPG, PNG, or PDF files.');
      return;
    }
    setFileError(null);
    setDirty(true);
    for (const file of incoming) {
      const uploaded = await upload.mutateAsync(file);
      setAttachments((current) => [...current, uploaded]);
    }
  }

  return <Sheet title={typeKey === 'leave_request' ? 'Leave request' : 'Document request'} onClose={close} footer={!submitted ? <button type="button" disabled={!valid || submit.isPending || upload.isPending} onClick={send} className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-st-accent px-5 font-semibold text-white disabled:opacity-50">{submit.isPending && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}{submit.isPending ? 'Submitting…' : 'Submit request'}</button> : undefined}>
    {submitted ? <Confirmation request={submitted} onTrack={() => onTrack(submitted.id)} onDone={onClose} /> : <div className="space-y-5">
      {submit.isError && <div role="alert" className="rounded-[12px] border border-st-danger/30 bg-st-dangerSoft p-3 text-sm text-st-danger"><p className="font-semibold">Couldn’t submit — {offlinePending ? 'you’re offline — we’ll retry when you’re back' : errorMessage(submit.error)}.</p><p>Your answers are safe.</p>{!offlinePending && <button className="mt-2 font-semibold underline" onClick={send}>Retry</button>}</div>}
      {typeKey === 'leave_request' ? <LeaveFields payload={payload} setPayload={updatePayload} preview={preview.data} errorFor={errorFor} touch={touch} /> : <DocumentFields payload={payload} setPayload={updatePayload} catalog={catalog} errorFor={errorFor} touch={touch} />}
      <div><p className="text-sm font-semibold text-st-ink">Attachments</p>{payload.reason === 'medical' && typeKey === 'leave_request' && <p className="mt-1 text-xs text-st-muted">Attach a medical certificate if you have one.</p>}<label className="mt-2 flex cursor-pointer flex-col items-center rounded-[12px] border border-dashed border-st-bd2 p-5 text-center text-sm text-st-muted hover:border-st-accent"><Paperclip className="mb-2 h-5 w-5" />Add files or photos<input className="sr-only" type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={(e) => void files(e.target.files)} /></label><p className="mt-1 text-xs text-st-faint">Max 5 files, 10 MB each.</p>{fileError && <p role="alert" className="mt-1 text-xs font-medium text-st-danger">{fileError}</p>}{attachments.map((file) => <div key={file.storage_object_id} className="mt-2 flex items-center gap-2 rounded-lg bg-st-page px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{file.filename}</span><span className="text-xs text-st-faint">{formatBytes(file.bytes)}</span><button aria-label={`Remove ${file.filename}`} onClick={() => setAttachments((items) => items.filter((item) => item.storage_object_id !== file.storage_object_id))}><X className="h-4 w-4" /></button></div>)}</div>
    </div>}
  </Sheet>;
}

function LeaveFields({ payload, setPayload, preview, errorFor, touch }: { payload: Record<string, unknown>; setPayload: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; preview?: { sessionCount: number; subjectCount: number }; errorFor: (field: string) => string | undefined; touch: (field: string) => void }) {
  return <><Field label="Start date •" error={errorFor('start_date')}><input aria-invalid={Boolean(errorFor('start_date'))} type="date" value={String(payload.start_date)} onBlur={() => touch('start_date')} onChange={(e) => setPayload((p) => ({ ...p, start_date: e.target.value }))} /></Field><Field label="End date •" error={errorFor('end_date')}><input aria-invalid={Boolean(errorFor('end_date'))} type="date" value={String(payload.end_date)} onBlur={() => touch('end_date')} onChange={(e) => setPayload((p) => ({ ...p, end_date: e.target.value }))} /></Field>{payload.start_date && payload.end_date && <p className={`rounded-[10px] px-3 py-2 text-sm ${preview?.sessionCount ? 'bg-st-accentSoft text-st-accentDeep' : 'bg-st-amberSoft text-st-ink'}`}>{preview?.sessionCount ? `This covers ${preview.sessionCount} sessions across ${preview.subjectCount} subjects.` : 'No classes in this range — submit anyway?'}</p>}<Field label="Reason •" error={errorFor('reason')}><select aria-invalid={Boolean(errorFor('reason'))} value={String(payload.reason)} onBlur={() => touch('reason')} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))}><option value="medical">Medical</option><option value="family">Family</option><option value="event">Event</option><option value="other">Other</option></select></Field><Field label={payload.reason === 'other' ? 'Tell us why •' : 'More detail'} error={errorFor('reason_text')}><textarea aria-invalid={Boolean(errorFor('reason_text'))} rows={4} value={String(payload.reason_text)} onBlur={() => touch('reason_text')} onChange={(e) => setPayload((p) => ({ ...p, reason_text: e.target.value }))} placeholder="At least 10 characters when provided" /></Field></>;
}

function DocumentFields({ payload, setPayload, catalog, errorFor, touch }: { payload: Record<string, unknown>; setPayload: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; catalog: DocumentCatalogItem[]; errorFor: (field: string) => string | undefined; touch: (field: string) => void }) {
  const selected = String(payload.doc_type ?? '');
  const entry = catalog.find((item) => item.docType === selected);
  const modes = entry?.deliveryModes ?? ['digital'];
  return <><div onBlur={() => touch('doc_type')}><p className="mb-2 text-sm font-semibold text-st-ink">Document type •</p><div className="grid gap-2 sm:grid-cols-2">{catalog.map((item) => <button key={item.subtypeKey} type="button" disabled={!item.enabled} onClick={() => setPayload((p) => ({ ...p, doc_type: item.docType, subtypeKey: item.subtypeKey }))} className={`rounded-[12px] border p-3 text-left ${selected === item.docType ? 'border-st-accent bg-st-accentSoft' : 'border-st-bd1 bg-st-card'} disabled:opacity-50`}><p className="font-semibold capitalize">{item.name}</p>{item.requiresPayment && <p className="mt-1 text-xs text-st-muted">Fee: ₹{(item.feeAmountMinor / 100).toFixed(2)}</p>}{!item.enabled && <p className="mt-1 text-xs text-st-danger">{item.reason}</p>}</button>)}</div>{errorFor('doc_type') && <p role="alert" className="mt-1.5 text-xs font-medium text-st-danger">Choose a document type</p>}</div>{modes.length > 1 && <Field label="Delivery •" error={errorFor('deliveryMode')}><select aria-invalid={Boolean(errorFor('deliveryMode'))} value={String(payload.deliveryMode ?? 'digital')} onBlur={() => touch('deliveryMode')} onChange={(e) => setPayload((p) => ({ ...p, deliveryMode: e.target.value }))}><option value="digital">Digital download</option><option value="physical_pickup">Physical pickup</option></select></Field>}{selected === 'bonafide' && <><Field label="Purpose •" error={errorFor('purpose')}><select aria-invalid={Boolean(errorFor('purpose'))} value={String(payload.purpose)} onBlur={() => touch('purpose')} onChange={(e) => setPayload((p) => ({ ...p, purpose: e.target.value }))}><option value="bank_loan">Bank loan</option><option value="visa">Visa</option><option value="passport">Passport</option><option value="scholarship">Scholarship</option><option value="other">Other</option></select></Field>{payload.purpose === 'other' && <Field label="Purpose detail •" error={errorFor('purpose_text')}><input aria-invalid={Boolean(errorFor('purpose_text'))} value={String(payload.purpose_text)} onBlur={() => touch('purpose_text')} onChange={(e) => setPayload((p) => ({ ...p, purpose_text: e.target.value }))} /></Field>}</>}{selected === 'transcript' && <Field label="Copies •" error={errorFor('copies')}><input aria-invalid={Boolean(errorFor('copies'))} type="number" min={1} max={5} value={Number(payload.copies)} onBlur={() => touch('copies')} onChange={(e) => setPayload((p) => ({ ...p, copies: Number(e.target.value) }))} /></Field>}</>;
}

function TrackerSheet({ id, onClose, onResubmit }: { id: string; onClose: () => void; onResubmit: (type: string, payload?: Record<string, unknown>) => void }) {
  const detail = useStudentRequest(id);
  const action = useStudentRequestAction(id);
  const client = useStudentClient();
  const { me } = usePersona();
  const { say } = useToast();
  const [reply, setReply] = useState('');
  const request = detail.data?.value;
  async function cancel() { if (!request || !window.confirm("Cancel this request? This can't be undone.")) return; try { await action.mutateAsync({ action: 'cancel', body: { version: request.version } }); onClose(); } catch (error) { say(errorMessage(error)); await detail.refetch(); } }
  async function sendReply() { if (!request || !reply.trim()) return; try { await action.mutateAsync({ action: 'reply', body: { version: request.version, text: reply, attachments: [] } }); setReply(''); say('Reply sent — back in review.'); await detail.refetch(); } catch (error) { say(errorMessage(error)); } }
  return <Sheet title={request ? `${request.typeLabel} · ${request.humanCode}` : 'Request'} onClose={onClose}>{detail.isLoading || !request ? <div className="space-y-3"><div className="h-12 shimmer rounded-xl" /><div className="h-28 shimmer rounded-xl" /><div className="h-20 shimmer rounded-xl" /></div> : <div className="space-y-6">{detail.data?.cachedAt && <div className="rounded-[10px] bg-st-amberSoft p-3 text-sm">Last updated {relativeTime(detail.data.cachedAt)}.</div>}<div><p className="text-xs text-st-faint">Submitted {new Date(request.submittedAt).toLocaleString()}</p><Stepper request={request} /></div>{request.status === 'needs_info' && <Card className="border-st-amber/40 bg-st-amberSoft"><blockquote className="text-sm text-st-ink">“{request.needsInfoQuestion}”</blockquote><textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write your reply" className="mt-3 w-full rounded-[10px] border border-st-bd2 bg-st-card p-3 text-sm" /><button disabled={!reply.trim() || action.isPending} onClick={sendReply} className="mt-2 rounded-full bg-st-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send reply</button></Card>}{request.status === 'rejected' && <Card className="border-st-danger/30"><p className="font-semibold text-st-danger">Declined</p><blockquote className="mt-2 text-sm">“{request.decisionNote}”</blockquote><button onClick={() => onResubmit(request.type, request.payload)} className="mt-3 text-sm font-semibold text-st-accentDeep underline">Fix and resubmit</button></Card>}{request.status === 'expired' && <Card><p className="font-semibold">Closed — no reply</p><p className="mt-1 text-sm text-st-muted">No reply was received within 14 days.</p><button onClick={() => onResubmit(request.type)} className="mt-3 text-sm font-semibold text-st-accentDeep underline">Start a new request</button></Card>}{request.status === 'fulfilled' && <Card className="border-st-success/30 bg-st-successSoft"><p className="font-semibold text-st-success">{request.type === 'leave_request' ? `Approved — ${Array.isArray(request.payload.notify_sessions) ? request.payload.notify_sessions.length : 0} sessions excused ✓` : 'Your document is ready'}</p>{request.type === 'leave_request' && <a href={me?.persona === 'college' ? '/courses' : '/classes'} className="mt-3 inline-block text-sm font-semibold text-st-accentDeep underline">View attendance</a>}{request.type === 'document_request' && request.fulfilmentDocumentId && <a target="_blank" href={client.resourceUrl(`/requests/documents/${request.fulfilmentDocumentId}/file`)} className="mt-3 inline-block text-sm font-semibold text-st-accentDeep underline">Download document</a>}</Card>}{request.canCancel && <button onClick={cancel} disabled={action.isPending} className="text-sm font-semibold text-st-danger hover:underline">Cancel request</button>}<section><h3 className="text-xs font-semibold uppercase tracking-wide text-st-faint">Activity</h3><ol className="mt-3 space-y-3">{[...(request.events ?? [])].reverse().map((event) => <li key={event.id} className="border-l-2 border-st-bd2 pl-3"><p className="text-sm font-medium">{eventText(event.eventType)}</p>{event.actorName && event.actorKind === 'staff' && <p className="text-xs text-st-faint">By {title(event.actorName)}</p>}{event.note && <p className="mt-1 whitespace-pre-wrap text-sm text-st-muted">{event.note}</p>}<p className="mt-1 text-xs text-st-faint">{new Date(event.createdAt).toLocaleString()}</p></li>)}</ol></section></div>}</Sheet>;
}

function Stepper({ request }: { request: StudentRequest }) {
  const success = request.type === 'document_request' ? ['Submitted', 'In review', 'Signed', 'Ready'] : ['Submitted', 'In review', 'Done'];
  const status = request.displayStatus ?? request.status;
  const index = status === 'submitted' ? 0 : status === 'in_review' || status === 'needs_info' ? 1 : status === 'approved' ? Math.min(2, success.length - 1) : success.length - 1;
  if (['rejected', 'cancelled', 'expired'].includes(request.status)) success.splice(index + 1, success.length, request.status === 'rejected' ? 'Declined' : request.status === 'cancelled' ? 'Cancelled by you' : 'Closed — no reply');
  return <div className="mt-5 flex items-start">{success.map((step, i) => <div key={step} className="flex min-w-0 flex-1 items-start"><div className="flex min-w-0 flex-1 flex-col items-center text-center"><span className={`grid h-7 w-7 place-items-center rounded-full border-2 ${i < index || (i === index && request.status === 'fulfilled') ? 'border-st-success bg-st-success text-white' : i === index ? request.status === 'needs_info' ? 'border-st-amber bg-st-amberSoft text-st-ink motion-safe:animate-pulse' : 'border-st-accent bg-st-accentSoft text-st-accentDeep motion-safe:animate-pulse' : 'border-st-bd2 bg-st-card text-st-faint'}`}>{i < index ? <Check className="h-4 w-4" /> : i + 1}</span><span className="mt-2 text-[11px] font-medium text-st-muted">{step}</span></div>{i < success.length - 1 && <span className={`mt-3 h-0.5 w-full ${i < index ? 'bg-st-success' : 'bg-st-bd2'}`} />}</div>)}</div>;
}

function Confirmation({ request, onTrack, onDone }: { request: StudentRequest; onTrack: () => void; onDone: () => void }) { const { say } = useToast(); const days = request.expectedWorkingDays ?? workingDays(request.slaDueAt); return <div className="grid min-h-[360px] place-items-center text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-st-successSoft text-st-success"><Check className="h-8 w-8" /></span><h3 className="mt-5 font-display text-2xl font-semibold">Request submitted</h3><button onClick={() => { void navigator.clipboard.writeText(request.humanCode); say('Code copied'); }} className="mx-auto mt-3 flex items-center gap-2 rounded-full bg-st-page px-4 py-2 font-mono-ui text-sm"><Copy className="h-4 w-4" />{request.humanCode}</button><p className="mt-4 text-sm text-st-muted">{request.expectationSource === 'median' ? `Usually ${days} working days at your institution.` : `Usually up to ${days} working days at your institution.`}</p><button onClick={onTrack} className="mt-6 w-full rounded-[12px] bg-st-accent px-5 py-3 font-semibold text-white">Track this</button><button onClick={onDone} className="mt-2 w-full px-5 py-2 text-sm font-semibold text-st-muted">Done</button></div></div>; }
function Sheet({ title: heading, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex justify-end"><button aria-label="Close sheet" className="absolute inset-0 bg-black/40" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={heading} className="relative flex h-full w-full flex-col bg-st-card shadow-xl sm:max-w-[420px]"><header className="flex items-center justify-between border-b border-st-bd1 px-5 py-4"><h2 className="font-display text-lg font-semibold">{heading}</h2><button aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button></header><div className="flex-1 overflow-y-auto p-5">{children}</div>{footer && <footer className="border-t border-st-bd1 bg-st-card p-4">{footer}</footer>}</section></div>; }
function Field({ label, children, error }: { label: string; children: React.ReactElement; error?: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-st-ink">{label}</span><span className="[&>input]:h-11 [&>input]:w-full [&>input]:rounded-[10px] [&>input]:border [&>input]:border-st-bd2 [&>input]:bg-st-card [&>input]:px-3 [&>select]:h-11 [&>select]:w-full [&>select]:rounded-[10px] [&>select]:border [&>select]:border-st-bd2 [&>select]:bg-st-card [&>select]:px-3 [&>textarea]:w-full [&>textarea]:rounded-[10px] [&>textarea]:border [&>textarea]:border-st-bd2 [&>textarea]:bg-st-card [&>textarea]:p-3 [&>[aria-invalid=true]]:border-st-danger">{children}</span>{error && <span role="alert" className="mt-1.5 block text-xs font-medium text-st-danger">{error}</span>}</label>; }
function StudentStatus({ status }: { status: string }) { const klass = status === 'fulfilled' || status === 'approved' ? 'bg-st-successSoft text-st-success' : status === 'rejected' ? 'bg-st-dangerSoft text-st-danger' : status === 'needs_info' ? 'bg-st-amberSoft text-st-ink' : 'bg-st-accentSoft text-st-accentDeep'; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${klass}`}>{title(status)}</span>; }
function title(value: string) { return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function eventText(value: string) { const copy: Record<string, string> = { created: 'Request created', submitted: 'Your request was submitted', claimed: 'Review started', info_requested: 'More information requested', info_provided: 'Your reply was received', approved: 'Request approved', fulfilled: 'Request completed', rejected: 'Request declined', cancelled: 'You cancelled this request', expired: 'Request closed' }; return copy[value] ?? title(value); }
function errorMessage(error: unknown) { return error instanceof StudentClientError ? error.message : error instanceof Error ? error.message : 'please try again'; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function relativeTime(at: number) { const minutes = Math.max(1, Math.round((Date.now() - at) / 60_000)); return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`; }
function workingDays(due: string | null) { return due ? Math.max(1, Math.round((new Date(due).getTime() - Date.now()) / 86_400_000)) : 3; }
function requestFormPayload(typeKey: string, previous?: Record<string, unknown>): Record<string, unknown> {
  const base = typeKey === 'leave_request'
    ? { start_date: '', end_date: '', scope: 'full_day', reason: 'medical', reason_text: '', notify_sessions: [] }
    : { doc_type: '', purpose: 'bank_loan', purpose_text: '', copies: 1, delivery: 'digital' };
  if (!previous) return base;
  const { notify_sessions: _sessions, info_replies: _replies, ...safe } = previous;
  return { ...base, ...safe };
}
