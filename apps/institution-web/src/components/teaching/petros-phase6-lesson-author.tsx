'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PETROS_TEACHING_PACK_COMPILER_VERSION,
  PETROS_CONCEPT_PACK_VERSION,
  petrosConceptPackCandidateSchema,
  petrosSessionBlockSchema,
  type PetrosConceptPackCandidate,
  type PetrosSessionBlock,
} from '@edrion/schemas';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { usePortalMe } from '@/lib/hooks';
import type { TeachingAssignment } from '@/lib/teaching';
import { PetrosLessonPublication } from './petros-lesson-publication';
import { PetrosTeachingBlockPreview } from '@edrion/ui';

type PackRow = {
  id: string;
  sourceItemId: string;
  createdByUserId: string;
  payloadHash: string;
  packVersion: number;
  payload: PetrosConceptPackCandidate;
  latestReview: { id: string; reviewVersion: number; decision: 'approved' | 'rejected'; reviewedAt: string; payloadHash: string; revoked: boolean } | null;
};
type Qualification = { id: string; version: number; subjectKey: string; status: string; reviewerUserId: string };
type PreviewResponse = {
  blocks: PetrosSessionBlock[];
  assessmentConditions: {
    supervision: 'unknown';
    externalAssistance: 'unknown';
    purpose: 'formative_preview';
    evidenceRecorded: false;
  };
};
type AuthoringDraft = { courseId: string; sourceItemId: string; candidate: PetrosConceptPackCandidate };

