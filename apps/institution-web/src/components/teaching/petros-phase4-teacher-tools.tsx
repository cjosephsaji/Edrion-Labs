'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@edrion/ui';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { useUploadClassMaterial } from '@/lib/course-content';
import { usePortalMe } from '@/lib/hooks';

type Capability = { enabled: boolean };
type CorrectionPreview = {
  id: string;
  materialId: string;
  proposedObjectId: string;
  expectedMaterialVersion: number;
  proposedBy: string;
  reviewedBy: string | null;
  reason: string;
  reviewReason: string | null;
  meaningChanged: boolean;
  status: string;
  version: number;
  preview: {
    affectedLearners?: number;
    affectedSourceRecords?: number;
    affectedPacks?:number;
    affectedLocators?:number;
    affectedSessionRecommendations?:number;
    affectedSourceVersions?: {id:string;fingerprint:string}[];
    evaluationPolicy?:string;
    historicalCitationPolicy?: string;
    privateContentInspected?: boolean;
  };
  publishedMaterialVersion: number | null;
  createdAt: string;
  reviewedAt: string | null;
};
type Intervention = {
  id: string;
  classId: string;
  subjectId: string;
  createdBy: string;
  approvedBy: string | null;
  title: string;
  description: string;
  conceptKey: string;
  status: string;
  deliveryStatus: string;
  version: number;
  expiresAt: string;
  audiencePreview: { candidateCount?: number; suppressed?: boolean; membershipBasis?: string; delivery?: string };
  reason: string;
  createdAt: string;
};
type Signal = {
  id: string;
  classId: string;
  subjectId: string;
  concept: string;
  conceptKey?: string;
  currentSuppressed?: boolean;
  suppressed?: boolean;
  currentThreshold?: number;
  threshold?: number;
  affectedLearnerCount?: number | null;
  evidenceCoveredCount?: number | null;
  independentAttemptCount?: number | null;
  eligibleCount?: number | null;
  successfulAttemptCount?: number | null;
  evidenceVersions?: Record<string,string[]>;
  evidenceWindow?: {start:string;end:string} | null;
  membershipAsOf?: string | null;
  uncertaintyBasisPoints: number;
  currentFreshestAt?: string;
  suggestedNextStep: string;
};

function usePhase4Capability() {
  const client = usePortalClient();
  const { scope } = useScope();
  const scopeKey = scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
  return useQuery({
    queryKey: ['petros-phase4-capability', scopeKey],
    queryFn: () => client.get<Capability>('/portal/petros/institutional/teacher/phase4-capabilities', scope),
    staleTime: 30_000,
    retry: false,
  });
}

function ApiError({ error, fallback }: { error: unknown; fallback: string }) {
  return <p role="alert" className="mt-2 text-sm text-danger">{formatPortalError(error, fallback)}</p>;
}

export function PetrosMaterialCorrectionReview({ materialId, materialVersion, materialTitle }: {
  materialId: string; materialVersion: number; materialTitle: string;
}) {
  const capability = usePhase4Capability();
  if (capability.isPending || capability.data?.enabled !== true) {
    if (capability.isError) return <ApiError error={capability.error} fallback="Correction review is unavailable." />;
    return null;
  }
  return <MaterialCorrectionReviewEnabled materialId={materialId} materialVersion={materialVersion} materialTitle={materialTitle} />;
}