const field = 'mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const button = 'min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} border-primary bg-primary text-white hover:opacity-90`;

function parseBundle(raw: string): AuthoringDraft {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const candidate = petrosConceptPackCandidateSchema.parse(parsed.candidate);
  if (typeof parsed.courseId !== 'string' || typeof parsed.sourceItemId !== 'string')
    throw new Error('The import needs the current courseId and sourceItemId alongside the candidate.');
  return { courseId: parsed.courseId, sourceItemId: parsed.sourceItemId, candidate };
}

function localPreview(candidate: PetrosConceptPackCandidate): PetrosSessionBlock {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const content = {
    schemaVersion: 'petros.render.v2' as const,
    type: 'layered_explanation' as const,
    title: candidate.objectiveStatement.slice(0, 180),
    firstLayer: candidate.coreExplanation,
    deeperLayers: candidate.concepts.slice(0, 2).map((concept) => ({
      id: concept.id.slice(0, 80),
      label: concept.label.slice(0, 120),
      content: concept.definition,
    })),
    keyIdea: candidate.claims?.[0]?.statement ?? candidate.concepts[0]?.definition ?? candidate.scope,
    sourceGrounding: [],
  };
  return petrosSessionBlockSchema.parse({
    id,
    sessionId: crypto.randomUUID(),
    decisionId: crypto.randomUUID(),
    sequence: 1,
    status: 'current',
    version: 0,
    content,
    interactionState: {},
    observedOutcome: null,
    questions: [],
    whyThis: 'A local, read-only teacher preview of the candidate explanation.',
    correlationId: crypto.randomUUID(),
    delivery: 'deterministic_fallback',
    createdAt,
    completedAt: null,
  });
}

export function PetrosPhase6LessonAuthor({ assignment, classId, subjectId }: {
  assignment: TeachingAssignment;
  classId: string;
  subjectId: string;
}) {
  const client = usePortalClient();
  const { scope } = useScope();
  const me = usePortalMe();
  const queryClient = useQueryClient();
  const courseIds = assignment.contextIds.filter((id) => id !== classId);
  const [courseId, setCourseId] = useState(courseIds.length === 1 ? courseIds[0]! : '');
  const [sourceItemId, setSourceItemId] = useState('');
  const [candidate, setCandidate] = useState<PetrosConceptPackCandidate | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedQualificationId, setSelectedQualificationId] = useState('');
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewRationale, setReviewRationale] = useState('');
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const candidatesKey = ['petros-phase6-packs', me.data?.institutionUserId, courseId, scope.mode, scope.mode === 'campus' ? scope.campusId : 'institution'];
  const candidates = useQuery({
    queryKey: candidatesKey,
    enabled: Boolean(courseId),
    retry: false,
    queryFn: () => client.get<{ items: PackRow[] }>(`/portal/petros/teaching-packs/candidates?courseId=${encodeURIComponent(courseId)}`, scope),
  });
  const qualifications = useQuery({
    queryKey: ['petros-phase6-qualifications', courseId, me.data?.institutionUserId],
    enabled: Boolean(courseId && me.data?.institutionUserId),
    retry: false,
    queryFn: () => client.get<{ items: Qualification[] }>(`/portal/petros/teaching-packs/qualifications?courseId=${encodeURIComponent(courseId)}`, scope),
  });
  const rows = candidates.data?.items ?? [];
  const selectedRow = rows.find((row) => row.id === selectedCandidateId) ?? null;
  const activeQualifications = (qualifications.data?.items ?? []).filter((item) =>
    item.status === 'active' && item.subjectKey === (selectedRow?.payload.subject ?? candidate?.subject) &&
    item.reviewerUserId === me.data?.institutionUserId,
  );
  const selectedQualification = activeQualifications.find((item) => item.id === selectedQualificationId) ?? null;
  const candidateDirty = Boolean(selectedRow && candidate && JSON.stringify(candidate) !== JSON.stringify(selectedRow.payload));
  const latestPackVersion = candidate
    ? rows.filter((row) => row.payload.pack.id === candidate.pack.id).reduce((latest, row) => Math.max(latest, row.packVersion), 0)
    : 0;

  const compile = useMutation({
    mutationFn: (draft: AuthoringDraft) => client.post<{
      candidateId: string; candidate: PetrosConceptPackCandidate; payloadHash: string; replayed: boolean;
    }>('/portal/petros/teaching-packs/authoring/candidates/compile', scope, {
      schemaVersion: 'petros.teaching-pack-compile.v1',
      commandId: crypto.randomUUID(),
      courseId: draft.courseId,
      sourceItemId: draft.sourceItemId,
      candidate: draft.candidate,
    }),
    onSuccess: (result) => {
      setSelectedCandidateId(result.candidateId);
      setCandidate(result.candidate);
      setNotice(`Saved candidate ${result.candidateId} · version ${result.candidate.pack.version} · ${result.payloadHash}`);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });
  const review = useMutation({
    mutationFn: ({ row, qualification }: { row: PackRow; qualification: Qualification }) => client.post<{
      receipt: { receiptId: string; reviewVersion: number; decision: 'approved' | 'rejected'; payloadHash: string; reviewedAt: string };
      replayed: boolean;
    }>(`/portal/petros/teaching-packs/authoring/candidates/${encodeURIComponent(row.id)}/reviews`, scope, {
      schemaVersion: 'petros.teaching-pack-review-command.v1',
      commandId: crypto.randomUUID(),
      expectedPayloadHash: row.payloadHash,
      decision: reviewDecision,
      qualificationId: qualification.id,
      expectedQualificationVersion: qualification.version,
      coverage: {
        sourceFidelity: 'reviewed', scientificCorrectness: 'reviewed', prerequisitesAndMisconceptions: 'reviewed',
        examplesAndExplanations: 'reviewed', rubricAndUnseenTransfer: 'reviewed',
      },
      rationale: reviewRationale.trim(),
    }),
    onSuccess: (result) => {
      setNotice(`Review ${result.receipt.decision} · receipt ${result.receipt.receiptId} · version ${result.receipt.reviewVersion} · ${result.receipt.payloadHash}`);
      setError(null);
      setReviewRationale(''); setReviewAcknowledged(false);
      void queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });
  const revoke = useMutation({
    mutationFn: (row: PackRow) => {
      if (!row.latestReview) throw new Error('This candidate has no review receipt to revoke.');
      return client.post(`/portal/petros/teaching-packs/authoring/reviews/${encodeURIComponent(row.latestReview.id)}/revoke`, scope, {
        schemaVersion: 'petros.teaching-pack-review-revocation.v1',
        commandId: crypto.randomUUID(),
        expectedReviewVersion: row.latestReview.reviewVersion,
        reason: revokeReason.trim(),
      });
    },
    onSuccess: () => {
      setNotice('Review revocation recorded. This does not delete the candidate or publish/unpublish an assignment.');
      setRevokeReason(''); setError(null);
      void queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });

  const visibleCandidate = candidate ?? selectedRow?.payload ?? null;
  const localBlock = useMemo(() => {
    if (!visibleCandidate) return null;
    try { return localPreview(visibleCandidate); } catch { return null; }
  }, [visibleCandidate]);
  const preview = useQuery({
    queryKey: ['petros-phase6-preview', selectedCandidateId, me.data?.institutionUserId, scope],
    enabled: Boolean(selectedCandidateId && me.data?.institutionUserId),
    retry: false,
    queryFn: () => client.get<PreviewResponse>(`/portal/petros/teaching-packs/candidates/${encodeURIComponent(selectedCandidateId)}/preview`, scope),
  });
  const trustedPreview = Boolean(selectedRow && !candidateDirty && !preview.isError && preview.data);
  const renderedBlocks = trustedPreview ? preview.data!.blocks : (!selectedCandidateId || (selectedRow && candidateDirty)) && localBlock ? [localBlock] : [];

  function updateCandidate(patch: Partial<PetrosConceptPackCandidate>) {
    setCandidate((current) => current ? { ...current, ...patch } : current);
    setImportText('');
    setNotice(null);
  }

  function importDraft() {
    setImportError(null); setError(null);
    try {
      const bundle = parseBundle(importText);
      setCandidate(bundle.candidate); setSourceItemId(bundle.sourceItemId); setCourseId(bundle.courseId); setSelectedCandidateId('');
      setNotice('Draft imported. Current source, curriculum, and course authority will be rechecked when saved.');
    } catch (caught) { setImportError(caught instanceof Error ? caught.message : 'The JSON draft could not be read.'); }
  }

  function exportDraft() {
    if (!candidate) return;
    setImportText(JSON.stringify({ courseId, sourceItemId, candidate }, null, 2));
    setNotice('Draft JSON is ready to copy or download. It remains in this page only.');
  }

  async function saveCandidate() {
    setError(null); setNotice(null);
    if (!courseId || !sourceItemId) { setError(new Error('Choose the current course and enter the authorized source item ID from its source record.')); return; }
    const parsed = petrosConceptPackCandidateSchema.safeParse(candidate);
    if (!parsed.success) { setError(new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'))); return; }
    if (parsed.data.pack.version !== latestPackVersion + 1) {
      setError(new Error(`This pack's next available version is ${latestPackVersion + 1}. Use “Prepare next version” before saving.`)); return;
    }
    try { await compile.mutateAsync({ courseId, sourceItemId, candidate: parsed.data }); }
    catch (caught) { setError(caught); }
  }

  function prepareNextVersion() {
    if (!candidate) return;
    updateCandidate({ pack: { ...candidate.pack, version: latestPackVersion + 1 } });
    setNotice(`Draft set to pack version ${latestPackVersion + 1}. Source and curriculum authority are still rechecked when saved.`);
  }

  async function submitReview() {
    if (!selectedRow || !selectedQualification) return;
    setError(null);
    try { await review.mutateAsync({ row: selectedRow, qualification: selectedQualification }); }
    catch (caught) { setError(caught); }
  }

  async function revokeReview() {
    if (!selectedRow?.latestReview) return;
    setError(null);
    try { await revoke.mutateAsync(selectedRow); }
    catch (caught) { setError(caught); }
  }

  const permissionSet = me.data?.permissions ?? [];
  const mayCompile = permissionSet.some((permission) => permission === 'class_content.manage' || permission === 'syllabus.manage');
  const mayReview = permissionSet.some((permission) => permission === 'syllabus.manage' || permission === 'academics.alignments.approve');

  return (
    <section aria-labelledby="petros-lesson-author-title" className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Petros · reviewed lesson</p>
          <h2 id="petros-lesson-author-title" className="mt-1 font-serif text-xl font-semibold text-text-primary">Compose a source-grounded lesson</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">Work from an existing, current pack candidate for subject {subjectId}. The API checks course, source, objective, curriculum and reviewer authority again on every write.</p>
        </div>
        <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-text-muted">{PETROS_CONCEPT_PACK_VERSION}</span>
      </div>

      {!me.data && me.isPending ? <p role="status" className="mt-4 text-sm text-text-muted">Checking your current staff permissions…</p> : null}
      {me.isError ? <p role="alert" className="mt-4 text-sm text-danger">{formatPortalError(me.error, 'Staff authority is unavailable.')}</p> : null}
      {me.data && !mayCompile && !mayReview ? <p role="status" className="mt-4 rounded-lg bg-surface-elevated p-3 text-sm text-text-secondary">Your current role cannot author or review Petros lessons.</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <div className="grid content-start gap-5">
          <section aria-labelledby="petros-author-sources-title" className="grid gap-3 rounded-xl border border-border p-4">
            <h3 id="petros-author-sources-title" className="font-semibold text-text-primary">Current authority and source</h3>
            <p className="text-sm text-text-secondary">{assignment.subjectName} · {assignment.className}. Course and source identifiers are explicit because this teacher page has no source-version or curriculum lookup. The server confirms each identifier and current access.</p>
            {courseIds.length > 0 ? (
              <label className="text-sm font-medium text-text-primary">Course
                <select aria-label="Course" className={field} value={courseId} onChange={(event) => { setCourseId(event.currentTarget.value); setSelectedCandidateId(''); setCandidate(null); setSourceItemId(''); }}>
                  <option value="">Choose the linked course</option>
                  {courseIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
            ) : (
              <label className="text-sm font-medium text-text-primary">Course ID
                <input className={field} value={courseId} onChange={(event) => setCourseId(event.currentTarget.value)} placeholder="UUID from the current course record" />
              </label>
            )}
            <label className="text-sm font-medium text-text-primary">Canonical source item ID
              <input className={field} value={sourceItemId} onChange={(event) => setSourceItemId(event.currentTarget.value)} placeholder="UUID from the current authorized source record" />
            </label>
            <p className="text-xs leading-5 text-text-muted">The source UUID is not the uploaded file UUID. Compilation fails if the source is missing, stale, unreadable, revoked, outside this course, or no longer accessible.</p>
          </section>

          <section aria-labelledby="petros-pack-list-title" className="grid gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="petros-pack-list-title" className="font-semibold text-text-primary">Saved candidates and reviews</h3>
              <button type="button" className={button} onClick={() => void candidates.refetch()} disabled={!courseId || candidates.isFetching}>Refresh current records</button>
            </div>
            {!courseId ? <p className="text-sm text-text-muted">Choose a course to load its current candidates.</p> : null}
            {candidates.isPending && courseId ? <p role="status" className="text-sm text-text-muted">Loading current candidates…</p> : null}
            {candidates.isError ? <p role="alert" className="text-sm text-danger">{formatPortalError(candidates.error, 'Candidate records are unavailable for this course.')}</p> : null}
            {!candidates.isPending && !candidates.isError && courseId && rows.length === 0 ? <p className="text-sm text-text-muted">No candidate is available in the current course scope.</p> : null}
            {rows.length > 0 ? <label className="text-sm font-medium text-text-primary">Candidate
              <select aria-label="Candidate" className={field} value={selectedCandidateId} onChange={(event) => {
                const next = rows.find((row) => row.id === event.currentTarget.value);
                setSelectedCandidateId(event.currentTarget.value); setCandidate(next?.payload ?? null);
                setSourceItemId(next?.sourceItemId ?? ''); setReviewAcknowledged(false); setNotice(null); setError(null);
              }}>
                <option value="">Choose a current candidate</option>
                {rows.map((row) => <option key={row.id} value={row.id}>v{row.packVersion} · {row.payload.objectiveStatement} · {row.latestReview?.revoked ? 'revoked' : row.latestReview?.decision ?? 'not reviewed'}</option>)}
              </select>
            </label> : null}
            {selectedRow ? <div className="grid gap-1 rounded-lg bg-surface-elevated p-3 text-xs text-text-secondary">
              <p>Candidate ID: <code className="break-all">{selectedRow.id}</code></p>
              <p>Version: {selectedRow.packVersion} · payload SHA-256: <code className="break-all">{selectedRow.payloadHash}</code></p>
              <p>Author: <code className="break-all">{selectedRow.createdByUserId}</code>{selectedRow.createdByUserId === me.data?.institutionUserId ? ' (you)' : ''}</p>
              <p>Review: {selectedRow.latestReview ? `${selectedRow.latestReview.decision}, receipt ${selectedRow.latestReview.id}, version ${selectedRow.latestReview.reviewVersion}` : 'none'}</p>
            </div> : null}
          </section>

          <section aria-labelledby="petros-author-import-title" className="grid gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="petros-author-import-title" className="font-semibold text-text-primary">Import or export a structured draft</h3>
              {candidate ? <button type="button" className={button} onClick={exportDraft}>Prepare JSON export</button> : null}
            </div>
            <p className="text-sm text-text-secondary">Use the strict current pack contract: <code>{PETROS_CONCEPT_PACK_VERSION}</code> and compiler <code>{PETROS_TEACHING_PACK_COMPILER_VERSION}</code>. Keep exact source locators and current curriculum/objective references from their owner records.</p>
            <label className="text-sm font-medium text-text-primary">Draft JSON bundle
              <textarea className={`${field} min-h-48 font-mono text-xs`} value={importText} onChange={(event) => setImportText(event.currentTarget.value)} placeholder={'{"courseId":"…","sourceItemId":"…","candidate":{…}}'} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={importDraft} disabled={!importText.trim()}>Load JSON into editor</button>
              <button type="button" className={primary} onClick={() => void saveCandidate()} disabled={!candidate || !mayCompile || compile.isPending || !me.data}>Validate and save new candidate</button>
            </div>
            {importError ? <p role="alert" className="text-sm text-danger">{importError}</p> : null}
            {!mayCompile ? <p className="text-xs text-text-muted">Current permissions do not include pack authoring. The server still makes the final decision.</p> : null}
          </section>

            {candidate ? <>
              {latestPackVersion > 0 ? <button type="button" className={button} onClick={prepareNextVersion}>Prepare next version ({latestPackVersion + 1})</button> : null}
              <CandidateEditor candidate={candidate} onChange={updateCandidate} />
            </> : null}

          {visibleCandidate ? <section aria-labelledby="petros-review-title" className="grid gap-3 rounded-xl border border-border p-4">
            <h3 id="petros-review-title" className="font-semibold text-text-primary">Qualified review</h3>
            {!selectedRow ? <p className="text-sm text-text-muted">Save the draft first. Review applies to the exact stored candidate payload hash.</p> : null}
            {selectedRow?.createdByUserId === me.data?.institutionUserId ? <p role="status" className="rounded-lg bg-surface-elevated p-3 text-sm text-text-secondary">You authored this candidate. A different qualified educator must review it.</p> : null}
            {candidateDirty ? <p role="status" className="rounded-lg bg-surface-elevated p-3 text-sm text-text-secondary">This draft differs from the saved payload. Save it as the next pack version before requesting a review.</p> : null}
            {qualifications.isError ? <p role="alert" className="text-sm text-danger">{formatPortalError(qualifications.error, 'Current reviewer qualifications are unavailable.')}</p> : null}
            {selectedRow && mayReview ? <>
              <label className="text-sm font-medium text-text-primary">Your current subject qualification
                <select aria-label="Your current subject qualification" className={field} value={selectedQualificationId} onChange={(event) => setSelectedQualificationId(event.currentTarget.value)}>
                  <option value="">Choose your active qualification</option>
                  {activeQualifications.map((item) => <option key={item.id} value={item.id}>{item.subjectKey} · qualification v{item.version}</option>)}
                </select>
              </label>
              {selectedQualification ? <p className="text-xs text-text-muted">Qualification ID <code>{selectedQualification.id}</code>, version {selectedQualification.version}; current reviewer identity is rechecked by the server.</p> : <p className="text-xs text-text-muted">{activeQualifications.length > 0 ? 'Choose your current qualification to review this exact candidate.' : 'No current active qualification for this subject and signed-in reviewer was returned.'}</p>}
              <label className="text-sm font-medium text-text-primary">Review rationale
                <textarea className={`${field} min-h-24`} maxLength={4000} value={reviewRationale} onChange={(event) => setReviewRationale(event.currentTarget.value)} placeholder="Record why this exact version is approved or rejected." />
              </label>
              <fieldset className="flex flex-wrap gap-4 text-sm text-text-secondary">
                <legend className="mb-1 font-medium text-text-primary">Decision</legend>
                <label className="flex min-h-10 items-center gap-2"><input type="radio" name="petros-pack-review-decision" checked={reviewDecision === 'approved'} onChange={() => setReviewDecision('approved')} /> Approve</label>
                <label className="flex min-h-10 items-center gap-2"><input type="radio" name="petros-pack-review-decision" checked={reviewDecision === 'rejected'} onChange={() => setReviewDecision('rejected')} /> Reject</label>
              </fieldset>
              <label className="flex min-h-11 items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={reviewAcknowledged} onChange={(event) => setReviewAcknowledged(event.currentTarget.checked)} />
                I reviewed source fidelity, scientific correctness, prerequisites and misconceptions, examples and explanations, rubric and unseen transfer for this exact payload.
              </label>
              <button type="button" className={primary} onClick={() => void submitReview()} disabled={!selectedRow || candidateDirty || !selectedQualification || !mayReview || !reviewAcknowledged || !reviewRationale.trim() || review.isPending || selectedRow.createdByUserId === me.data?.institutionUserId}>
                {review.isPending ? 'Recording review…' : `Record ${reviewDecision} review`}
              </button>
            </> : <p className="text-xs text-text-muted">Review requires current syllabus-review or academic-alignment approval permission.</p>}
            {selectedRow?.latestReview ? <div className="grid gap-2 border-t border-border pt-3">
              <p className="text-sm text-text-secondary">Latest decision: {selectedRow.latestReview.revoked ? 'revoked' : selectedRow.latestReview.decision} · receipt <code>{selectedRow.latestReview.id}</code> · payload <code>{selectedRow.latestReview.payloadHash}</code></p>
              <label className="text-sm font-medium text-text-primary">Reason to revoke this review
                <textarea className={field} maxLength={2000} value={revokeReason} onChange={(event) => setRevokeReason(event.currentTarget.value)} />
              </label>
              <button type="button" className={button} onClick={() => void revokeReview()} disabled={!mayReview || !revokeReason.trim() || revoke.isPending}>Revoke latest review</button>
            </div> : null}
          </section> : null}
        </div>

        <aside className="grid content-start gap-3" aria-label="Read-only lesson preview">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Same student renderer</p>
            <h3 className="font-serif text-lg font-semibold text-text-primary">Interactive lesson preview</h3>
          </div>
          {visibleCandidate ? <div className="grid gap-2 rounded-lg bg-surface-elevated p-3 text-xs text-text-secondary">
            <p>Objective: {visibleCandidate.objectiveStatement}</p>
            <p>Source version: <code className="break-all">{visibleCandidate.sourceVersion}</code></p>
            <p>Curriculum revision {visibleCandidate.curriculumRevision} · objective {visibleCandidate.objective.id} v{visibleCandidate.objective.version}</p>
            <p>Preview conditions: {trustedPreview && preview.data?.assessmentConditions ? `supervision ${preview.data.assessmentConditions.supervision}; external assistance ${preview.data.assessmentConditions.externalAssistance}; ${preview.data.assessmentConditions.purpose}; evidence recorded: ${String(preview.data.assessmentConditions.evidenceRecorded)}` : 'local composition only; no assessment or learner evidence'}</p>
          </div> : <p className="rounded-lg bg-surface-elevated p-3 text-sm text-text-muted">Load a candidate JSON draft or select a saved candidate to preview its lesson content.</p>}
          {selectedCandidateId && preview.isPending ? <p role="status" className="text-sm text-text-muted">Loading server-validated learner preview…</p> : null}
          {preview.isError ? <p role="alert" className="text-sm text-danger">{formatPortalError(preview.error, 'The current server-validated preview is unavailable.')}</p> : null}
          {renderedBlocks.map((block) => <PetrosTeachingBlockPreview key={block.id} block={block} interactive heading={trustedPreview ? 'Server-validated lesson block' : 'Local candidate composition'} />)}
          {visibleCandidate ? <section className="grid gap-1 rounded-lg border border-border p-3" aria-label="Assessment tasks in this candidate">
            <h4 className="text-sm font-semibold text-text-primary">Assessment tasks</h4>
            {visibleCandidate.assessments.map((task) => <div key={`${task.id}:${task.variant}`} className="border-t border-border py-2 text-sm">
              <p className="font-medium text-text-primary">{task.id} · {task.variant}{task.unseenContext ? ' · unseen context' : ''}</p>
              <p className="mt-1 text-text-secondary">{task.prompt}</p>
              <p className="mt-1 text-xs text-text-muted">Evaluator: {task.evaluator?.kind ?? 'not declared'} · learner preview does not grade or record a response.</p>
            </div>)}
          </section> : null}
        </aside>
      </div>
      {notice ? <p role="status" className="mt-4 rounded-lg bg-surface-elevated p-3 text-sm text-text-secondary">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-sm text-danger">{formatPortalError(error, 'The Petros lesson action could not be completed.')}</p> : null}
      {selectedRow?.latestReview?.decision === 'approved' && !selectedRow.latestReview.revoked && !candidateDirty && <PetrosLessonPublication key={selectedRow.id} candidate={selectedRow.payload} courseId={courseId} />}
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-text-muted">A candidate or review receipt is not a published assignment. Use the explicit assignment release preview above for an eligible single learner. Corrections create a new reviewed pack version; existing releases keep their historical references. Real curriculum approval and educator acceptance remain separate.</p>
    </section>
  );
}

function CandidateEditor({ candidate, onChange }: {
  candidate: PetrosConceptPackCandidate;
  onChange: (patch: Partial<PetrosConceptPackCandidate>) => void;
}) {
  return <section aria-labelledby="petros-author-structured-title" className="grid gap-4 rounded-xl border border-border p-4">
    <div>
      <h3 id="petros-author-structured-title" className="font-semibold text-text-primary">Structured lesson composition</h3>
      <p className="mt-1 text-sm text-text-muted">Edits preserve exact current anchors and owner references. Import JSON to change structure or locators.</p>
    </div>
    <ReadOnlyReferences candidate={candidate} />
    <label className="text-sm font-medium text-text-primary">Lesson scope
      <textarea className={`${field} min-h-20`} value={candidate.scope} onChange={(event) => onChange({ scope: event.currentTarget.value })} />
    </label>
    <label className="text-sm font-medium text-text-primary">Core explanation
      <textarea className={`${field} min-h-32`} value={candidate.coreExplanation} onChange={(event) => onChange({ coreExplanation: event.currentTarget.value })} />
    </label>
    {candidate.claims?.map((claim, index) => <label key={claim.id} className="text-sm font-medium text-text-primary">Claim · {claim.id}
      <textarea className={`${field} min-h-20`} value={claim.statement} onChange={(event) => onChange({ claims: candidate.claims?.map((item, itemIndex) => itemIndex === index ? { ...item, statement: event.currentTarget.value } : item) })} />
      <span className="mt-1 block text-xs text-text-muted">{claim.anchors.length} existing source anchors retained.</span>
    </label>)}
    <div className="grid gap-3">
      <h4 className="text-sm font-semibold text-text-primary">Concepts</h4>
      {candidate.concepts.map((concept, index) => <fieldset key={concept.id} className="grid gap-2 rounded-lg bg-surface-elevated p-3">
        <legend className="px-1 text-sm font-medium">{concept.id}</legend>
        <label className="text-sm">Label<input className={field} value={concept.label} onChange={(event) => onChange({ concepts: candidate.concepts.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.currentTarget.value } : item) })} /></label>
        <label className="text-sm">Definition<textarea className={field} value={concept.definition} onChange={(event) => onChange({ concepts: candidate.concepts.map((item, itemIndex) => itemIndex === index ? { ...item, definition: event.currentTarget.value } : item) })} /></label>
        <span className="text-xs text-text-muted">{concept.anchors.length} source anchors retained</span>
      </fieldset>)}
    </div>
    <div className="grid gap-3">
      <h4 className="text-sm font-semibold text-text-primary">Examples and non-examples</h4>
      {candidate.examples.map((example, index) => <fieldset key={example.id} className="grid gap-2 rounded-lg bg-surface-elevated p-3">
        <legend className="px-1 text-sm font-medium">{example.kind} · {example.id}</legend>
        <label className="text-sm">Prompt<textarea className={field} value={example.prompt} onChange={(event) => onChange({ examples: candidate.examples.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.currentTarget.value } : item) })} /></label>
        <label className="text-sm">Explanation<textarea className={field} value={example.explanation} onChange={(event) => onChange({ examples: candidate.examples.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.currentTarget.value } : item) })} /></label>
        <span className="text-xs text-text-muted">{example.anchors.length} source anchors retained</span>
      </fieldset>)}
    </div>
    <div className="grid gap-3">
      <h4 className="text-sm font-semibold text-text-primary">Misconceptions</h4>
      {candidate.misconceptions.map((item, index) => <fieldset key={item.id} className="grid gap-2 rounded-lg bg-surface-elevated p-3">
        <legend className="px-1 text-sm font-medium">{item.id}</legend>
        <label className="text-sm">Claim<textarea className={field} value={item.claim} onChange={(event) => onChange({ misconceptions: candidate.misconceptions.map((value, itemIndex) => itemIndex === index ? { ...value, claim: event.currentTarget.value } : value) })} /></label>
        <label className="text-sm">Discriminator<textarea className={field} value={item.discriminator} onChange={(event) => onChange({ misconceptions: candidate.misconceptions.map((value, itemIndex) => itemIndex === index ? { ...value, discriminator: event.currentTarget.value } : value) })} /></label>
        <label className="text-sm">Correction<textarea className={field} value={item.correction} onChange={(event) => onChange({ misconceptions: candidate.misconceptions.map((value, itemIndex) => itemIndex === index ? { ...value, correction: event.currentTarget.value } : value) })} /></label>
        <span className="text-xs text-text-muted">{item.anchors.length} source anchors retained</span>
      </fieldset>)}
    </div>
    <div className="grid gap-3">
      <h4 className="text-sm font-semibold text-text-primary">Assessment tasks and conditions</h4>
      <p className="text-xs leading-5 text-text-muted">The stored pack contract supports exact or numeric evaluators, unseen-context declarations, rubric criteria and source anchors. It does not store supervision or assistance conditions. The server preview supplies the existing formative-preview condition record and makes no evidence claim.</p>
      {candidate.assessments.map((task, index) => <fieldset key={`${task.id}:${task.variant}`} className="grid gap-2 rounded-lg bg-surface-elevated p-3">
        <legend className="px-1 text-sm font-medium">{task.id} · variant {task.variant}</legend>
        <label className="text-sm">Prompt<textarea className={field} value={task.prompt} onChange={(event) => onChange({ assessments: candidate.assessments.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.currentTarget.value } : item) })} /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={task.unseenContext} onChange={(event) => onChange({ assessments: candidate.assessments.map((item, itemIndex) => itemIndex === index ? { ...item, unseenContext: event.currentTarget.checked } : item) })} /> Unseen context</label>
        <p className="text-xs text-text-muted">Evaluator: {task.evaluator?.kind ?? 'not declared'} · rubric criteria: {task.criteria.join(', ') || 'none'} · {task.anchors.length} source anchors</p>
      </fieldset>)}
    </div>
  </section>;
}

function ReadOnlyReferences({ candidate }: { candidate: PetrosConceptPackCandidate }) {
  return <dl className="grid gap-2 rounded-lg bg-surface-elevated p-3 text-xs text-text-secondary sm:grid-cols-2">
    <div><dt className="font-semibold text-text-primary">Pack</dt><dd>{candidate.pack.id} · v{candidate.pack.version}</dd></div>
    <div><dt className="font-semibold text-text-primary">Subject</dt><dd>{candidate.subject}</dd></div>
    <div><dt className="font-semibold text-text-primary">Objective</dt><dd>{candidate.objective.id} · v{candidate.objective.version}</dd></div>
    <div><dt className="font-semibold text-text-primary">Curriculum</dt><dd>revision {candidate.curriculumRevision}</dd></div>
    <div className="sm:col-span-2"><dt className="font-semibold text-text-primary">Immutable source version</dt><dd className="break-all">{candidate.sourceVersion}</dd></div>
    <div className="sm:col-span-2"><dt className="font-semibold text-text-primary">Bound source locator identities</dt><dd>{candidate.concepts.reduce((count, item) => count + item.anchors.length, 0) + candidate.examples.reduce((count, item) => count + item.anchors.length, 0) + candidate.misconceptions.reduce((count, item) => count + item.anchors.length, 0) + candidate.assessments.reduce((count, item) => count + item.anchors.length, 0)} anchors · locator text remains within the exact cited source version.</dd></div>
  </dl>;
}