function MaterialCorrectionReviewEnabled({ materialId, materialVersion, materialTitle }: {
  materialId: string; materialVersion: number; materialTitle: string;
}) {
  const client = usePortalClient();
  const { scope } = useScope();
  const me = usePortalMe();
  const queryClient = useQueryClient();
  const upload = useUploadClassMaterial();
  const [file, setFile] = useState<File | null>(null);
  const [objectId, setObjectId] = useState('');
  const [reason, setReason] = useState('');
  const [meaningChanged, setMeaningChanged] = useState(false);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const queryKey = ['petros-material-corrections', materialId];
  const corrections = useQuery({
    queryKey,
    queryFn: () => client.get<{ items: CorrectionPreview[] }>(`/portal/course-content/materials/${encodeURIComponent(materialId)}/corrections`, scope),
    retry: false,
  });
  const preview = useMutation({
    mutationFn: (input: { objectId: string; expectedMaterialVersion: number; reason: string; meaningChanged: boolean; commandId: string }) =>
      client.post<CorrectionPreview>(`/portal/course-content/materials/${encodeURIComponent(materialId)}/correction-preview`, scope, input),
    onSuccess: () => { setObjectId(''); setFile(null); setReason(''); setMeaningChanged(false); void queryClient.invalidateQueries({ queryKey }); },
  });
  const review = useMutation({
    mutationFn: ({ correctionId, expectedVersion, decision, reviewReason }: { correctionId: string; expectedVersion: number; decision: 'approve' | 'reject'; reviewReason: string }) =>
      client.post<CorrectionPreview>(`/portal/course-content/materials/${encodeURIComponent(materialId)}/corrections/${encodeURIComponent(correctionId)}/review`, scope,
        { expectedVersion, decision, reviewReason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['course-content'] });
      void queryClient.invalidateQueries({ queryKey: ['teaching'] });
    },
  });

  async function uploadReplacement() {
    if (!file) return;
    setError(null);
    try {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Choose a PDF replacement file.');
      }
      if (file.size > 20 * 1024 * 1024) throw new Error('The replacement PDF must be 20 MiB or smaller.');
      const uploaded = await upload.mutateAsync(file);
      setObjectId(uploaded.id);
    } catch (caught) { setError(caught); }
  }

  async function createPreview() {
    setError(null);
    try {
      await preview.mutateAsync({ objectId, expectedMaterialVersion: materialVersion, reason: reason.trim(), meaningChanged, commandId: crypto.randomUUID() });
    } catch (caught) { setError(caught); }
  }

  async function decide(row: CorrectionPreview, decision: 'approve' | 'reject') {
    setError(null);
    try {
      await review.mutateAsync({ correctionId: row.id, expectedVersion: row.version, decision, reviewReason: (reviewReasons[row.id] ?? '').trim() });
    } catch (caught) { setError(caught); }
  }

  const rows = corrections.data?.items ?? [];
  return <section className="mt-3 border-t border-border pt-3" aria-label={`Reviewed replacement for ${materialTitle}`}>
    <h3 className="text-xs font-semibold text-text-primary">Reviewed PDF replacement</h3>
    <p className="mt-1 text-xs text-text-muted">Replacement stays a preview until a different authorized staff account reviews it. Approval preserves old citations and invalidates their current source authority.</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      <label className="text-xs font-medium">Replacement PDF
        <input type="file" accept="application/pdf,.pdf" className="mt-1 block w-full text-xs" onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setObjectId(''); }} />
      </label>
      <Button size="sm" variant="secondary" onClick={() => void uploadReplacement()} disabled={!file || upload.isPending}>
        {upload.isPending ? 'Uploading…' : objectId ? 'PDF uploaded' : 'Upload replacement'}
      </Button>
    </div>
    <label className="mt-2 block text-xs font-medium">Why does this material need correction?
      <textarea className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
    </label>
    <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={meaningChanged} onChange={(event) => setMeaningChanged(event.currentTarget.checked)} />The replacement changes the meaning, not only formatting or transcription.</label>
    <Button className="mt-2" size="sm" onClick={() => void createPreview()} disabled={!objectId || reason.trim().length < 12 || preview.isPending}>
      {preview.isPending ? 'Preparing preview…' : 'Create correction preview'}
    </Button>
    {error ? <ApiError error={error} fallback="The correction could not be completed." /> : null}
    {corrections.isError ? <ApiError error={corrections.error} fallback="Correction history could not be loaded." /> : null}
    {corrections.isPending ? <p role="status" className="mt-2 text-xs text-text-muted">Loading correction history…</p> : null}
    <div className="mt-3 space-y-2">
      {rows.map((row) => <article key={row.id} className="rounded-lg border border-border bg-surface-elevated p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">Correction · {row.status}</strong><span className="text-xs text-text-muted">Version {row.version} · opened {new Date(row.createdAt).toLocaleString()}</span></div>
        <p className="mt-2 text-sm">{row.reason}</p>
        <p className="mt-1 text-xs text-text-muted">Against material version {row.expectedMaterialVersion} · meaning changed: {row.meaningChanged ? 'yes' : 'no'} · affects {row.preview.affectedLearners ?? 'unknown'} learners and {row.preview.affectedSourceRecords ?? 'unknown'} source records · historical citations: {row.preview.historicalCitationPolicy ?? 'policy unavailable'}.</p>
        <p className="mt-1 text-xs text-text-muted">Affected packs: {row.preview.affectedPacks ?? 'unavailable'} · source locators: {row.preview.affectedLocators ?? 'unavailable'} · session recommendation scopes: {row.preview.affectedSessionRecommendations ?? 'unavailable'}. {row.preview.evaluationPolicy}</p>
        <details className="mt-1 break-all text-xs"><summary>Affected source versions</summary>{row.preview.affectedSourceVersions?.map(source=><p key={source.id}>{source.id}: {source.fingerprint}</p>)}</details>
        <p className="mt-1 text-xs text-text-muted">Private content inspected: {row.preview.privateContentInspected === false ? 'no' : 'not reported'} · proposed by {row.proposedBy}{row.reviewedBy ? ` · reviewed by ${row.reviewedBy}` : ''}{row.publishedMaterialVersion ? ` · published material version ${row.publishedMaterialVersion}` : ''}</p>
        {row.reviewReason ? <p className="mt-1 text-xs">Review note: {row.reviewReason}</p> : null}
        {row.status === 'preview' ? <>
          {me.data?.institutionUserId === row.proposedBy ? <p role="status" className="mt-2 text-xs text-text-muted">You proposed this correction. A different authorized staff member must review it.</p> : null}
          <label className="mt-2 block text-xs font-medium">Review reason (required for approval or rejection)
            <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" rows={2} maxLength={1000} value={reviewReasons[row.id] ?? ''} onChange={(event) => { const value = event.currentTarget.value; setReviewReasons((current) => ({ ...current, [row.id]: value })); }} />
          </label>
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void decide(row, 'approve')} disabled={me.data?.institutionUserId === row.proposedBy || (reviewReasons[row.id] ?? '').trim().length < 8 || review.isPending}>Approve and publish</Button><Button size="sm" variant="secondary" onClick={() => void decide(row, 'reject')} disabled={me.data?.institutionUserId === row.proposedBy || (reviewReasons[row.id] ?? '').trim().length < 8 || review.isPending}>Reject preview</Button></div>
        </> : null}
      </article>)}
      {!corrections.isPending && !rows.length ? <p className="text-xs text-text-muted">No correction previews for this material.</p> : null}
    </div>
  </section>;
}

export function PetrosTeacherInterventionPanel({ classId, subjectId }: { classId: string; subjectId: string }) {
  const capability = usePhase4Capability();
  if (capability.isPending || capability.data?.enabled !== true) {
    if (capability.isError) return <ApiError error={capability.error} fallback="Teacher interventions are unavailable." />;
    return null;
  }
  return <TeacherInterventionPanelEnabled classId={classId} subjectId={subjectId} />;
}

function TeacherInterventionPanelEnabled({ classId, subjectId }: { classId: string; subjectId: string }) {
  const client = usePortalClient();
  const { scope } = useScope();
  const me = usePortalMe();
  const queryClient = useQueryClient();
  const signalsQuery = useQuery({
    queryKey: ['petros-teacher-signals'],
    queryFn: () => client.get<Signal[]>('/portal/petros/institutional/teacher/signals', scope),
    retry: false,
  });
  const signals = useMemo(() => (signalsQuery.data ?? []).filter((row) => row.classId === classId && row.subjectId === subjectId), [classId, subjectId, signalsQuery.data]);
  const interventionsKey = ['petros-teacher-interventions', classId, subjectId];
  const interventions = useQuery({
    queryKey: interventionsKey,
    queryFn: () => {
      const query = new URLSearchParams({ classId, subjectId });
      return client.get<{ items: Intervention[] }>(`/portal/petros/institutional/teacher/interventions?${query.toString()}`, scope);
    },
    retry: false,
  });
  const [conceptKey, setConceptKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiresLocal, setExpiresLocal] = useState(() => {
    const date = new Date(Date.now() + 7 * 86_400_000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const preview = useMutation({
    mutationFn: () => client.post<Intervention>('/portal/petros/institutional/teacher/interventions/preview', scope, {
      classId, subjectId, conceptKey: conceptKey.trim(), title: title.trim(), description: description.trim(),
      expiresAt: new Date(expiresLocal).toISOString(), commandId: crypto.randomUUID(),
    }),
    onSuccess: () => { setTitle(''); setDescription(''); void queryClient.invalidateQueries({ queryKey: interventionsKey }); },
  });
  const action = useMutation({
    mutationFn: ({ row, decision }: { row: Intervention; decision: 'approve' | 'cancel' }) =>
      client.post<Intervention>(`/portal/petros/institutional/teacher/interventions/${encodeURIComponent(row.id)}/${decision}`, scope,
        { expectedVersion: row.version, reason: (reason[row.id] ?? '').trim() }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: interventionsKey }); },
  });

  async function createPreview() {
    setError(null);
    try { await preview.mutateAsync(); }
    catch (caught) { setError(caught); }
  }
  async function review(row: Intervention, decision: 'approve' | 'cancel') {
    setError(null);
    try { await action.mutateAsync({ row, decision }); }
    catch (caught) { setError(caught); }
  }

  return <section className="mt-5 space-y-3" aria-label="Petros class signals and intervention review">
    <div>
      <h2 className="text-sm font-semibold text-text-primary">Petros class signals</h2>
      <p className="mt-1 text-xs text-text-muted">Only current privacy-eligible cohort signals are shown. Individual learner responses and identities are not available here.</p>
      {signalsQuery.isError ? <ApiError error={signalsQuery.error} fallback="Class signals could not be loaded." /> : null}
      {signalsQuery.isPending ? <p role="status" className="mt-2 text-xs text-text-muted">Loading privacy-filtered signals…</p> : null}
      <div className="mt-2 grid gap-2">{signals.map((signal) => <Card key={signal.id} className="p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{signal.concept}</strong><span className="text-xs text-text-muted">{signal.currentSuppressed || signal.suppressed ? `Suppressed below ${signal.currentThreshold ?? signal.threshold ?? 'the current policy threshold'}` : `${signal.affectedLearnerCount ?? 0} affected · ${signal.independentAttemptCount ?? 0} evidence events`}</span></div>
        <p className="mt-1 text-xs text-text-secondary">{signal.suggestedNextStep}</p>
        {!signal.suppressed && <p className="mt-1 text-xs text-text-muted">{signal.evidenceCoveredCount ?? 0} of {signal.eligibleCount ?? 0} eligible learners have accepted independent evidence; {signal.successfulAttemptCount ?? 0} successful attempts. Membership checked {signal.membershipAsOf ? new Date(signal.membershipAsOf).toLocaleString() : 'at current read'}{signal.evidenceWindow ? `; evidence window ${new Date(signal.evidenceWindow.start).toLocaleDateString()}–${new Date(signal.evidenceWindow.end).toLocaleDateString()}` : ''}.</p>}
        {!signal.suppressed && signal.evidenceVersions && <details className="mt-1 break-all text-xs"><summary>Evidence versions</summary>{Object.entries(signal.evidenceVersions).map(([key,values])=><p key={key}>{key}: {values.join(', ') || 'unavailable'}</p>)}</details>}
        {!signal.currentSuppressed && !signal.suppressed ? <Button className="mt-2" size="sm" variant="secondary" onClick={() => setConceptKey(signal.concept)}>Use this concept</Button> : null}
        <p className="mt-1 text-xs text-text-muted">Uncertainty {Math.round(signal.uncertaintyBasisPoints / 100)}% · aggregate only, no ranking or raw answers.</p>
      </Card>)}{!signalsQuery.isPending && !signalsQuery.isError && !signals.length ? <p className="rounded-lg border border-border p-3 text-xs text-text-muted">No privacy-eligible signals for this class and subject.</p> : null}</div>
    </div>

    <Card className="p-4">
      <h2 className="text-sm font-semibold text-text-primary">Prepare a class intervention</h2>
      <p className="mt-1 text-xs text-text-muted">This creates a review-only preview. Approval rechecks current class policy, privacy threshold, roster, and learner accommodations before publishing an assignment.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Concept key<input className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" value={conceptKey} onChange={(event) => setConceptKey(event.currentTarget.value)} placeholder="Use a concept key from the signal" /></label>
        <label className="text-xs font-medium">Title<input className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" value={title} maxLength={160} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
        <label className="text-xs font-medium sm:col-span-2">Description<textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" rows={3} value={description} maxLength={1000} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
        <label className="text-xs font-medium">Expires at<input className="mt-1 block rounded-lg border border-border px-3 py-2 text-sm" type="datetime-local" value={expiresLocal} onChange={(event) => setExpiresLocal(event.currentTarget.value)} /></label>
      </div>
      <Button className="mt-3" size="sm" onClick={() => void createPreview()} disabled={conceptKey.trim().length < 1 || title.trim().length < 3 || description.trim().length < 8 || !expiresLocal || preview.isPending}>{preview.isPending ? 'Preparing…' : 'Preview intervention'}</Button>
    </Card>
    {error ? <ApiError error={error} fallback="The requested action was denied or could not be completed. Refresh the record before trying again." /> : null}
    {interventions.isError ? <ApiError error={interventions.error} fallback="Intervention history could not be loaded." /> : null}
    {interventions.isPending ? <p role="status" className="text-xs text-text-muted">Loading intervention history…</p> : null}
    <div className="space-y-2">{(interventions.data?.items ?? []).map((row) => <article key={row.id} className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{row.title}</h3><span className="rounded-full bg-surface-muted px-2 py-1 text-xs">{row.status} · {row.deliveryStatus}</span></div>
      <p className="mt-1 text-xs text-text-muted">Concept {row.conceptKey} · expires {new Date(row.expiresAt).toLocaleString()}</p>
      <p className="mt-2 text-sm">{row.description}</p>
      <p className="mt-2 text-xs text-text-muted">Preview audience: {row.audiencePreview.candidateCount ?? 'not reported'} candidates{row.audiencePreview.suppressed ? ' · suppressed by privacy threshold' : ''}. {row.deliveryStatus === 'published' ? 'Published through the assignment owner.' : row.deliveryStatus === 'cancelled' ? 'Assignment delivery cancelled.' : row.deliveryStatus === 'expired' ? 'Assignment delivery expired.' : 'Preview only; no delivery.'}</p>
      <p className="mt-1 text-xs text-text-muted">Policy and accommodation are rechecked at approval and assignment delivery. Created by {row.createdBy}{row.approvedBy ? ` · approved by ${row.approvedBy}` : ''} · version {row.version}.</p>
      {row.reason ? <p className="mt-1 text-xs">Decision note: {row.reason}</p> : null}
      {row.status === 'preview' || row.status === 'approved' ? <>
        <label className="mt-2 block text-xs font-medium">Review or cancellation reason (at least 8 characters)
          <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" rows={2} maxLength={1000} value={reason[row.id] ?? ''} onChange={(event) => { const value = event.currentTarget.value; setReason((current) => ({ ...current, [row.id]: value })); }} />
        </label>
        {row.status === 'preview' && me.data?.institutionUserId === row.createdBy ? <p role="status" className="mt-2 text-xs text-text-muted">You created this preview. A different authorized staff member must approve it.</p> : null}
        <div className="mt-2 flex gap-2">{row.status === 'preview' ? <Button size="sm" onClick={() => void review(row, 'approve')} disabled={me.data?.institutionUserId === row.createdBy || (reason[row.id] ?? '').trim().length < 8 || action.isPending}>Approve and publish assignment</Button> : null}<Button size="sm" variant="secondary" onClick={() => void review(row, 'cancel')} disabled={(reason[row.id] ?? '').trim().length < 8 || action.isPending}>Cancel intervention</Button></div>
      </> : null}
    </article>)}{!interventions.isPending && !interventions.isError && !(interventions.data?.items.length) ? <p className="rounded-lg border border-border p-3 text-xs text-text-muted">No intervention previews or decisions for this class and subject.</p> : null}</div>
  </section>;
}
